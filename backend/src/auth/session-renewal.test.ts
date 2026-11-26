import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign, verify, JwtPayload } from 'jsonwebtoken';
import { AuthController } from '../controllers/auth.controller';
import { SupabaseService } from '../supabase.service';
import { ExamControlService } from '../exams/exam-control.service';
import { AuthGuard } from './auth.guard';
import { StudentAuthService } from './student-auth.service';
import { RegistrationPhoneService } from './registration-phone.service';
import { PasswordResetService } from './password-reset.service';
import { OwnerAuthService } from './owner-auth.service';

test('session renewal only accepts valid portal tokens and issues 48-hour tokens', async (t) => {
  const previous = process.env.SUPABASE_JWT_SECRET;
  const secret = 'fixture-session-renewal-key';
  process.env.SUPABASE_JWT_SECRET = secret;
  t.after(() => {
    if (previous === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = previous;
  });
  const db = Object.create(SupabaseService.prototype) as SupabaseService;
  db.client = { isMock: true } as SupabaseService['client'];
  const auth = Object.create(StudentAuthService.prototype) as StudentAuthService;
  @Module({
    controllers: [AuthController],
    providers: [
      AuthGuard,
      { provide: SupabaseService, useValue: db },
      { provide: StudentAuthService, useValue: auth },
      { provide: ExamControlService, useValue: {} },
      { provide: RegistrationPhoneService, useValue: {} },
      { provide: PasswordResetService, useValue: {} },
      { provide: OwnerAuthService, useValue: {} },
    ],
  })
  class SessionTestModule {}
  const app = await NestFactory.create(SessionTestModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const refresh = (token?: string) => fetch(`${base}/auth/session/refresh`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  for (const role of ['student', 'teacher', 'school_admin']) {
    const old = sign({ sub: `${role}-1`, role, ...(role === 'student' ? {} : { schoolId: 'school-1' }) }, secret, { expiresIn: '12h' });
    const response = await refresh(old);
    assert.equal(response.status, 201);
    const body = await response.json() as { success: boolean; token: string };
    assert.equal(body.success, true);
    const payload = verify(body.token, secret) as JwtPayload;
    assert.equal(payload.sub, `${role}-1`);
    assert.equal(payload.role, role);
    assert.equal(payload.exp! - payload.iat!, 48 * 60 * 60);
    if (role !== 'student') assert.equal(payload.schoolId, 'school-1');
  }
  assert.equal((await refresh()).status, 401);
  assert.equal((await refresh(sign({ sub: 's', role: 'student' }, secret, { expiresIn: -1 }))).status, 401);
  assert.equal((await refresh(sign({ sub: 's', role: 'student' }, 'wrong-key', { expiresIn: '1h' }))).status, 401);
  assert.equal((await refresh(sign({ sub: 's', role: 'owner' }, secret, { expiresIn: '1h' }))).status, 401);
});
