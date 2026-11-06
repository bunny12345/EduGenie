import { getSupportThread, listSupportTickets, replyToSupportTicket, setRuntimeDevToken } from './api';

jest.mock('./supabaseClient', () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }));
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn();
  setRuntimeDevToken('student-portal-token');
});
afterEach(() => { global.fetch = originalFetch; setRuntimeDevToken(''); });

test('student support uses portal authentication and never submits a client account identity', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  await replyToSupportTicket('request-id', { id: 'message-id', message: 'Upload is broken' });
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/support/tickets/request-id/messages'), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer student-portal-token' }),
    body: JSON.stringify({ id: 'message-id', message: 'Upload is broken' }),
  }));
});

test('owner support uses explicit MFA token and distinct owner routes', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, tickets: [], nextOffset: null }) });
  await listSupportTickets(50, 'owner-mfa-token');
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/owner/support/tickets?offset=50'), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer owner-mfa-token' }),
  }));
});

test('thread pagination includes the full conversation without truncating older replies', async () => {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, ticket: { id: 'request-id' }, messages: [{ id: 'first' }], nextOffset: 100 }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, ticket: { id: 'request-id' }, messages: [{ id: 'latest' }], nextOffset: null }) });
  const result = await getSupportThread('request-id');
  expect(result.messages).toEqual([{ id: 'first' }, { id: 'latest' }]);
  expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('offset=100'), expect.any(Object));
});

test('support setup errors stay visible rather than appearing as successful reports', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'Support tickets are not configured.', error: 'Service Unavailable' }) });
  await expect(listSupportTickets()).rejects.toMatchObject({ status: 503, message: 'Support tickets are not configured.' });
});
