import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WelcomeAssistant from './WelcomeAssistant';
import SchoolEnquiriesInbox from './SchoolEnquiriesInbox';
import {
  askVisitorBot, requestEnquiryCode, verifyEnquiryCode, getSchoolEnquiry,
  replySchoolEnquiry, retryEnquiryNotification, listSchoolEnquiries, setSchoolEnquiryStatus
} from '../api';

jest.mock('../api', () => ({
  askVisitorBot: jest.fn(), requestEnquiryCode: jest.fn(), verifyEnquiryCode: jest.fn(),
  getSchoolEnquiry: jest.fn(), replySchoolEnquiry: jest.fn(), retryEnquiryNotification: jest.fn(),
  listSchoolEnquiries: jest.fn(), setSchoolEnquiryStatus: jest.fn()
}));
const enquiry = { id: 'enquiry-1', name: 'School Leader', school_name: 'Example School', email: 'school@example.test', status: 'open' };
const thread = { enquiry, messages: [
  { id: 'message-1', author_role: 'visitor', content: 'Please show us a demo', created_at: '2026-11-08T08:00:00Z' },
  { id: 'message-2', author_role: 'owner', content: 'Happy to discuss your school setup', created_at: '2026-11-08T08:01:00Z' }
], nextOffset: null };
const showModal = HTMLDialogElement.prototype.showModal;
const close = HTMLDialogElement.prototype.close;
const originalCrypto = global.crypto;
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.removeItem('AcademiX.enquiry');
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: () => 'message-retry-id' } });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  askVisitorBot.mockResolvedValue({ success: true, reply: 'Your school name and logo can be part of onboarding.', handoff: false });
  requestEnquiryCode.mockResolvedValue({ success: true, challengeId: 'challenge-1' });
  verifyEnquiryCode.mockResolvedValue({ success: true, token: 'private-chat-token', enquiry, notificationWarning: null });
  getSchoolEnquiry.mockResolvedValue(thread);
  replySchoolEnquiry.mockResolvedValue({ success: true, notificationWarning: null });
  retryEnquiryNotification.mockResolvedValue({ success: true, notificationWarning: null });
  listSchoolEnquiries.mockResolvedValue({ success: true, enquiries: [enquiry], nextOffset: null });
  setSchoolEnquiryStatus.mockResolvedValue({ success: true });
});
afterEach(() => {
  Object.defineProperty(global, 'crypto', { configurable: true, value: originalCrypto });
  localStorage.removeItem('AcademiX.enquiry');
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Open AcademiX welcome assistant' }));
}
async function fillEnquiry() {
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  for (const [label, value] of [
    ['Your name', 'School Leader'], ['School name', 'Example School'],
    ['Work email', 'school@example.test'], ['How can we help your school?', 'Please show us a demo']
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Verify email & connect' }));
  await screen.findByLabelText('Email verification code');
}
async function verify() {
  fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify & send enquiry' }));
  await screen.findByText('Happy to discuss your school setup');
}

test('launcher introduces the AI tutor and has accessible close, Escape and focus restoration', async () => {
  const { unmount } = render(<WelcomeAssistant />);
  const launcher = screen.getByRole('button', { name: 'Open AcademiX welcome assistant' });
  launcher.focus();
  open();
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Your school.*AI tutor/);
  expect(screen.getByText(/Welcome to AcademiX/)).toHaveTextContent('personal AI tutor');
  expect(screen.getByRole('button', { name: 'Your school name & logo' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  expect(askVisitorBot).not.toHaveBeenCalled();
  unmount();
});

test('feature chips and free-text questions call the public bot without login', async () => {
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Your school name & logo' }));
  expect(await screen.findByText('Your school name and logo can be part of onboarding.')).toBeInTheDocument();
  expect(askVisitorBot).toHaveBeenCalledWith('Your school name & logo');
  askVisitorBot.mockResolvedValueOnce({ reply: 'Please talk to our admin for that detail.', handoff: true });
  fireEvent.change(screen.getByLabelText('Ask about AcademiX'), { target: { value: 'Can you build a custom feature?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(await screen.findByText('Please talk to our admin for that detail.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Talk to admin/ })).toHaveLength(2);
});

test('contact requires consent and email verification, then saves only private chat access in browser', async () => {
  render(<WelcomeAssistant />);
  open();
  await fillEnquiry();
  expect(requestEnquiryCode).toHaveBeenCalledWith({
    name: 'School Leader', schoolName: 'Example School', email: 'school@example.test', message: 'Please show us a demo', consent: true, whatsappNumber: '', whatsappConsent: false
  });
  expect(verifyEnquiryCode).not.toHaveBeenCalled();
  expect(getSchoolEnquiry).not.toHaveBeenCalled();
  await verify();
  expect(verifyEnquiryCode).toHaveBeenCalledWith({ challengeId: 'challenge-1', code: '123456' });
  expect(JSON.parse(localStorage.getItem('AcademiX.enquiry'))).toEqual({ id: 'enquiry-1', token: 'private-chat-token' });
  expect(getSchoolEnquiry).toHaveBeenCalledWith('enquiry-1', 'private-chat-token', false, 0, expect.any(AbortSignal));
  expect(screen.getByText(/Email replies are not imported/)).toBeInTheDocument();
});

test('failed code delivery stays on the form and does not claim success', async () => {
  requestEnquiryCode.mockRejectedValueOnce(new Error('Email could not be delivered'));
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText('School name'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'a@example.test' } });
  fireEvent.change(screen.getByLabelText('How can we help your school?'), { target: { value: 'Demo' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Verify email & connect' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email could not be delivered');
  expect(screen.queryByLabelText('Email verification code')).not.toBeInTheDocument();
  expect(verifyEnquiryCode).not.toHaveBeenCalled();
});

test('invalid verification code remains available for retry or requesting a new code', async () => {
  verifyEnquiryCode.mockRejectedValueOnce(new Error('The code is incorrect or expired'));
  render(<WelcomeAssistant />);
  open();
  await fillEnquiry();
  fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '111111' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify & send enquiry' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect or expired/);
  expect(localStorage.getItem('AcademiX.enquiry')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Change details/ }));
  expect(screen.getByLabelText('School name')).toHaveValue('Example School');
});

test('saved chat restores after reopening, and notification failure has an explicit retry', async () => {
  verifyEnquiryCode.mockResolvedValueOnce({ token: 'private-chat-token', enquiry, notificationWarning: 'Saved, but email was not delivered.' });
  const { unmount } = render(<WelcomeAssistant />);
  open();
  await fillEnquiry();
  await verify();
  expect(screen.getByText('Saved, but email was not delivered.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry email notification' }));
  await waitFor(() => expect(retryEnquiryNotification).toHaveBeenCalledWith('enquiry-1', 'private-chat-token'));
  fireEvent.click(screen.getByRole('button', { name: 'Close welcome assistant' }));
  open();
  expect(await screen.findByText('Happy to discuss your school setup')).toBeInTheDocument();
  unmount();
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  expect(await screen.findByText('Happy to discuss your school setup')).toBeInTheDocument();
});

test('a failed follow-up retries with the same message ID and keeps draft text', async () => {
  localStorage.setItem('AcademiX.enquiry', JSON.stringify({ id: enquiry.id, token: 'private-chat-token' }));
  replySchoolEnquiry.mockRejectedValueOnce(new Error('Connection interrupted'));
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  await screen.findByText('Happy to discuss your school setup');
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'What is the next step?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(screen.getByLabelText('Your message')).toHaveValue('What is the next step?');
  const first = replySchoolEnquiry.mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(replySchoolEnquiry).toHaveBeenCalledTimes(2));
  expect(replySchoolEnquiry.mock.calls[1][1]).toEqual(first);
  await waitFor(() => expect(screen.getByLabelText('Your message')).toHaveValue(''));
});

test('owner inbox uses MFA token, fetches all thread pages and toggles a selected enquiry closed', async () => {
  getSchoolEnquiry.mockImplementation(async (id, token, owner, offset) =>
    offset === 0 ? { ...thread, messages: [thread.messages[0]], nextOffset: 100 } : { ...thread, messages: [thread.messages[1]], nextOffset: null });
  render(<SchoolEnquiriesInbox token="owner-mfa" onAuthError={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Example School/ }));
  expect(await screen.findByText('Happy to discuss your school setup')).toBeInTheDocument();
  expect(getSchoolEnquiry).toHaveBeenCalledWith('enquiry-1', 'owner-mfa', true, 100, expect.any(AbortSignal));
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Welcome to AcademiX' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(replySchoolEnquiry).toHaveBeenCalledWith('enquiry-1', expect.objectContaining({ message: 'Welcome to AcademiX' }), 'owner-mfa', true));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark resolved' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
  await waitFor(() => expect(setSchoolEnquiryStatus).toHaveBeenCalledWith('enquiry-1', 'resolved', 'owner-mfa'));
  fireEvent.click(screen.getByRole('button', { name: /Example School/ }));
  expect(screen.queryByText('Happy to discuss your school setup')).not.toBeInTheDocument();
});

test('owner auth errors are surfaced and delegated to session handling', async () => {
  const expired = new Error('Owner MFA required');
  expired.status = 403;
  listSchoolEnquiries.mockRejectedValueOnce(expired);
  const onAuthError = jest.fn();
  render(<SchoolEnquiriesInbox token="expired" onAuthError={onAuthError} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Owner MFA required');
  expect(onAuthError).toHaveBeenCalledWith('Owner MFA required');
});

test('late bot responses after unmount do not resurrect the login assistant', async () => {
  let resolveReply;
  askVisitorBot.mockReturnValueOnce(new Promise((resolve) => { resolveReply = resolve; }));
  const { unmount } = render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Explore all features' }));
  unmount();
  await act(async () => resolveReply({ reply: 'Late reply' }));
  expect(screen.queryByText('Late reply')).not.toBeInTheDocument();
});

test('unsupported secure messaging surfaces an error instead of losing the message', async () => {
  localStorage.setItem('AcademiX.enquiry', JSON.stringify({ id: enquiry.id, token: 'private-chat-token' }));
  Object.defineProperty(global, 'crypto', { configurable: true, value: {} });
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  await screen.findByText('Happy to discuss your school setup');
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Please contact me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('requires HTTPS');
  expect(screen.getByLabelText('Your message')).toHaveValue('Please contact me');
  expect(replySchoolEnquiry).not.toHaveBeenCalled();
});

test('WhatsApp contact is optional and clearing the number removes its consent', async () => {
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  const number = screen.getByLabelText('WhatsApp number (optional)');
  expect(number).not.toBeRequired();
  expect(screen.getByLabelText('Country code')).toHaveValue('IN');
  fireEvent.change(number, { target: { value: '98765 43210' } });
  const permission = screen.getByRole('checkbox', { name: /contact me.*WhatsApp/ });
  expect(permission).toBeRequired();
  expect(permission).not.toBeChecked();
  fireEvent.click(permission);
  fireEvent.change(number, { target: { value: '' } });
  expect(screen.queryByRole('checkbox', { name: /contact me.*WhatsApp/ })).not.toBeInTheDocument();
  fireEvent.change(number, { target: { value: '98765 43210' } });
  expect(screen.getByRole('checkbox', { name: /contact me.*WhatsApp/ })).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: /contact me.*WhatsApp/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Verify email & connect' }));
  await waitFor(() => expect(requestEnquiryCode).toHaveBeenCalledWith(expect.objectContaining({ whatsappNumber: '+919876543210', whatsappCountry: 'IN', whatsappConsent: true })));
});

test.each([
  ['IN', '987654321', /valid mobile number/],
  ['IN', '98765432100', /valid mobile number/],
  ['IN', '1111111111', /valid mobile number/],
  ['US', '202555012', /Not enough digits/],
  ['AE', '50123456', /valid mobile number/],
  ['GB', '0740012345678', /Too many digits/],
  ['CA', '2025550123', /valid mobile number/],
  ['IN', '+919876543210', /Select the country code separately/],
  ['IN', '98765abc10', /Select the country code separately/]
])('rejects invalid %s number %s before sending a verification request', (country, value, error) => {
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  fireEvent.change(screen.getByLabelText('Country code'), { target: { value: country } });
  const number = screen.getByLabelText('WhatsApp number (optional)');
  fireEvent.change(number, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email & connect' }));
  expect(screen.getByRole('alert')).toHaveTextContent(error);
  expect(number).toHaveAttribute('aria-invalid', 'true');
  expect(number).toHaveFocus();
  expect(requestEnquiryCode).not.toHaveBeenCalled();
});

test.each([
  ['IN', '98765 43210', '+919876543210'],
  ['US', '(202) 555-0123', '+12025550123'],
  ['CA', '4165550123', '+14165550123'],
  ['GB', '07400 123456', '+447400123456'],
  ['AE', '050 123 4567', '+971501234567'],
  ['DE', '01512 3456789', '+4915123456789']
])('normalizes a valid %s national number %s to %s', async (country, value, normalized) => {
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  fireEvent.change(screen.getByLabelText('Country code'), { target: { value: country } });
  fireEvent.change(screen.getByLabelText('WhatsApp number (optional)'), { target: { value } });
  fireEvent.click(screen.getByRole('checkbox', { name: /contact me.*WhatsApp/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Verify email & connect' }));
  await waitFor(() => expect(requestEnquiryCode).toHaveBeenCalledWith(expect.objectContaining({
    whatsappNumber: normalized, whatsappCountry: country, whatsappConsent: true
  })));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('changing country revalidates the number and correcting or clearing it removes the error', () => {
  render(<WelcomeAssistant />);
  open();
  fireEvent.click(screen.getByRole('button', { name: /Talk to admin/ }));
  const number = screen.getByLabelText('WhatsApp number (optional)');
  fireEvent.change(number, { target: { value: '9876543210' } });
  fireEvent.blur(number);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'AE' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/valid mobile number/);
  fireEvent.change(number, { target: { value: '501234567' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.change(number, { target: { value: '123' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/Not enough digits/);
  fireEvent.change(number, { target: { value: '' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('owner can open WhatsApp only for explicitly provided, valid enquiry numbers', async () => {
  getSchoolEnquiry.mockResolvedValue({ ...thread, enquiry: { ...enquiry, whatsapp_number: '+919876543210' } });
  render(<SchoolEnquiriesInbox token="owner-mfa" onAuthError={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Example School/ }));
  const link = await screen.findByRole('link', { name: /Contact on WhatsApp/ });
  expect(link).toHaveAttribute('href', 'https://wa.me/919876543210');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByText(/number not verified/)).toBeInTheDocument();
});
