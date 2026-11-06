import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TechnicalSupport from './TechnicalSupport';
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
afterEach(() => { Object.defineProperty(global, 'crypto', { configurable: true, value: originalCrypto }); });

test('student bot answers operational questions and offers human escalation', async () => {
  render(<TechnicalSupport />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'How do I submit homework?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  expect(await screen.findByText('Open Homework from Academics.')).toBeInTheDocument();
  expect(askSupportBot).toHaveBeenCalledWith('How do I submit homework?');
  expect(screen.getByRole('button', { name: 'Connect to a technician' })).toBeInTheDocument();
  expect(createSupportTicket).not.toHaveBeenCalled();
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
