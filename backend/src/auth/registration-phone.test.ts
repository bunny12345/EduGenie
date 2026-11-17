import { strict as assert } from 'node:assert';
import { test, TestContext } from 'node:test';
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { RegistrationPhoneService } from './registration-phone.service';
import { RegistrationEmailService } from './registration-email.service';
import { EmailService } from './email.service';
import { SchoolController } from '../controllers/school.controller';
import { StudentAuthService } from './student-auth.service';
import { LearningScoreService } from '../progress/learning-score.service';
import { AuthController } from '../controllers/auth.controller';
import { PasswordResetService } from './password-reset.service';

type Row = Record<string, any>;
const sid = `VE${'a'.repeat(32)}`;
const scope = { schoolId: 'school-a', actorId: 'admin-a' };
const input = { role: 'teacher', country: 'IN', phone: '9876543210' };

function fixture(t: TestContext) {
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID', 'SUPABASE_JWT_SECRET'];
  const original = keys.map((key) => process.env[key]);
  process.env.TWILIO_ACCOUNT_SID = `AC${'b'.repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = 'fixture-only-not-a-real-secret';
  process.env.TWILIO_VERIFY_SERVICE_SID = `VA${'c'.repeat(32)}`;
  process.env.SUPABASE_JWT_SECRET = 'fixture-email-verification-signing-key';
  t.after(() => keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index];
  }));
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const rows: Row[] = [];
  const emailRows: Row[] = [];
  const schoolPhoneRows: Row[] = [];
  const schools: Row[] = [];
  const sentEmails: Array<{ to: string; code: string }> = [];
  let databaseFailure = false;
  const calls: Array<{ url: string; fields: URLSearchParams }> = [];
  let providerStatus = 200;
  let providerResult: unknown;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const fields = new URLSearchParams(String(init.body));
    calls.push({ url, fields });
    const body = providerResult ?? { sid, status: url.endsWith('/Verifications') ? 'pending' : fields.get('Code') === '123456' ? 'approved' : 'pending' };
    return new Response(JSON.stringify(body), { status: providerStatus, headers: { 'Content-Type': 'application/json' } });
  });
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = { from(table: string) {
    const tables: Record<string, Row[]> = {
      registration_phone_verifications: rows, registration_email_verifications: emailRows,
      school_registration_phone_verifications: schoolPhoneRows, schools
    };
    assert.ok(table in tables);
    const source = tables[table];
    let insert: Row[] | undefined;
    let patch: Row | undefined;
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      gte(key: string, value: string) { filters.push((row) => row[key] >= value); return query; },
      limit() { return query; },
      insert(value: Row[]) { insert = value; return query; },
      update(value: Row) { patch = value; return query; },
      then(resolve: (value: { data: Row[] | null; error: unknown }) => void) {
        if (databaseFailure) return resolve({ data: null, error: { message: 'fixture unavailable' } });
        if (insert) {
          if (insert.some((entry) => source.some((row) => entry.id === row.id))) return resolve({ data: null, error: { code: '23505' } });
          source.push(...insert);
        }
        const selected = source.filter((row) => filters.every((filter) => filter(row)));
        if (patch) selected.forEach((row) => Object.assign(row, patch));
        resolve({ data: selected.map((row) => ({ ...row })), error: null });
      },
    };
    return query;
  } };
  const service = new RegistrationPhoneService(db);
  const email: EmailService = Object.create(EmailService.prototype);
  email.isConfigured = () => true;
  email.sendMail = async (to, _subject, _html, text) => {
    const code = text?.match(/\b\d{6}\b/)?.[0];
    assert.ok(code);
    sentEmails.push({ to, code });
    return { ok: true };
  };
  const emailService = new RegistrationEmailService(db, email);
  return {
    service, emailService, email, db, rows, emailRows, schoolPhoneRows, schools, sentEmails, calls,
    advance(milliseconds: number) { now += milliseconds; },
    failDatabase() { databaseFailure = true; },
    provider(status: number, result?: unknown) { providerStatus = status; providerResult = result; },
    async verified(role = 'teacher') {
      const request = await service.request(scope, { ...input, role });
      return service.verify(scope, { ...input, role, challengeId: request.challengeId, code: '123456' });
    },
    async emailVerified(role = 'teacher') {
      const request = await emailService.request(scope, { role, email: ' Person@Example.test ' });
      return emailService.verify(scope, { role, email: 'person@example.test', challengeId: request.challengeId, code: sentEmails[sentEmails.length - 1].code });
    },
  };
}

test('SMS verification normalizes India numbers, checks OTP, and persists one-use scoped proof across service restarts', async (t) => {
  const f = fixture(t);
  const request = await f.service.request(scope, { ...input, country: undefined });
  assert.equal(request.resendAfter, 60);
  assert.equal(f.calls[0].fields.get('To'), '+919876543210');
  assert.equal(f.calls[0].fields.get('Channel'), 'sms');
  await assert.rejects(f.service.verify(scope, { ...input, challengeId: request.challengeId, code: '654321' }), /Incorrect verification code/);
  assert.equal(f.rows[0].status, 'pending');
  const verified = await f.service.verify(scope, { ...input, challengeId: request.challengeId, code: '123456' });
  assert.equal(verified.phone, '+919876543210');
  assert.equal(f.calls[2].fields.get('VerificationSid'), sid);
  const restarted = new RegistrationPhoneService(f.db);
  const body = { ...input, phoneVerificationId: verified.verificationId };
  for (const [otherScope, role, changes] of [
    [{ ...scope, schoolId: 'school-b' }, 'teacher', {}],
    [{ ...scope, actorId: 'admin-b' }, 'teacher', {}],
    [scope, 'student', {}],
    [scope, 'teacher', { phone: '9123456789' }],
  ] as const) {
    await assert.rejects(restarted.consume(otherScope, role, { ...body, ...changes }), /verification is missing, expired or used/);
  }
  const concurrent = await Promise.allSettled([
    restarted.consume(scope, 'teacher', body), f.service.consume(scope, 'teacher', body),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(f.rows[0].status, 'used');
});

test('school registration binds both email and SMS to the owner and pending mobile number', async (t) => {
  const f = fixture(t);
  const auth = new StudentAuthService(f.db, f.email);
  const controller = new AuthController(auth, f.service, Object.create(PasswordResetService.prototype));
  const req = { owner: { id: 'owner-school-test' } };
  const details = {
    schoolName: 'Verified school', branch: 'Main', location: 'City', email: 'dual-school@example.test',
    password: 'fixture-password', phone: input.phone, country: 'IN'
  };
  assert.throws(() => controller.schoolRegister(), /both email and SMS/);
  await controller.schoolRegisterRequestOtp(req, details);
  await assert.rejects(controller.schoolRegisterVerifyOtp(req, {
    email: details.email, otp: f.sentEmails[0].code
  }), /Verify the mobile number/);
  assert.equal(f.schools.length, 0);

  f.advance(31000);
  await controller.schoolRegisterRequestOtp(req, details);
  const phoneRequest = await controller.requestSchoolPhone(req, input);
  const phone = await controller.verifySchoolPhone(req, { ...input, challengeId: phoneRequest.challengeId, code: '123456' });
  assert.equal(f.schoolPhoneRows.length, 1);
  assert.equal(f.rows.length, 0);
  const body = { email: details.email, otp: f.sentEmails[1].code, phoneVerificationId: phone.verificationId };
  assert.equal((await controller.schoolRegisterVerifyOtp({ owner: { id: 'other-owner' } }, body)).success, false);
  assert.equal((await controller.schoolRegisterVerifyOtp(req, { ...body, otp: 'invalid' })).success, false);
  assert.equal(f.schools.length, 0);
  await assert.rejects(f.service.consume(scope, 'teacher', { ...input, phoneVerificationId: phone.verificationId }), /missing, expired or used/);
  const result = await controller.schoolRegisterVerifyOtp(req, body);
  assert.equal(result.success, true);
  assert.equal(f.schools.length, 1);
  assert.equal(f.schools[0].phone, '+919876543210');
  assert.equal(f.schoolPhoneRows[0].status, 'used');
  assert.equal((await controller.schoolRegisterVerifyOtp(req, body)).success, false);
});

for (const role of ['teacher', 'student'] as const) {
  test(`${role} edits require each changed contact's account-scoped proof, not a registration or another account's proof`, async (t) => {
    const f = fixture(t);
    const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
    t.mock.method(auth, 'schoolAccountContact', async (schoolId: string, _role: string, id: string) => {
      if (schoolId !== scope.schoolId || !['account-a', 'account-b'].includes(id)) throw new ForbiddenException();
      return { phone: '+919123456789', email: 'old@example.test' };
    });
    const teacher = t.mock.method(auth, 'updateTeacherBySchool', async (payload: Row) => ({ ok: true, teacher: payload }));
    const student = t.mock.method(auth, 'updateStudentBySchool', async (payload: Row) => ({ ok: true, student: payload }));
    const controller = new SchoolController(auth, Object.create(LearningScoreService.prototype), f.service, f.emailService);
    const req = { user: { sub: scope.actorId, schoolId: scope.schoolId, role: 'school_admin' } };
    const update = (id: string, body: Row) => role === 'teacher' ? controller.updateTeacher(req, id, body) : controller.updateStudent(req, id, body);
    const body = { ...input, role, accountId: 'account-a', email: 'person@example.test', gender: 'female', dateOfBirth: '2000-06-15' };
    await assert.rejects(update('account-a', body), /Verify the mobile number/);
    const registration = await f.verified(role);
    await assert.rejects(update('account-a', { ...body, phoneVerificationId: registration.verificationId }), /missing, expired or used/);
    f.rows.length = 0;
    f.advance(60001);
    const request = await controller.requestRegistrationPhone(req, body);
    const phone = await controller.verifyRegistrationPhone(req, { ...body, challengeId: request.challengeId, code: '123456' });
    await assert.rejects(update('account-b', { ...body, phoneVerificationId: phone.verificationId }), /missing, expired or used/);
    await assert.rejects(update('account-a', { ...body, phoneVerificationId: phone.verificationId, dateOfBirth: '2000-02-31' }), /valid date of birth/);
    assert.equal(f.rows[0].status, 'verified');
    await assert.rejects(update('account-a', { ...body, phone: undefined, phoneVerificationId: phone.verificationId }), /Verify the email address/);
    const emailRequest = await controller.requestRegistrationEmail(req, body);
    const email = await controller.verifyRegistrationEmail(req, { ...body, challengeId: emailRequest.challengeId, code: f.sentEmails[0].code });
    assert.equal(teacher.mock.callCount() + student.mock.callCount(), 0);
    const result = await update('account-a', { ...body, phoneVerificationId: phone.verificationId, emailVerificationId: email.verificationId });
    assert.equal(result.success, true);
    const spy = role === 'teacher' ? teacher : student;
    assert.equal(spy.mock.calls[0].arguments[0].phone, '+919876543210');
    assert.equal(spy.mock.calls[0].arguments[0].email, 'person@example.test');
    assert.equal(spy.mock.calls[0].arguments[0].gender, 'female');
    assert.equal(spy.mock.calls[0].arguments[0].dateOfBirth, '2000-06-15');
    await assert.rejects(update('account-a', { ...body, phoneVerificationId: phone.verificationId, emailVerificationId: email.verificationId }), /used/);
    await assert.rejects(controller.requestRegistrationPhone(req, { ...body, accountId: 'foreign-account' }), ForbiddenException);
  });
}

test('unchanged contacts and personal-only edits require no OTP and reject non-admin callers', async (t) => {
  const f = fixture(t);
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  t.mock.method(auth, 'schoolAccountContact', async () => ({ phone: '+919876543210', email: 'person@example.test' }));
  const update = t.mock.method(auth, 'updateTeacherBySchool', async (payload: Row) => ({ ok: true, teacher: payload }));
  const controller = new SchoolController(auth, Object.create(LearningScoreService.prototype), f.service, f.emailService);
  const req = { user: { sub: scope.actorId, schoolId: scope.schoolId, role: 'school_admin' } };
  assert.equal((await controller.updateTeacher(req, 'teacher-a', { ...input, email: ' Person@Example.test ', gender: 'other' })).success, true);
  assert.equal((await controller.updateTeacher(req, 'teacher-a', { dateOfBirth: '1990-02-28' })).success, true);
  await assert.rejects(controller.updateTeacher({ user: { ...req.user, role: 'student' } }, 'teacher-a', {}), ForbiddenException);
  assert.equal(update.mock.callCount(), 2);
  assert.equal(f.calls.length, 0);
  assert.equal(f.sentEmails.length, 0);
});

test('profile edits persist and reload for teachers and both student records while retaining class assignment and credentials', async (t) => {
  const tables: Record<string, Row[]> = {
    teachers: [{
      id: 'profile-teacher', school_id: scope.schoolId, name: 'Teacher', subject: 'English', grades: ['Class 7'],
      email: 'old@example.test', login_id: 'profile-teacher-login', password_salt: 'salt', password_hash: 'hash'
    }],
    students: [{ id: 'profile-student', school_id: scope.schoolId, name: 'Student', class_name: 'Class 7' }],
    student_accounts: [{ student_id: 'profile-student', school_id: scope.schoolId, login_id: 'profile-student-login', password_hash: 'hash' }]
  };
  let failure = false;
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = { from(table: string) {
    assert.ok(table in tables);
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | undefined;
    const query = {
      select() { return query; }, order() { return query; }, range() { return query; }, limit() { return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      update(value: Row) { patch = value; return query; },
      then(resolve: (result: { data: Row[]; error: unknown }) => void) {
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (patch && !failure) rows.forEach((row) => Object.assign(row, patch));
        resolve({ data: rows.map((row) => ({ ...row })), error: failure ? { message: 'fixture database failure' } : null });
      }
    };
    return query;
  } };
  const auth = new StudentAuthService(db, Object.create(EmailService.prototype));
  const remembered: Row[] = [];
  Reflect.set(auth, 'rememberTeacher', (account: Row) => remembered.push(account));
  t.mock.method(auth, 'listClassTeachers', async () => [{ id: 'next-class-teacher' }]);
  const fields = { phone: '+919876543210', email: 'new@example.test', gender: 'female', dateOfBirth: '2000-02-29' };
  assert.equal((await auth.updateTeacherBySchool({ schoolId: scope.schoolId, teacherId: 'profile-teacher', ...fields })).ok, true);
  assert.equal((await auth.updateStudentBySchool({ schoolId: scope.schoolId, studentId: 'profile-student', className: 'Class 8', ...fields })).ok, true);
  for (const row of [tables.teachers[0], tables.students[0], tables.student_accounts[0]]) {
    assert.equal(row.phone, fields.phone);
    assert.equal(row.email, fields.email);
    assert.equal(row.gender, fields.gender);
    assert.equal(row.date_of_birth, fields.dateOfBirth);
  }
  assert.equal(tables.student_accounts[0].password_hash, 'hash');
  assert.equal(tables.students[0].teacher_id, 'next-class-teacher');
  assert.equal(tables.student_accounts[0].teacher_id, 'next-class-teacher');
  assert.equal(remembered[remembered.length - 1].dateOfBirth, fields.dateOfBirth);

  const restarted = new StudentAuthService(db, Object.create(EmailService.prototype));
  Reflect.set(restarted, 'rememberTeacher', () => undefined);
  assert.deepEqual(await restarted.schoolAccountContact(scope.schoolId, 'teacher', 'profile-teacher'), { phone: fields.phone, email: fields.email });
  assert.deepEqual(await restarted.schoolAccountContact(scope.schoolId, 'student', 'profile-student'), { phone: fields.phone, email: fields.email });
  const teacher = (await restarted.listTeachersBySchool(scope.schoolId)).teachers[0];
  const student = (await restarted.listStudentsByScope({ schoolId: scope.schoolId })).students[0];
  assert.equal(teacher.dateOfBirth, fields.dateOfBirth);
  assert.equal(student.dateOfBirth, fields.dateOfBirth);
  assert.equal(teacher.gender, fields.gender);
  assert.equal(student.gender, fields.gender);
  await assert.rejects(restarted.schoolAccountContact('another-school', 'teacher', 'profile-teacher'), ForbiddenException);
  await assert.rejects(restarted.schoolAccountContact('another-school', 'student', 'profile-student'), ForbiddenException);
  for (const invalid of [{ dateOfBirth: '2001-02-29' }, { dateOfBirth: '2999-01-01' }, { gender: 'invalid' }, { phone: '123' }, { email: '' }]) {
    await assert.rejects(auth.updateTeacherBySchool({ schoolId: scope.schoolId, teacherId: 'profile-teacher', ...invalid }), BadRequestException);
    await assert.rejects(auth.updateStudentBySchool({ schoolId: scope.schoolId, studentId: 'profile-student', ...invalid }), BadRequestException);
  }
  const saved = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL = 'https://fixture.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only-key';
  t.after(() => ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index];
  }));
  failure = true;
  assert.equal((await auth.updateTeacherBySchool({ schoolId: scope.schoolId, teacherId: 'profile-teacher', gender: 'other' })).ok, false);
  assert.equal((await auth.updateStudentBySchool({ schoolId: scope.schoolId, studentId: 'profile-student', gender: 'other' })).ok, false);
});

test('edit profiles recover saved registration details behind minimal roster rows without crossing schools or requiring unchanged-contact OTPs', async (t) => {
  const savedStudents = Reflect.get(StudentAuthService, 'localAccounts');
  const savedTeachers = Reflect.get(StudentAuthService, 'teacherAccounts');
  t.after(() => {
    Reflect.set(StudentAuthService, 'localAccounts', savedStudents);
    Reflect.set(StudentAuthService, 'teacherAccounts', savedTeachers);
  });
  const profile = { phone: '+919876543210', email: 'registered@example.test', gender: 'female', dateOfBirth: '2000-02-29' };
  const columns = { phone: profile.phone, email: profile.email, gender: profile.gender, date_of_birth: profile.dateOfBirth };
  const student = (id: string, schoolId = scope.schoolId) => ({
    studentId: id, schoolId, loginId: `${id}-login`, name: 'Student', className: 'Class 7',
    passwordSalt: 'fixture-salt', passwordHash: 'fixture-hash', ...profile
  });
  const teacher = (id: string, schoolId = scope.schoolId) => ({
    teacherId: id, schoolId, loginId: `${id}-login`, name: 'Teacher', subject: 'English', grades: ['Class 7'],
    passwordSalt: 'fixture-salt', passwordHash: 'fixture-hash', ...profile
  });
  const localStudents = new Map([
    ['local-login', student('local-profile')],
    ['mixed-login', { ...student('mixed-profile'), phone: '+919123456789', gender: 'male' }],
    ['foreign-login', student('foreign-profile', 'another-school')]
  ]);
  const localTeachers = new Map([
    ['teacher-login', teacher('local-teacher')],
    ['foreign-teacher-login', teacher('foreign-teacher', 'another-school')],
    ['incomplete-teacher-login', { ...teacher('full-teacher'), grades: ['Class 8'], email: '', phone: undefined, gender: undefined, dateOfBirth: undefined }]
  ]);
  Reflect.set(StudentAuthService, 'localAccounts', localStudents);
  Reflect.set(StudentAuthService, 'teacherAccounts', localTeachers);
  const tables: Record<string, Row[]> = {
    students: ['local-profile', 'mirror-profile', 'mixed-profile', 'foreign-profile', 'full-profile'].map((id) => ({
      id, school_id: scope.schoolId, name: 'Student', class_name: 'Class 7',
      phone: null, email: null, gender: null, date_of_birth: null
    })),
    student_accounts: [
      { student_id: 'mirror-profile', school_id: scope.schoolId, login_id: 'mirror-login', ...columns },
      { student_id: 'mixed-profile', school_id: scope.schoolId, ...columns },
      { student_id: 'full-profile', school_id: scope.schoolId, ...columns },
      { student_id: 'foreign-profile', school_id: 'another-school', login_id: 'foreign-login', ...columns }
    ],
    teachers: [
      { id: 'local-teacher', school_id: scope.schoolId, name: 'Teacher', email: null, phone: null, gender: null, date_of_birth: null },
      { id: 'foreign-teacher', school_id: scope.schoolId, name: 'Teacher' },
      { id: 'full-teacher', school_id: scope.schoolId, name: 'Teacher', ...columns }
    ]
  };
  Object.assign(tables.students.find((row) => row.id === 'mixed-profile'), { email: 'current@example.test' });
  Object.assign(tables.students.find((row) => row.id === 'full-profile'), { ...columns, email: 'current@example.test', gender: 'other' });
  let accountFailure = false;
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = { from(table: string) {
    assert.ok(table in tables, `Unexpected query to ${table}; unchanged contacts must not consume an OTP`);
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | undefined;
    const query = {
      select() { return query; }, order() { return query; }, range() { return query; }, limit() { return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      update(value: Row) { patch = value; return query; },
      then(resolve: (result: { data: Row[]; error: unknown }) => void) {
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        resolve({ data: rows.map((row) => ({ ...row })), error: accountFailure && table === 'student_accounts' ? { message: 'Fixture unavailable' } : null });
      }
    };
    return query;
  } };
  const auth = new StudentAuthService(db, Object.create(EmailService.prototype));
  Reflect.set(auth, 'rememberTeacher', () => undefined);
  Reflect.set(auth, 'persistStudentAccounts', () => undefined);
  const students = (await auth.listStudentsByScope({ schoolId: scope.schoolId })).students;
  const teachers = (await auth.listTeachersBySchool(scope.schoolId)).teachers;
  for (const id of ['local-profile', 'mirror-profile']) {
    const result = students.find((row) => row.id === id);
    assert.deepEqual({ phone: result.phone, email: result.email, gender: result.gender, dateOfBirth: result.dateOfBirth }, profile);
    assert.deepEqual(await auth.schoolAccountContact(scope.schoolId, 'student', id), { phone: profile.phone, email: profile.email });
  }
  const mixed = students.find((row) => row.id === 'mixed-profile');
  assert.equal(mixed.email, 'current@example.test');
  assert.equal(mixed.phone, profile.phone);
  assert.equal(mixed.gender, profile.gender);
  assert.deepEqual(await auth.schoolAccountContact(scope.schoolId, 'student', 'mixed-profile'), {
    phone: profile.phone, email: 'current@example.test'
  });
  const full = students.find((row) => row.id === 'full-profile');
  assert.equal(full.email, 'current@example.test');
  assert.equal(full.gender, 'other');
  const localTeacher = teachers.find((row) => row.id === 'local-teacher');
  assert.deepEqual({ phone: localTeacher.phone, email: localTeacher.email, gender: localTeacher.gender, dateOfBirth: localTeacher.dateOfBirth }, profile);
  assert.deepEqual(await auth.schoolAccountContact(scope.schoolId, 'teacher', 'full-teacher'), { phone: profile.phone, email: profile.email });
  for (const foreign of [students.find((row) => row.id === 'foreign-profile'), teachers.find((row) => row.id === 'foreign-teacher')]) {
    assert.equal(foreign.phone, null);
    assert.equal(foreign.email, null);
    assert.equal(foreign.gender, null);
    assert.equal(foreign.dateOfBirth, null);
  }
  assert.equal(students.find((row) => row.id === 'foreign-profile').loginId, null);
  const controller = new SchoolController(auth, Object.create(LearningScoreService.prototype),
    new RegistrationPhoneService(db), Object.create(RegistrationEmailService.prototype));
  const req = { user: { sub: scope.actorId, schoolId: scope.schoolId, role: 'school_admin' } };
  assert.equal((await controller.updateTeacher(req, 'local-teacher', { ...profile, country: 'IN' })).success, true);
  assert.equal((await controller.updateStudent(req, 'mirror-profile', { ...profile, country: 'IN' })).success, true);
  accountFailure = true;
  assert.equal((await auth.listStudentsByScope({ schoolId: scope.schoolId })).students.find((row) => row.id === 'local-profile').phone, profile.phone);
  const restarted = new StudentAuthService(db, Object.create(EmailService.prototype));
  assert.equal((await restarted.listTeachersBySchool(scope.schoolId)).teachers.find((row) => row.id === 'local-teacher').phone, profile.phone);
});

test('account-specific challenges retain the admin-wide SMS and email send limits', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 10; i++) {
    const editScope = { ...scope, actorId: `account-${i}`, rateLimitActorId: scope.actorId };
    f.provider(200, { sid: `VE${i.toString(16).padStart(32, '0')}`, status: 'pending' });
    await f.service.request(editScope, { ...input, phone: `98765432${String(i).padStart(2, '0')}` });
    await f.emailService.request(editScope, { role: 'teacher', email: `account-${i}@example.test` });
  }
  const anotherAccount = { ...scope, actorId: 'another-account', rateLimitActorId: scope.actorId };
  await assert.rejects(f.service.request(anotherAccount, { ...input, phone: '9876543299' }), /Please wait/);
  await assert.rejects(f.emailService.request(anotherAccount, { role: 'teacher', email: 'another@example.test' }), /Please wait/);
  assert.equal(f.calls.length, 10);
  assert.equal(f.sentEmails.length, 10);
});

test('country, OTP attempt limits, expiry and resend cooldown are enforced', async (t) => {
  const f = fixture(t);
  for (const body of [
    { ...input, phone: '123' }, { ...input, country: 'US', phone: '+919876543210' },
    { ...input, country: 'invalid' }, { ...input, role: 'admin' },
  ]) await assert.rejects(f.service.request(scope, body), BadRequestException);
  assert.equal(f.calls.length, 0);
  const request = await f.service.request(scope, input);
  await assert.rejects(f.service.request(scope, input), /Please wait/);
  for (let i = 0; i < 5; i++) {
    await assert.rejects(f.service.verify(scope, { ...input, challengeId: request.challengeId, code: '000000' }), /Incorrect verification code/);
  }
  const calls = f.calls.length;
  await assert.rejects(f.service.verify(scope, { ...input, challengeId: request.challengeId, code: '123456' }), /too many attempts/);
  assert.equal(f.calls.length, calls);
  f.advance(60001);
  const resend = await f.service.request(scope, input);
  assert.equal(resend.challengeId, request.challengeId);
  assert.equal(resend.expiresAt, request.expiresAt);
  assert.equal(f.rows[0].attempts, 5);
  f.rows[0].attempts = 0;
  f.advance(10 * 60000);
  await assert.rejects(f.service.verify(scope, { ...input, challengeId: request.challengeId, code: '123456' }), /expired/);
});

test('verified proofs expire and provider or storage failures never authorize registration', async (t) => {
  const f = fixture(t);
  const proof = await f.verified('student');
  f.advance(10 * 60000);
  await assert.rejects(f.service.consume(scope, 'student', { ...input, phoneVerificationId: proof.verificationId }), /expired/);
  f.failDatabase();
  await assert.rejects(f.service.consume(scope, 'student', { ...input, phoneVerificationId: proof.verificationId }), ServiceUnavailableException);
});

test('missing configuration, provider failures and malformed provider replies are explicit', async (t) => {
  const f = fixture(t);
  delete process.env.TWILIO_AUTH_TOKEN;
  await assert.rejects(f.service.request(scope, input), /not configured/);
  assert.equal(f.calls.length, 0);
  process.env.TWILIO_AUTH_TOKEN = 'fixture-only-secret';
  f.advance(60001);
  f.provider(503);
  await assert.rejects(f.service.request(scope, input), ServiceUnavailableException);
  f.advance(60001);
  f.provider(200, { status: 'pending', sid: 'invalid' });
  await assert.rejects(f.service.request(scope, input), /invalid response/);
  assert.equal(f.rows.length, 0);
});

test('manual registration requires verified phone for both roles and a real, nonfuture student date of birth', async (t) => {
  const f = fixture(t);
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  const teacher = t.mock.method(auth, 'registerTeacherBySchool', async (payload: Row) => ({ ok: true, teacher: payload }));
  const student = t.mock.method(auth, 'registerStudentBySchool', async (payload: Row) => ({ ok: true, student: payload }));
  const score: LearningScoreService = Object.create(LearningScoreService.prototype);
  const controller = new SchoolController(auth, score, f.service, Object.create(RegistrationEmailService.prototype));
  const req = { user: { sub: scope.actorId, schoolId: scope.schoolId, role: 'school_admin' } };
  const body = { ...input, name: 'Test Teacher', email: 'teacher@example.test', loginId: 'teacher-fixture', password: 'fixture-password' };
  await assert.rejects(controller.registerTeacher(req, body), /Verify either the mobile number or email/);
  for (const dateOfBirth of [undefined, '', '2020-02-31', '2099-01-01']) {
    await assert.rejects(controller.registerStudent(req, { ...body, dateOfBirth }), /valid date of birth/);
  }
  await assert.rejects(controller.registerStudent(req, { ...body, dateOfBirth: '2014-06-15' }), /Verify either the mobile number or email/);
  for (const role of ['student', 'teacher']) {
    const other = { user: { ...req.user, role } };
    await assert.rejects(controller.requestRegistrationPhone(other, input), ForbiddenException);
    await assert.rejects(controller.verifyRegistrationPhone(other, {}), ForbiddenException);
    await assert.rejects(controller.registerTeacher(other, body), ForbiddenException);
  }
  assert.equal(teacher.mock.callCount(), 0);
  assert.equal(student.mock.callCount(), 0);
  const verified = await f.verified();
  for (const dateOfBirth of ['2020-02-31', '2099-01-01', 'not-a-date']) {
    await assert.rejects(controller.registerTeacher(req, { ...body, dateOfBirth, phoneVerificationId: verified.verificationId }), /valid date of birth/);
  }
  assert.equal(f.rows[0].status, 'verified');
  const result = await controller.registerTeacher(req, { ...body, dateOfBirth: '1988-02-29', phoneVerificationId: verified.verificationId });
  assert.equal(result.success, true);
  assert.equal(teacher.mock.calls[0].arguments[0].phone, '+919876543210');
  assert.equal(teacher.mock.calls[0].arguments[0].dateOfBirth, '1988-02-29');
  await assert.rejects(controller.registerTeacher(req, { ...body, phoneVerificationId: verified.verificationId }), /used/);
  assert.equal(teacher.mock.callCount(), 1);
});

test('student registration passes the verified international number and required date of birth to storage', async (t) => {
  const f = fixture(t);
  const proof = await f.verified('student');
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  const student = t.mock.method(auth, 'registerStudentBySchool', async (payload: Row) => ({ ok: true, student: payload }));
  const score: LearningScoreService = Object.create(LearningScoreService.prototype);
  const controller = new SchoolController(auth, score, f.service, Object.create(RegistrationEmailService.prototype));
  const result = await controller.registerStudent({ user: { sub: scope.actorId, schoolId: scope.schoolId, role: 'school_admin' } }, {
    ...input, phoneVerificationId: proof.verificationId, name: 'Test Student', className: 'Class 7',
    dateOfBirth: '2014-06-15', loginId: 'student-fixture', password: 'fixture-password',
  });
  assert.equal(result.success, true);
  assert.equal(student.mock.calls[0].arguments[0].phone, '+919876543210');
  assert.equal(student.mock.calls[0].arguments[0].dateOfBirth, '2014-06-15');
});

test('teacher creation validates and saves the phone and optional DOB in the account fallback and database row', async () => {
  const inserted: Row[] = [];
  let remembered: Row | undefined;
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = { from(table: string) {
    assert.equal(table, 'teachers');
    return { async insert(rows: Row[]) { inserted.push(...rows); return { error: null }; } };
  } };
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  Reflect.set(auth, 'db', db);
  Reflect.set(auth, 'rememberTeacher', (account: Row) => { remembered = account; });
  Reflect.set(auth, 'ensureTeacherRowInDb', async () => true);
  const payload = {
    schoolId: 'school-fixture', name: 'Test Teacher', email: 'teacher@example.test',
    loginId: 'phone-persistence-fixture', password: 'fixture-password', phone: '+919876543210', grades: ['Class 7'],
  };
  for (const dateOfBirth of ['2001-02-29', '2999-01-01']) {
    await assert.rejects(auth.registerTeacherBySchool({ ...payload, dateOfBirth }), /valid date of birth/);
  }
  assert.equal(inserted.length, 0);
  const result = await auth.registerTeacherBySchool({ ...payload, dateOfBirth: '1988-02-29' });
  assert.equal(result.ok, true);
  assert.equal(result.teacher?.phone, '+919876543210');
  assert.equal(remembered?.phone, '+919876543210');
  assert.equal(inserted[0].phone, '+919876543210');
  assert.equal(result.teacher?.dateOfBirth, '1988-02-29');
  assert.equal(remembered?.dateOfBirth, '1988-02-29');
  assert.equal(inserted[0].date_of_birth, '1988-02-29');
});

test('email OTPs are scoped, hashed, checked and atomically consumed across service instances', async (t) => {
  const f = fixture(t);
  const request = await f.emailService.request(scope, { role: 'teacher', email: ' Person@Example.test ' });
  assert.equal(f.sentEmails[0].to, 'person@example.test');
  assert.match(f.emailRows[0].code_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(f.emailRows[0].code_hash, f.sentEmails[0].code);
  await assert.rejects(f.emailService.verify(scope, {
    role: 'teacher', email: 'person@example.test', challengeId: request.challengeId, code: '000000',
  }), /Incorrect email verification code/);
  assert.equal(f.emailRows[0].status, 'pending');
  const proof = await f.emailService.verify(scope, {
    role: 'teacher', email: 'person@example.test', challengeId: request.challengeId, code: f.sentEmails[0].code,
  });
  const restarted = new RegistrationEmailService(f.db, f.email);
  const body = { email: 'person@example.test', emailVerificationId: proof.verificationId };
  for (const [otherScope, role, changes] of [
    [{ ...scope, schoolId: 'school-b' }, 'teacher', {}],
    [{ ...scope, actorId: 'admin-b' }, 'teacher', {}],
    [scope, 'student', {}],
    [scope, 'teacher', { email: 'other@example.test' }],
  ] as const) {
    await assert.rejects(restarted.consume(otherScope, role, { ...body, ...changes }), /missing, expired or used/);
  }
  const concurrent = await Promise.allSettled([
    restarted.consume(scope, 'teacher', body), f.emailService.consume(scope, 'teacher', body),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((result) => result.status === 'rejected').length, 1);
});

test('email resend limits, five-try limit, code expiry and proof expiry are enforced', async (t) => {
  const f = fixture(t);
  const request = await f.emailService.request(scope, { role: 'student', email: 'person@example.test' });
  await assert.rejects(f.emailService.request(scope, { role: 'student', email: 'person@example.test' }), /Please wait/);
  const body = { role: 'student', email: 'person@example.test', challengeId: request.challengeId, code: '000000' };
  for (let i = 0; i < 5; i++) await assert.rejects(f.emailService.verify(scope, body), /Incorrect email verification code/);
  await assert.rejects(f.emailService.verify(scope, { ...body, code: f.sentEmails[0].code }), /too many attempts/);
  f.emailRows[0].attempts = 0;
  f.advance(10 * 60000);
  await assert.rejects(f.emailService.verify(scope, { ...body, code: f.sentEmails[0].code }), /expired/);
  const proof = await f.emailVerified();
  f.advance(10 * 60000);
  await assert.rejects(f.emailService.consume(scope, 'teacher', {
    email: proof.email, emailVerificationId: proof.verificationId,
  }), /expired/);
});

test('email configuration, delivery and storage failures do not produce usable verification', async (t) => {
  const f = fixture(t);
  f.email.isConfigured = () => false;
  await assert.rejects(f.emailService.request(scope, { role: 'student', email: 'person@example.test' }), /not configured/);
  assert.equal(f.sentEmails.length, 0);
  f.email.isConfigured = () => true;
  f.email.sendMail = async () => ({ ok: false, error: 'Fixture delivery failed' });
  await assert.rejects(f.emailService.request(scope, { role: 'student', email: 'person@example.test' }), /Fixture delivery failed/);
  assert.equal(f.emailRows[0].status, 'failed');
  await assert.rejects(f.emailService.verify(scope, {
    role: 'student', email: 'person@example.test', challengeId: f.emailRows[0].id, code: '000000',
  }), /expired, is used/);
  f.advance(60001);
  f.failDatabase();
  await assert.rejects(f.emailService.request(scope, { role: 'student', email: 'person@example.test' }), ServiceUnavailableException);
});

test('either email or SMS authorizes school registration, but a valid mobile number is always required', async (t) => {
  for (const role of ['student', 'teacher'] as const) {
    await t.test(`${role} can register with email verification and no SMS`, async (t) => {
      const f = fixture(t);
      const proof = await f.emailVerified(role);
      const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
      const teacher = t.mock.method(auth, 'registerTeacherBySchool', async (payload: Row) => ({ ok: true, teacher: payload }));
      const student = t.mock.method(auth, 'registerStudentBySchool', async (payload: Row) => ({ ok: true, student: payload }));
      const sms = t.mock.method(f.service, 'consume', async () => { throw new Error('SMS must not be required for email verification'); });
      const score: LearningScoreService = Object.create(LearningScoreService.prototype);
      const controller = new SchoolController(auth, score, f.service, f.emailService);
      const req = { user: { sub: scope.actorId, schoolId: scope.schoolId, role: 'school_admin' } };
      const body = { ...input, email: ' Person@Example.test ', emailVerificationId: proof.verificationId,
        dateOfBirth: '2014-06-15', name: 'Test Account', className: 'Class 7', loginId: 'test-account', password: 'fixture-password' };
      for (const phone of ['', '123']) {
        await assert.rejects(role === 'student' ? controller.registerStudent(req, { ...body, phone }) : controller.registerTeacher(req, { ...body, phone }), /valid mobile/);
      }
      const result = role === 'student' ? await controller.registerStudent(req, body) : await controller.registerTeacher(req, body);
      assert.equal(result.success, true);
      const call = (role === 'student' ? student : teacher).mock.calls[0];
      assert.equal(call.arguments[0].phone, '+919876543210');
      assert.equal(call.arguments[0].email, 'person@example.test');
      assert.equal(sms.mock.callCount(), 0);
      assert.equal(f.calls.length, 0);
      await assert.rejects(role === 'student' ? controller.registerStudent(req, body) : controller.registerTeacher(req, body), /used/);
      for (const otherRole of ['student', 'teacher']) {
        await assert.rejects(controller.requestRegistrationEmail({ user: { ...req.user, role: otherRole } }, body), ForbiddenException);
        await assert.rejects(controller.verifyRegistrationEmail({ user: { ...req.user, role: otherRole } }, body), ForbiddenException);
      }
    });
  }
});
