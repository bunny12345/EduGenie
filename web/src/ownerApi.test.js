import { getOwnerAccess, schoolRegisterRequestOtp, schoolRegisterVerifyOtp, setRuntimeDevToken } from './api';

jest.mock('./supabaseClient', () => ({ auth: {} }));

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ success: true }),
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  setRuntimeDevToken('');
});

test('owner requests use only their explicit token, not portal or development tokens', async () => {
  setRuntimeDevToken('ordinary-portal-token');
  await expect(schoolRegisterRequestOtp({ email: 'school@example.test' })).rejects.toThrow('Owner sign-in required.');
  expect(global.fetch).not.toHaveBeenCalled();
  await schoolRegisterRequestOtp({ email: 'school@example.test' }, 'owner-mfa-token');
  expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('/auth/school/register/request-otp'), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer owner-mfa-token' }),
  }));
  await schoolRegisterVerifyOtp('school@example.test', '123456', 'owner-mfa-token');
  expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('/auth/school/register/verify-otp'), expect.objectContaining({
    body: JSON.stringify({ email: 'school@example.test', otp: '123456' }),
    headers: expect.objectContaining({ Authorization: 'Bearer owner-mfa-token' }),
  }));
});

test('owner API preserves authorization failures for the login screen', async () => {
  global.fetch.mockResolvedValue({
    ok: false, status: 403, json: async () => ({ message: 'Verify MFA first.' }),
  });
  await expect(getOwnerAccess('password-only-token')).rejects.toMatchObject({
    status: 403, message: 'Verify MFA first.',
  });
});

test('owner API displays the actionable Nest error message instead of its generic status label', async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({
      statusCode: 503,
      message: 'Owner access is not configured. Contact the site operator.',
      error: 'Service Unavailable',
    }),
  });
  await expect(getOwnerAccess('owner-token')).rejects.toMatchObject({
    status: 503,
    message: 'Owner access is not configured. Contact the site operator.',
  });
});
