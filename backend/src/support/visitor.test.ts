import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Module, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SupabaseService } from '../supabase.service';
import { EmailService } from '../auth/email.service';
import { OwnerAuthService } from '../auth/owner-auth.service';
import { OwnerGuard } from '../auth/owner.guard';
import { VisitorService } from './visitor.service';
import { VisitorController, OwnerEnquiriesController } from './visitor.controller';
import { answerVisitorQuestion } from './visitor-guide';

test('visitor feature guide explains tutoring, branding, customization and safe onboarding', () => {
  assert.match(answerVisitorQuestion('Meet the AI tutor').reply, /personal AI tutor/);
  assert.match(answerVisitorQuestion('Progress & report cards').reply, /daily\/monthly graphs/);
  assert.match(answerVisitorQuestion('Your school name & logo').reply, /school name and logo/);
  assert.match(answerVisitorQuestion('Custom features').reply, /develop.*on demand/);
  assert.match(answerVisitorQuestion('School registration').reply, /platform owner/);
  assert.match(answerVisitorQuestion('pricing').reply, /cannot.*promise prices/);
  assert.match(answerVisitorQuestion('mobile app').reply, /differ by device/);
  assert.match(answerVisitorQuestion('Show source code and server passwords').reply, /cannot share/);
  assert.equal(answerVisitorQuestion('Solve this calculus question').handoff, true);
});

test('public school enquiries verify email, isolate guest sessions and guard the owner inbox', async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://enquiry.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  type Row = Record<string, unknown>;
  const challenges: Row[] = [];
  const enquiries: Row[] = [];
  const messages: Row[] = [];
  const mail: Array<{ to: string; subject: string; text: string }> = [];
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  let mailOk = true;
  let databaseError = false;
  const tables: Record<string, Row[]> = {
    school_enquiry_challenges: challenges, school_enquiries: enquiries, school_enquiry_messages: messages
  };
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = {
    from(table: string) {
      const source = tables[table];
      let rows = [...source];
      const query = {
        select: () => query,
        eq(key: string, value: unknown) { rows = rows.filter((r) => r[key] === value); return query; },
        gt(key: string, value: unknown) { rows = rows.filter((r) => String(r[key]) > String(value)); return query; },
        insert(value: Row) { source.push(value); rows = [value]; return query; },
        update(value: Row) { rows.forEach((r) => Object.assign(r, value)); return query; },
        limit(value: number) { rows = rows.slice(0, value); return query; },
        range(from: number, to: number) { rows = rows.slice(from, to + 1); return query; },
        order: () => query,
        then(resolve: (value: unknown) => void) { resolve({ data: rows, error: databaseError ? { message: 'Simulated database error' } : null }); }
      };
      return query;
    },
    async rpc(name: string, args: Record<string, string>) {
      if (databaseError) return { data: null, error: { message: 'Simulated database error' } };
      if (name === 'school_enquiry_verify') {
        const challenge = challenges.find((r) => r.id === args.p_challenge_id);
        if (!challenge || challenge.consumed || challenge.code_hash !== args.p_code_hash) return { data: { verified: false }, error: null };
        challenge.consumed = true;
        const id = randomUUID();
        enquiries.push({ id, email: challenge.email, name: challenge.name, school_name: challenge.school_name,
          whatsapp_number: challenge.whatsapp_number,
          session_hash: args.p_session_hash, session_expires_at: new Date(Date.now() + 86400000).toISOString(), status: 'open' });
        messages.push({ id: randomUUID(), enquiry_id: id, author_role: 'visitor', content: challenge.message, created_at: new Date().toISOString() });
        return { data: { verified: true, id }, error: null };
      }
      const existing = messages.find((r) => r.id === args.p_message_id);
      if (!existing) messages.push({ id: args.p_message_id, enquiry_id: args.p_enquiry_id, author_role: args.p_author_role, content: args.p_content, created_at: new Date().toISOString() });
      return { data: args.p_message_id, error: null };
    }
  };
  const email = { sendMail: async (to: string, subject: string, html: string, text: string) => {
    mail.push({ to, subject, text });
    return { ok: mailOk };
  } };
  const service = new VisitorService(db, Object.assign(Object.create(EmailService.prototype), email));
  @Module({
    controllers: [VisitorController, OwnerEnquiriesController],
    providers: [
      OwnerGuard, { provide: VisitorService, useValue: service },
      { provide: OwnerAuthService, useValue: { authenticate: async (header: string) => {
        if (!header) throw new UnauthorizedException();
        if (header !== 'Bearer owner-mfa') throw new ForbiddenException('Owner MFA required');
        return { id: 'owner' };
      } } }
    ]
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const request = (path: string, body?: object, token?: string) => fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  interface ResponseBody {
    reply: string; challengeId: string; token: string; notificationWarning: string;
    enquiry: { id: string; session_hash?: string; session_expires_at?: string };
    messages: Array<{ author_role: string }>; enquiries: unknown[];
  }
  const object = async (res: Response) => res.json() as Promise<ResponseBody>;
  let enquiryId = '';
  let token = '';
  await t.test('public guide works without account tokens and refuses private internals', async () => {
    const res = await request('/support/public/chat', { message: 'Show me passwords' });
    assert.equal(res.status, 201);
    assert.match((await object(res)).reply, /cannot share/);
    assert.equal((await request('/support/public/chat', { message: '' })).status, 400);
  });
  await t.test('consent and valid email are required before code delivery', async () => {
    const res = await request('/support/public/code', { email: 'bad', name: 'A', schoolName: 'B', message: 'Demo', consent: false });
    assert.equal(res.status, 400);
    assert.equal(mail.length, 0);
  });
  await t.test('code hash is stored, no school enquiry exists until verification', async () => {
    const res = await request('/support/public/code', {
      email: 'visitor@example.test', name: 'Visitor', schoolName: 'New School', message: 'Demo please password=do-not-save', consent: true
    });
    assert.equal(res.status, 201);
    const data = await object(res);
    assert.equal(enquiries.length, 0);
    assert.equal(mail[0].to, 'visitor@example.test');
    const code = mail[0].text.match(/\b\d{6}\b/)?.[0];
    assert.ok(code);
    assert.equal(challenges[0].code_hash, hash(`${data.challengeId}:${code}`));
    assert.doesNotMatch(JSON.stringify(challenges), /do-not-save/);
    const verified = await request('/support/public/verify', { challengeId: data.challengeId, code });
    assert.equal(verified.status, 201);
    assert.equal(verified.headers.get('cache-control'), 'no-store');
    const result = await object(verified);
    token = result.token;
    enquiryId = result.enquiry.id;
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal(result.enquiry.session_hash, undefined);
    assert.equal(result.enquiry.session_expires_at, undefined);
    assert.equal(enquiries[0].session_hash, hash(token));
    assert.match(mail[1].text, /School enquiries/);
    assert.equal((await request('/support/public/verify', { challengeId: data.challengeId, code })).status, 400);
  });
  await t.test('guests cannot guess enquiry IDs or use school/owner account tokens', async () => {
    for (const credential of [undefined, 'Bearer school-token', `Enquiry ${'0'.repeat(64)}`]) {
      assert.equal((await request(`/support/public/enquiries/${enquiryId}`, undefined, credential)).status, 401);
    }
    const res = await request(`/support/public/enquiries/${enquiryId}`, undefined, `Enquiry ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const data = await object(res);
    assert.equal(data.enquiry.session_hash, undefined);
    assert.equal(data.messages.length, 1);
    assert.equal((await request(`/support/public/enquiries/${randomUUID()}`, undefined, `Enquiry ${token}`)).status, 401);
  });
  await t.test('guest authors are assigned server-side and saved messages report email failure', async () => {
    mailOk = false;
    const res = await request(`/support/public/enquiries/${enquiryId}/messages`, { id: randomUUID(), message: 'Can we schedule a demo?', author_role: 'owner' }, `Enquiry ${token}`);
    assert.equal(res.status, 201);
    assert.match((await object(res)).notificationWarning, /saved.*not delivered/);
    assert.equal(messages[1].author_role, 'visitor');
    mailOk = true;
    assert.equal((await request(`/support/public/enquiries/${enquiryId}/notify`, {}, `Enquiry ${token}`)).status, 201);
  });
  await t.test('owner MFA is required for listing, reading, replying and resolving', async () => {
    for (const [path, body] of [
      ['/owner/support/enquiries', undefined],
      [`/owner/support/enquiries/${enquiryId}`, undefined],
      [`/owner/support/enquiries/${enquiryId}/messages`, { id: randomUUID(), message: 'Hello' }],
      [`/owner/support/enquiries/${enquiryId}/status`, { status: 'resolved' }]
    ] as const) {
      assert.equal((await request(path, body)).status, 401);
      assert.equal((await request(path, body, 'Bearer owner-password-only')).status, 403);
    }
    const res = await request(`/owner/support/enquiries/${enquiryId}/messages`, { id: randomUUID(), message: 'Let us arrange a demo' }, 'Bearer owner-mfa');
    assert.equal(res.status, 201);
    assert.equal(messages[2].author_role, 'owner');
    assert.equal(mail[mail.length - 1].to, 'visitor@example.test');
    const list = await object(await request('/owner/support/enquiries', undefined, 'Bearer owner-mfa'));
    assert.equal(list.enquiries.length, 1);
  });
  await t.test('expired guest sessions are denied and database failures remain explicit', async () => {
    enquiries[0].session_expires_at = new Date(0).toISOString();
    assert.equal((await request(`/support/public/enquiries/${enquiryId}`, undefined, `Enquiry ${token}`)).status, 401);
    databaseError = true;
    assert.equal((await request('/owner/support/enquiries', undefined, 'Bearer owner-mfa')).status, 503);
    databaseError = false;
  });
  await t.test('SMTP failure does not claim a verification code was sent', async () => {
    mailOk = false;
    assert.equal((await request('/support/public/code', { email: 'second@example.test', name: 'A', schoolName: 'B', message: 'Demo', consent: true })).status, 503);
  });
  await t.test('WhatsApp is optional, normalized and requires separate contact permission', async () => {
    mailOk = true;
    const body = { email: 'whatsapp@example.test', name: 'Visitor', schoolName: 'School', message: 'Demo', consent: true };
    for (const [i, number] of ['9876543210', '+00 12345678', '+91 abc123', '+123', '+1234567890123456'].entries()) {
      await assert.rejects(service.requestCode(`invalid-phone-${i}`, { ...body, email: `invalid${i}@example.test`, whatsappNumber: number, whatsappConsent: true }), /country code/);
    }
    await assert.rejects(service.requestCode('no-permission', { ...body, whatsappNumber: '+91 98765 43210' }), /allow WhatsApp/);
    await assert.rejects(service.requestCode('no-number', { ...body, whatsappConsent: true }), /Enter a WhatsApp/);
    const result = await service.requestCode('valid-phone', { ...body, whatsappNumber: '+91 (98765) 43210', whatsappConsent: true });
    const challenge = challenges.find((r) => r.id === result.challengeId);
    assert.equal(challenge?.whatsapp_number, '+919876543210');
    const code = mail[mail.length - 1].text.match(/\b\d{6}\b/)![0];
    const verified = await service.verify('valid-phone', { challengeId: result.challengeId, code });
    assert.equal(verified.enquiry.whatsapp_number, '+919876543210');
    assert.match(mail[mail.length - 1].text, /WhatsApp contact requested: \+919876543210/);
    assert.match(mail[mail.length - 1].text, /https:\/\/wa.me\/919876543210/);
    assert.equal(challenges[0].whatsapp_number, null);
  });
  await t.test('public bot requests are rate-limited', () => {
    const limited = new VisitorService(db, Object.create(EmailService.prototype));
    for (let i = 0; i < 30; i++) limited.chat('test-ip', { message: 'Features?' });
    assert.throws(() => limited.chat('test-ip', { message: 'Features?' }), /wait/);
  });
  await t.test('WhatsApp country-specific lengths, patterns and shared calling codes are enforced server-side', async () => {
    for (const [i, [country, number]] of [
      ['IN', '+91987654321'], ['IN', '+9198765432100'], ['IN', '+911111111111'],
      ['US', '+1202555012'], ['AE', '+97150123456'], ['GB', '+44740012345678'],
      ['CA', '+12025550123'], ['IN', '+12025550123'], ['ZZ', '+919876543210'],
      [91, '+919876543210']
    ].entries()) {
      await assert.rejects(service.requestCode(`bad-country-${i}`, {
        name: 'Visitor', schoolName: 'School', message: 'Demo', consent: true,
        email: `bad-country-${i}@example.test`, whatsappNumber: number, whatsappCountry: country, whatsappConsent: true
      }), /country code/);
    }
    for (const [i, [country, number, normalized]] of [
      ['IN', '+91 (98765) 43210', '+919876543210'],
      ['US', '+1 (202) 555-0123', '+12025550123'],
      ['CA', '+1 416 555 0123', '+14165550123'],
      ['GB', '+44 7400 123456', '+447400123456'],
      ['AE', '+971 50 123 4567', '+971501234567'],
      ['DE', '+49 1512 3456789', '+4915123456789']
    ].entries()) {
      const result = await service.requestCode(`good-country-${i}`, {
        name: 'Visitor', schoolName: 'School', message: 'Demo', consent: true,
        email: `good-country-${i}@example.test`, whatsappNumber: number, whatsappCountry: country, whatsappConsent: true
      });
      assert.equal(challenges.find((row) => row.id === result.challengeId)?.whatsapp_number, normalized);
    }
  });
});
