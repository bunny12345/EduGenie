import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TechnicalSupport from './TechnicalSupport';
import SupportBubble from './SupportBubble';
import {
  askSupportBot, createSupportTicket, getSupportThread, listSupportTickets,
  replyToSupportTicket, setSupportTicketStatus,
} from '../api';

jest.mock('../api', () => ({
  askSupportBot: jest.fn(), createSupportTicket: jest.fn(), getSupportThread: jest.fn(),
  listSupportTickets: jest.fn(), replyToSupportTicket: jest.fn(),
  retrySupportNotification: jest.fn(), setSupportTicketStatus: jest.fn(),
}));
const ticket = { id: 'ticket-1', subject: 'Upload problem', category: 'glitch', status: 'open',
  requester_name: 'Test Student', requester_role: 'student', requester_id: 'student-id', school_id: 'school-id', class_name: 'Class 6' };
const originalCrypto = global.crypto;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: () => 'request-id' } });
  listSupportTickets.mockResolvedValue({ tickets: [], nextOffset: null });
  askSupportBot.mockResolvedValue({ reply: 'Open Homework from Academics.', suggestions: [], needsTechnician: false });
  createSupportTicket.mockResolvedValue({ ticket, notificationWarning: null });
  getSupportThread.mockResolvedValue({ ticket, messages: [{ id: 'm1', author_role: 'owner', content: 'Please try reopening Homework.' }] });
  replyToSupportTicket.mockResolvedValue({ success: true, notificationWarning: null });
  setSupportTicketStatus.mockResolvedValue({ success: true });
});
afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(global, 'crypto', { configurable: true, value: originalCrypto });
});

test('student bot answers operational questions and offers human escalation', async () => {
  render(<TechnicalSupport />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'How do I submit homework?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  expect(await screen.findByText('Open Homework from Academics.')).toBeInTheDocument();
  expect(askSupportBot).toHaveBeenCalledWith('How do I submit homework?', []);
  expect(screen.getByRole('button', { name: 'Connect to a technician' })).toBeInTheDocument();
  expect(createSupportTicket).not.toHaveBeenCalled();
});

test.each(['student', 'teacher', 'school_admin'])('bot sends recent user-only context for %s follow-ups', async (requesterRole) => {
  render(<TechnicalSupport requesterRole={requesterRole} />);
  const questions = ['How do I submit homework?', 'What if I sent the wrong file?', 'Can I edit it?', 'What if the window closed?', 'Who can help?', 'It still does not work'];
  for (const [index, question] of questions.entries()) {
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: question } });
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await waitFor(() => expect(askSupportBot).toHaveBeenNthCalledWith(index + 1, question, questions.slice(Math.max(0, index - 4), index)));
    await waitFor(() => expect(screen.getAllByText('Open Homework from Academics.')).toHaveLength(index + 1));
  }
});

test('unknown bot answer visibly offers a technician', async () => {
  askSupportBot.mockResolvedValue({ reply: 'I cannot guess.', needsTechnician: true, suggestions: [] });
  render(<TechnicalSupport />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Unknown operation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  expect(await screen.findByText(/Still need help/)).toBeInTheDocument();
});

test('issue report opens persistent technician chat and explicitly displays email failure', async () => {
  createSupportTicket.mockResolvedValue({ ticket, notificationWarning: 'Email was not delivered. Your request is saved.' });
  render(<TechnicalSupport />);
  fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
  fireEvent.change(screen.getByLabelText('Short title'), { target: { value: 'Upload problem' } });
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'My upload button does not respond' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to technician' }));
  expect(await screen.findByText('Please try reopening Homework.')).toBeInTheDocument();
  expect(screen.getByText(/Email was not delivered/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry email notification' })).toBeInTheDocument();
  expect(createSupportTicket).toHaveBeenCalledWith(expect.objectContaining({
    category: 'glitch', subject: 'Upload problem', description: 'My upload button does not respond',
  }));
  const body = createSupportTicket.mock.calls[0][0];
  expect(body.requester_id).toBeUndefined();
  expect(body.requester_role).toBeUndefined();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Thanks, I will try that' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(replyToSupportTicket).toHaveBeenCalledWith('ticket-1', { id: 'request-id', message: 'Thanks, I will try that' }, undefined));
});

test('owner inbox shows account role and supports replies and resolution using owner token', async () => {
  listSupportTickets.mockResolvedValue({ tickets: [ticket], nextOffset: null });
  render(<TechnicalSupport ownerToken="owner-mfa-token" onAuthError={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Upload problem/ }));
  expect(await screen.findByText('Please try reopening Homework.')).toBeInTheDocument();
  expect(screen.getByText(/Test Student · student · Class 6/, { selector: 'small' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'The upload issue has been fixed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(replyToSupportTicket).toHaveBeenCalledWith('ticket-1', expect.objectContaining({ message: 'The upload issue has been fixed' }), 'owner-mfa-token'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark resolved' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
  await waitFor(() => expect(setSupportTicketStatus).toHaveBeenCalledWith('ticket-1', 'resolved', 'owner-mfa-token'));
  expect(screen.queryByRole('button', { name: 'Report an issue' })).not.toBeInTheDocument();
});

test('failed report keeps the form available for retry without claiming success', async () => {
  createSupportTicket.mockRejectedValue(new Error('Could not save request'));
  render(<TechnicalSupport />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect to a technician' }));
  fireEvent.change(screen.getByLabelText('Short title'), { target: { value: 'Issue' } });
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Need help' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to technician' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save request');
  expect(screen.getByLabelText('What happened?')).toHaveValue('Need help');
});

test('expired owner inbox reports authentication failure to owner sign-out', async () => {
  const onAuthError = jest.fn();
  const error = new Error('Owner session expired');
  error.status = 401;
  listSupportTickets.mockRejectedValue(error);
  render(<TechnicalSupport ownerToken="expired-owner-token" onAuthError={onAuthError} />);
  await waitFor(() => expect(onAuthError).toHaveBeenCalledWith('Owner session expired'));
});

test('teacher assistant has teacher suggestions and correctly labels teacher reports', async () => {
  const teacherTicket = { ...ticket, requester_role: 'teacher', requester_name: 'Test Teacher' };
  askSupportBot.mockResolvedValue({ reply: 'Open Assign Homework on Teacher Home.', suggestions: [], needsTechnician: false });
  createSupportTicket.mockResolvedValue({ ticket: teacherTicket, notificationWarning: null });
  getSupportThread.mockResolvedValue({ ticket: teacherTicket, messages: [{ id: 'm2', author_role: 'teacher', content: 'Assignment button failed' }] });
  render(<TechnicalSupport requesterRole="teacher" />);
  expect(screen.getByRole('heading', { name: 'Teacher Support' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'How do I submit homework?' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'How do I assign homework?' }));
  expect(await screen.findByText('Open Assign Homework on Teacher Home.')).toBeInTheDocument();
  expect(screen.getByText('Teacher', { selector: 'strong' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
  fireEvent.change(screen.getByLabelText('Short title'), { target: { value: 'Assignment' } });
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Button failed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to technician' }));
  expect(await screen.findByText('Assignment button failed')).toBeInTheDocument();
  expect(screen.getByText('Teacher', { selector: 'strong' })).toBeInTheDocument();
  expect(createSupportTicket.mock.calls[0][0].requester_role).toBeUndefined();
});

test('owner inbox displays teacher authors instead of labelling them as bots', async () => {
  const teacherTicket = { ...ticket, requester_role: 'teacher', requester_name: 'Test Teacher' };
  listSupportTickets.mockResolvedValue({ tickets: [teacherTicket], nextOffset: null });
  getSupportThread.mockResolvedValue({ ticket: teacherTicket, messages: [{ id: 'm2', author_role: 'teacher', content: 'Teacher issue' }] });
  render(<TechnicalSupport ownerToken="owner-mfa-token" />);
  fireEvent.click(await screen.findByRole('button', { name: /Upload problem/ }));
  expect(await screen.findByText('Teacher issue')).toBeInTheDocument();
  expect(screen.getByText('Teacher', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText(/Test Teacher · teacher/, { selector: 'small' })).toBeInTheDocument();
});

test.each(['student', 'teacher', 'school_admin'])('resolved %s thread explains retention and clears deleted messages on refresh', async (requesterRole) => {
  jest.useFakeTimers();
  const resolvedTicket = { ...ticket, requester_role: requesterRole, status: 'resolved' };
  listSupportTickets.mockResolvedValue({ tickets: [resolvedTicket], nextOffset: null });
  getSupportThread.mockResolvedValue({
    ticket: resolvedTicket,
    messages: [{ id: 'm1', author_role: 'owner', content: 'Resolved conversation content' }],
  });
  const { unmount } = render(<TechnicalSupport requesterRole={requesterRole} />);
  fireEvent.click(await screen.findByRole('button', { name: /Upload problem/ }));
  expect(await screen.findByText(/automatically deleted 48 hours after resolution/)).toBeInTheDocument();
  expect(screen.getByText('Resolved conversation content')).toBeInTheDocument();
  const error = new Error('Support request not found.');
  error.status = 404;
  getSupportThread.mockRejectedValue(error);
  expect(screen.queryByRole('button', { name: /refresh|check replies/i })).not.toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(await screen.findByRole('alert')).toHaveTextContent('Support request not found.');
  expect(screen.queryByText('Resolved conversation content')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Cannot send to a deleted request' } });
  expect(screen.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  getSupportThread.mockResolvedValue({ ticket: resolvedTicket, messages: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  unmount();
});

test('floating teacher support opens and closes an accessible modal and resets bot chat', async () => {
  const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  const showModal = jest.fn(function () { this.setAttribute('open', ''); });
  const close = jest.fn(function () { this.removeAttribute('open'); });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  try {
    render(<SupportBubble />);
    const launcher = screen.getByRole('button', { name: 'Open teacher support' });
    fireEvent.click(launcher);
    expect(screen.getByRole('dialog', { name: 'Teacher support' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How do I assign homework?' }));
    expect(await screen.findByText('Open Homework from Academics.')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Teacher support' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
    fireEvent.click(launcher);
    expect(screen.queryByText('Open Homework from Academics.')).not.toBeInTheDocument();
    expect(showModal).toHaveBeenCalledTimes(2);
    await screen.findByText('Your reports and technician chats appear here.');
    fireEvent.click(screen.getByRole('button', { name: 'Close teacher support' }));
  } finally {
    if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
    else delete HTMLDialogElement.prototype.showModal;
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else delete HTMLDialogElement.prototype.close;
  }
});

test('school help has school suggestions and saves reports with correctly labelled messages', async () => {
  const schoolTicket = { ...ticket, requester_role: 'school_admin', requester_name: 'Test School', class_name: '' };
  askSupportBot.mockResolvedValue({ reply: 'Open Teacher Registration in the school sidebar.', suggestions: [], needsTechnician: false });
  createSupportTicket.mockResolvedValue({ ticket: schoolTicket, notificationWarning: 'Email was not delivered. Your request is saved.' });
  getSupportThread.mockResolvedValue({ ticket: schoolTicket, messages: [
    { id: 's1', author_role: 'school_admin', content: 'Registration button failed' },
    { id: 's2', author_role: 'owner', content: 'Please try the registration again.' },
  ] });
  render(<TechnicalSupport requesterRole="school_admin" />);
  expect(screen.getByRole('heading', { name: 'School Support' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'How do I assign homework?' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'How do I register a teacher?' }));
  expect(await screen.findByText('Open Teacher Registration in the school sidebar.')).toBeInTheDocument();
  expect(screen.getByText('School administrator', { selector: 'strong' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
  fireEvent.change(screen.getByLabelText('Short title'), { target: { value: 'Registration issue' } });
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Button failed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to technician' }));
  expect(await screen.findByText('Registration button failed')).toBeInTheDocument();
  expect(screen.getByText('School administrator', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText('Please try the registration again.')).toBeInTheDocument();
  expect(screen.getByText('Email was not delivered. Your request is saved.')).toBeInTheDocument();
  expect(createSupportTicket.mock.calls[0][0].requester_role).toBeUndefined();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Thank you' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(replyToSupportTicket).toHaveBeenCalledWith('ticket-1', expect.objectContaining({ message: 'Thank you' }), undefined));
});

test('owner inbox correctly labels school administrators and shows verified school identity', async () => {
  const schoolTicket = { ...ticket, requester_role: 'school_admin', requester_name: 'Test School', class_name: '' };
  listSupportTickets.mockResolvedValue({ tickets: [schoolTicket], nextOffset: null });
  getSupportThread.mockResolvedValue({ ticket: schoolTicket, messages: [{ id: 's1', author_role: 'school_admin', content: 'School issue' }] });
  render(<TechnicalSupport ownerToken="owner-mfa-token" />);
  fireEvent.click(await screen.findByRole('button', { name: /Upload problem/ }));
  expect(await screen.findByText('School issue')).toBeInTheDocument();
  expect(screen.getByText('School administrator', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText(/Test School · school_admin/, { selector: 'small' })).toBeInTheDocument();
});

test('school floating bubble uses school labels and opens the shared support panel', async () => {
  const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.removeAttribute('open'); } });
  const view = render(<SupportBubble requesterRole="school_admin" />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Open school support' }));
    expect(screen.getByRole('dialog', { name: 'School support' })).toBeInTheDocument();
    expect(await screen.findByText('Your reports and technician chats appear here.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How do I upload curriculum?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close school support' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  } finally {
    view.unmount();
    if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
    else delete HTMLDialogElement.prototype.showModal;
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else delete HTMLDialogElement.prototype.close;
  }
});
