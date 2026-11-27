#!/usr/bin/env node
// Seeds FAKE schools, teachers and students into the DEV Supabase project only.
// Passwords are random and written to ~/.academix-dev/test-accounts.txt (mode 600).
// Safe to re-run: it does nothing if the dev school already exists.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomBytes, randomUUID, createHash } = require('crypto');
const { createClient } = require('../../backend/node_modules/@supabase/supabase-js');

const DEV_REF = 'mgrkatzzzkuyudwakshx';
const PROD_REF = 'htydcedtuuczxjwtqrqx';
const envFile = path.join(os.homedir(), '.academix-dev', 'backend.env');
const out = path.join(os.homedir(), '.academix-dev', 'test-accounts.txt');

if (!fs.existsSync(envFile)) { console.error('Run ./dev.sh deploy backend first (creates the dev env file).'); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!String(env.SUPABASE_URL).includes(DEV_REF) || String(env.SUPABASE_URL).includes(PROD_REF)) { console.error('Refusing: not the dev project.'); process.exit(1); }

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const hash = (password, salt) => createHash('sha256').update(`${salt}:${password}`).digest('hex');
const cred = () => { const salt = randomBytes(12).toString('hex'); const password = `Dev-${randomBytes(6).toString('hex')}`; return { salt, password, hash: hash(password, salt) }; };
const must = (label, { error }) => { if (error) { console.error(`${label} failed: ${error.message}`); process.exit(1); } };

(async () => {
  const email = 'dev-school@academix-dev.test';
  const existing = await db.from('schools').select('id').eq('email', email).limit(1);
  must('school lookup', existing);
  if (existing.data?.length) { console.log('Dev seed already present; nothing to do. See', out); return; }

  const lines = ['AcademiX DEV test accounts (fake data, dev environment only)', ''];
  const now = new Date().toISOString();
  const schoolId = randomUUID();
  const school = cred();
  must('school', await db.from('schools').insert([{ id: schoolId, email, school_name: 'AcademiX Dev School', branch: 'Main', location: 'Test City', password_salt: school.salt, password_hash: school.hash, created_at: now }]));
  lines.push(`SCHOOL    login: ${email}   password: ${school.password}`);

  const teachers = [
    { loginId: 'dev-teacher-math', name: 'Dev Teacher Math', subject: 'Mathematics', grades: ['Class 5'] },
    { loginId: 'dev-teacher-science', name: 'Dev Teacher Science', subject: 'Science', grades: ['Class 5', 'Class 6'] },
    { loginId: 'dev-teacher-english', name: 'Dev Teacher English', subject: 'English', grades: ['Class 7'] },
  ];
  const teacherIds = {};
  for (const t of teachers) {
    const id = randomUUID(); const c = cred(); teacherIds[t.loginId] = id;
    must(`teacher ${t.loginId}`, await db.from('teachers').insert([{ id, school_id: schoolId, name: t.name, email: `${t.loginId}@academix-dev.test`, subject: t.subject, login_id: t.loginId, password_salt: c.salt, password_hash: c.hash, grades: t.grades, created_at: now }]));
    lines.push(`TEACHER   login: ${t.loginId}   password: ${c.password}   (${t.subject}; ${t.grades.join(', ')})`);
  }

  const students = [
    ['dev-student-5a', 'Asha Dev', 'Class 5', 'dev-teacher-math'], ['dev-student-5b', 'Ravi Dev', 'Class 5', 'dev-teacher-math'],
    ['dev-student-6a', 'Meera Dev', 'Class 6', 'dev-teacher-science'], ['dev-student-6b', 'Kiran Dev', 'Class 6', 'dev-teacher-science'],
    ['dev-student-7a', 'Anil Dev', 'Class 7', 'dev-teacher-english'], ['dev-student-7b', 'Sara Dev', 'Class 7', 'dev-teacher-english'],
  ];
  for (const [loginId, name, className, teacher] of students) {
    const id = randomUUID(); const c = cred();
    must(`student ${loginId}`, await db.from('students').insert([{ id, name, class_name: className, school_id: schoolId, teacher_id: teacherIds[teacher] }]));
    must(`student account ${loginId}`, await db.from('student_accounts').insert([{ student_id: id, login_id: loginId, password_salt: c.salt, password_hash: c.hash, name, class_name: className, school_id: schoolId, teacher_id: teacherIds[teacher], created_at: now }]));
    lines.push(`STUDENT   login: ${loginId}   password: ${c.password}   (${className})`);
  }

  fs.writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`Seeded 1 school, ${teachers.length} teachers, ${students.length} students (fake data).`);
  console.log(`Credentials saved to ${out} (readable only by you).`);
})();
