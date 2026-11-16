import {
  getOwnerAccess, schoolRegisterRequestOtp, schoolRegisterVerifyOtp, setRuntimeDevToken,
  requestRegistrationPhoneCode, verifyRegistrationPhoneCode, requestRegistrationEmailCode, schoolRegisterStudent
} from './api';

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

test.each([
  [requestRegistrationPhoneCode, 503, 'SMS verification is not configured. Please contact your administrator.', 'Service Unavailable'],
  [verifyRegistrationPhoneCode, 400, 'The code is incorrect, expired or used. Please request a new code.', 'Bad Request'],
  [requestRegistrationEmailCode, 503, 'Email verification is not configured. Please contact your administrator.', 'Service Unavailable'],
])('registration shows the specific backend error rather than its HTTP label (%#)', async (request, status, message, error) => {
  setRuntimeDevToken('school-portal-token');
  global.fetch.mockResolvedValue({
    ok: false, status, json: async () => ({ statusCode: status, message, error }),
  });
  await expect(request({})).rejects.toThrow(message);
});

test('registration still displays business errors returned in success-false envelopes', async () => {
  setRuntimeDevToken('school-portal-token');
  global.fetch.mockResolvedValue({
    ok: true, status: 200, json: async () => ({ success: false, error: 'Login ID already exists' }),
  });
  await expect(schoolRegisterStudent({})).rejects.toThrow('Login ID already exists');
});
