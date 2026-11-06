import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import { AuthController } from '../controllers/auth.controller';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerGuard, OwnerIdentityGuard } from './owner.guard';
import { StudentAuthService } from './student-auth.service';

function envelope(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON response object');
  return Object.fromEntries(Object.entries(value));
}

test('school registration requires the configured Supabase owner and verified TOTP', async (t) => {
  const saved = { ...process.env };
  t.after(() => {
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'OWNER_SUPABASE_USER_ID']) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
  process.env.SUPABASE_URL = 'https://owner-auth.example.test';
  process.env.SUPABASE_ANON_KEY = 'test-public-key';
  process.env.OWNER_SUPABASE_USER_ID = 'owner-id';
  const ownerAuth = new OwnerAuthService();
  const acceptedTokens = new Map<string, { id: string; factors: Array<{ factor_type: string; status: string }> }>();
  const verifiedFactors = [{ factor_type: 'totp', status: 'verified' }];
  const tokenFor = (id: string, aal: string, factors = verifiedFactors, issuer = `${process.env.SUPABASE_URL}/auth/v1`) => {
    const token = sign({ sub: id, aal, role: 'authenticated', iss: issuer, jti: String(acceptedTokens.size) }, 'test-only-signing-key', { expiresIn: '5m' });
    acceptedTokens.set(token, { id, factors });
    return token;
  };
  const ownerMfa = tokenFor('owner-id', 'aal2');
  const ownerPasswordOnly = tokenFor('owner-id', 'aal1');
  const otherUser = tokenFor('school-admin-id', 'aal2');
  const removedFactor = tokenFor('owner-id', 'aal2', []);
  const legacyIssuer = tokenFor('owner-id', 'aal2', verifiedFactors, 'legacy-development-token');
  Object.defineProperty(ownerAuth, 'client', { value: {
    auth: { getUser: async (token: string) => ({
      data: { user: acceptedTokens.get(token) || null },
      error: acceptedTokens.has(token) ? null : new Error('Rejected by Supabase'),
    }) },
  } });
  let registrations = 0;
  const schoolResult = () => {
    registrations += 1;
    return { ok: true, token: 'school-token-must-not-leak', school: { id: 'new-school', schoolName: 'Test school' } };
  };
  @Module({
    controllers: [AuthController],
    providers: [
      OwnerGuard, OwnerIdentityGuard,
      { provide: OwnerAuthService, useValue: ownerAuth },
      { provide: StudentAuthService, useValue: {
        registerSchool: schoolResult,
        requestSchoolRegistrationOtp: schoolResult,
        verifySchoolRegistrationOtp: schoolResult,
        loginSchool: async () => ({ ok: true, token: 'normal-school-token' }),
      } },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const request = (path: string, token?: string, method = 'POST') => fetch(`${base}/auth/${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  for (const path of ['school/register', 'school/register/request-otp', 'school/register/verify-otp']) {
    await t.test(`${path} denies missing, forged, non-owner and non-MFA tokens`, async () => {
      for (const [token, expected] of [
        [undefined, 401], ['forged-token', 401], [otherUser, 403],
        [ownerPasswordOnly, 403], [removedFactor, 403], [legacyIssuer, 401],
      ] as const) {
        assert.equal((await request(path, token)).status, expected);
      }
      assert.equal(registrations, 0);
    });
  }
  await t.test('missing owner configuration fails closed', async () => {
    delete process.env.OWNER_SUPABASE_USER_ID;
    assert.equal((await request('school/register', ownerMfa)).status, 503);
    process.env.OWNER_SUPABASE_USER_ID = 'owner-id';
  });
  await t.test('owner password session can bootstrap MFA but other accounts cannot', async () => {
    const response = await request('owner/access', ownerPasswordOnly, 'GET');
    assert.equal(response.status, 200);
    assert.equal(envelope(await response.json()).mfaVerified, false);
    assert.equal((await request('owner/access', otherUser, 'GET')).status, 403);
  });
  await t.test('MFA owner can register without receiving a school login token', async () => {
    for (const path of ['school/register', 'school/register/request-otp', 'school/register/verify-otp']) {
      const response = await request(path, ownerMfa);
      assert.equal(response.status, 201);
      const body = envelope(await response.json());
      assert.equal(body.success, true);
      assert.equal(body.token, undefined);
    }
    assert.equal(registrations, 3);
  });
  await t.test('school login remains public and still returns its token', async () => {
    const response = await request('school/login');
    assert.equal(response.status, 201);
    assert.equal(envelope(await response.json()).token, 'normal-school-token');
  });
});
