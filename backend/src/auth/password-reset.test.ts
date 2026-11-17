import { strict as assert } from 'node:assert';
import { test, TestContext } from 'node:test';
import { SupabaseService } from '../supabase.service';
import { EmailService } from './email.service';
import { RegistrationPhoneService } from './registration-phone.service';
import { PasswordResetService } from './password-reset.service';
import { StudentAuthService, passwordPolicyError } from './student-auth.service';
import { AuthController } from '../controllers/auth.controller';

type Row = Record<string, any>;
const sid = `VE${'d'.repeat(32)}`;

function fixture(t: TestContext) {
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID', 'SUPABASE_JWT_SECRET'];
  const original = keys.map((key) => process.env[key]);
  process.env.TWILIO_ACCOUNT_SID = `AC${'b'.repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = 'fixture-only-not-a-real-secret';
  process.env.TWILIO_VERIFY_SERVICE_SID = `VA${'c'.repeat(32)}`;
  process.env.SUPABASE_JWT_SECRET = 'fixture-password-reset-signing-key';
  const savedStudents = Reflect.get(StudentAuthService, 'localAccounts');
  const savedTeachers = Reflect.get(StudentAuthService, 'teacherAccounts');
  const savedSchools = Reflect.get(StudentAuthService, 'schoolAccounts');
  t.after(() => {
    keys.forEach((key, index) => { if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index]; });
    Reflect.set(StudentAuthService, 'localAccounts', savedStudents);
    Reflect.set(StudentAuthService, 'teacherAccounts', savedTeachers);
    Reflect.set(StudentAuthService, 'schoolAccounts', savedSchools);
  });
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const sms: Array<{ action: string; fields: URLSearchParams }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const fields = new URLSearchParams(String(init.body));
    const action = url.endsWith('/Verifications') ? 'send' : 'check';
    sms.push({ action, fields });
    const status = action === 'send' ? 'pending' : fields.get('Code') === '123456' ? 'approved' : 'pending';
    return new Response(JSON.stringify({ sid, status }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  Reflect.set(StudentAuthService, 'localAccounts', new Map());
  Reflect.set(StudentAuthService, 'teacherAccounts', new Map());
  Reflect.set(StudentAuthService, 'schoolAccounts', new Map());
  const tables: Record<string, Row[]> = { teachers: [], student_accounts: [], students: [], schools: [] };
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = { from(table: string) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | undefined;
    let insert: Row[] | undefined;
    const query = {
      select() { return query; }, limit() { return query; }, order() { return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      update(value: Row) { patch = value; return query; },
      insert(value: Row[]) { insert = value; return query; },
      then(resolve: (result: { data: Row[]; error: unknown }) => void) {
        if (insert) tables[table].push(...insert);
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        resolve({ data: rows.map((row) => ({ ...row })), error: null });
      }
    };
    return query;
  } };
  const sent: Array<{ to: string; code: string }> = [];
  const email: EmailService = Object.create(EmailService.prototype);
  email.isConfigured = () => true;
  email.sendMail = async (to, _subject, _html, text) => {
    sent.push({ to, code: String(text?.match(/\b\d{6}\b/)?.[0]) });
    return { ok: true };
  };
  const auth = new StudentAuthService(db, email);
  Reflect.set(auth, 'persistStudentAccounts', () => undefined);
  Reflect.set(auth, 'persistTeacherAccounts', () => undefined);
  const hash = (password: string, salt: string) => Reflect.get(auth, 'hashPassword').call(auth, password, salt);
  const service = new PasswordResetService(auth, new RegistrationPhoneService(db), email);
  return {
    auth, service, tables, sent, sms, hash,
    controller: new AuthController(auth, new RegistrationPhoneService(db), service),
    advance(milliseconds: number) { now += milliseconds; },
  };
}

test('password policy requires a letter, a number and a special character', () => {
  for (const weak of ['short1!', 'lettersonly!', '12345678!', 'Letters123', 'Has space 1a']) assert.ok(passwordPolicyError(weak), weak);
  assert.equal(passwordPolicyError('Strong#Pass1'), '');
});

test('teacher resets by registered email, is guided to mobile for a wrong email, and cannot reuse the old password', async (t) => {
  const f = fixture(t);
  f.tables.teachers.push({
    id: 'teacher-1', school_id: 'school-a', login_id: 'jpr1521@gmail.com', name: 'Teacher',
    email: 'jpr+jpr1521@gmail.com@gmail.com', phone: '+919876543210',
    password_salt: 'salt-a', password_hash: f.hash('Old#Pass1', 'salt-a')
  });
  const base = { role: 'teacher', loginId: 'JPR1521@gmail.com' };

  await assert.rejects(f.service.request({ ...base, loginId: 'missing' }), /No teacher account/);
  await assert.rejects(f.service.request({ ...base, channel: 'email', email: 'other@example.test' }),
    /not valid for this account\. You can verify with your registered mobile number/);
  const requested = await f.service.request({ ...base, channel: 'email', email: ' JPR@gmail.com ' });
  assert.equal(f.sent[0].to, 'jpr@gmail.com');
  assert.match(requested.destination, /^jp•+@gmail\.com$/);

  const reset = { ...base, challengeId: requested.challengeId, code: f.sent[0].code };
  await assert.rejects(f.service.reset({ ...reset, newPassword: 'weakpass', confirmPassword: 'weakpass' }), /special character/);
  await assert.rejects(f.service.reset({ ...reset, newPassword: 'New#Pass1', confirmPassword: 'New#Pass2' }), /do not match/);
  await assert.rejects(f.service.reset({ ...reset, newPassword: 'Old#Pass1', confirmPassword: 'Old#Pass1' }), /different from your current password/);
  await assert.rejects(f.service.reset({ ...reset, code: '000000', newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' }), /4 attempts left/);

  assert.deepEqual(await f.service.reset({ ...reset, newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' }),
    { success: true, message: 'Your password has been changed. You can now log in with your new password.' });
  assert.equal((await f.auth.loginTeacher('jpr1521@gmail.com', 'Old#Pass1')).ok, false);
  assert.equal((await f.auth.loginTeacher('jpr1521@gmail.com', 'New#Pass1')).ok, true);
  const row = f.tables.teachers[0];
  assert.equal(f.hash('New#Pass1', row.password_salt), row.password_hash);
  await assert.rejects(f.service.reset({ ...reset, newPassword: 'Other#Pass2', confirmPassword: 'Other#Pass2' }), /expired or has too many attempts/);
});

test('student without an email is told to use the registered mobile number and resets via SMS', async (t) => {
  const f = fixture(t);
  f.tables.student_accounts.push({
    student_id: 'student-1', school_id: 'school-a', login_id: 'stu1', name: 'Student', class_name: 'Class 7',
    phone: '+919876543210', email: null, password_salt: 'salt-s', password_hash: f.hash('Old#Pass1', 'salt-s')
  });
  f.tables.students.push({ id: 'student-1', school_id: 'school-a', name: 'Student', class_name: 'Class 7' });
  const base = { role: 'student', loginId: 'stu1' };

  await assert.rejects(f.service.request({ ...base, channel: 'email', email: 'stu@example.test' }),
    /No valid email address is registered for this account\. Please verify with your registered mobile number/);
  await assert.rejects(f.service.request({ ...base, channel: 'phone', country: 'IN', phone: '9123456789' }), /does not match/);
  const requested = await f.controller.forgotPasswordRequest({ ip: '1.2.3.4' }, { ...base, channel: 'phone', country: 'IN', phone: '98765 43210' });
  assert.equal(f.sms[0].fields.get('To'), '+919876543210');
  assert.equal(requested.challengeId, sid);

  await assert.rejects(f.controller.forgotPasswordReset({}, { ...base, challengeId: sid, code: '111111', newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' }),
    (error: any) => error.getStatus() === 400 && /Incorrect verification code/.test(error.getResponse().error) && error.getResponse().success === false);
  await f.controller.forgotPasswordReset({}, { ...base, challengeId: sid, code: '123456', newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' });
  assert.equal((await f.auth.loginStudent('stu1', 'New#Pass1')).ok, true);
  assert.equal((await f.auth.loginStudent('stu1', 'Old#Pass1')).ok, false);
});

test('school admin resets by mobile number, and a cached login uses the new password', async (t) => {
  const f = fixture(t);
  f.tables.schools.push({
    id: 'school-a', email: 'admin@school.test', school_name: 'School', branch: 'Main', location: 'City',
    phone: '+919876543210', password_salt: 'salt-x', password_hash: f.hash('Old#Pass1', 'salt-x')
  });
  assert.equal((await f.auth.loginSchool('admin@school.test', 'Old#Pass1')).ok, true);
  const base = { role: 'school', loginId: ' Admin@School.test ' };

  await assert.rejects(f.service.request({ ...base, loginId: 'other@school.test', channel: 'email', email: 'other@school.test' }),
    /No school account was found with that email address/);
  await assert.rejects(f.service.request({ ...base, channel: 'email', email: 'wrong@school.test' }),
    /not valid for this account\. You can verify with your registered mobile number/);
  const requested = await f.service.request({ ...base, channel: 'phone', country: 'IN', phone: '9876543210' });
  assert.equal(f.sms[0].fields.get('To'), '+919876543210');
  const reset = { ...base, challengeId: requested.challengeId, code: '123456' };
  await assert.rejects(f.service.reset({ ...reset, role: 'teacher', newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' }), /expired/);
  await assert.rejects(f.service.reset({ ...reset, newPassword: 'Old#Pass1', confirmPassword: 'Old#Pass1' }), /different from your current password/);
  await f.service.reset({ ...reset, newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' });

  assert.equal((await f.auth.loginSchool('admin@school.test', 'Old#Pass1')).ok, false);
  assert.equal((await f.auth.loginSchool('admin@school.test', 'New#Pass1')).ok, true);
  const row = f.tables.schools[0];
  assert.equal(f.hash('New#Pass1', row.password_salt), row.password_hash);
});

test('a reset code cannot be used for a different account or after it expires', async (t) => {
  const f = fixture(t);
  for (const id of ['a', 'b']) {
    f.tables.student_accounts.push({
      student_id: `student-${id}`, school_id: 'school-a', login_id: `stu-${id}`, email: `${id}@example.test`,
      password_salt: 'salt', password_hash: f.hash('Old#Pass1', 'salt')
    });
    f.tables.students.push({ id: `student-${id}`, school_id: 'school-a', name: 'Student', class_name: 'Class 7' });
  }
  const requested = await f.service.request({ role: 'student', loginId: 'stu-a', channel: 'email', email: 'a@example.test' });
  const reset = { role: 'student', challengeId: requested.challengeId, code: f.sent[0].code, newPassword: 'New#Pass1', confirmPassword: 'New#Pass1' };
  await assert.rejects(f.service.reset({ ...reset, loginId: 'stu-b' }), /expired/);
  await assert.rejects(f.service.reset({ ...reset, role: 'teacher', loginId: 'stu-a' }), /expired/);
  f.advance(10 * 60000 + 1);
  await assert.rejects(f.service.reset({ ...reset, loginId: 'stu-a' }), /expired/);
});
