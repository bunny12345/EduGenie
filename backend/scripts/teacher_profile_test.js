// Run with: node -r ts-node/register/transpile-only scripts/teacher_profile_test.js
const assert = require('node:assert/strict');
const { TeacherController } = require('../src/controllers/teacher.controller');

async function main() {
  const local = {
    id: 'fixture-teacher',
    name: 'Local Teacher',
    subject: 'Mathematics',
    gender: 'female',
    loginId: 'local-teacher',
    grades: ['Class 6', 'Class 9'],
  };
  let fail = false;
  const controller = Object.assign(Object.create(TeacherController.prototype), {
    db: {
      client: {
        from(table) {
          if (fail) throw new Error('Fixture database unavailable');
          return {
            select() { return this; },
            eq(column, value) {
              assert.equal(column, 'id');
              assert.equal(value, table === 'teachers' ? local.id : 'fixture-school');
              return this;
            },
            async single() {
              return {
                data: table === 'teachers'
                  ? {
                      id: local.id,
                      name: 'Database Teacher',
                      subject: 'Science',
                      gender: 'male',
                      login_id: 'db-teacher',
                      grades: [9, 'Class 6', 9],
                      password_hash: 'must-not-be-returned',
                    }
                  : { name: 'Fixture School' },
              };
            },
          };
        },
      },
    },
    studentAuth: {
      getLocalTeacher(id) {
        assert.equal(id, local.id);
        return local;
      },
      async resolveTeacherGrades(id) {
        assert.equal(id, local.id);
        return local.grades;
      },
    },
  });
  const req = { user: { sub: local.id, role: 'teacher', schoolId: 'fixture-school' } };
  const result = await controller.teacherProfile(req);
  assert.equal(result.success, true);
  assert.equal(result.profile.name, 'Database Teacher');
  assert.equal(result.profile.subject, 'Science');
  assert.equal(result.profile.gender, 'male');
  assert.equal(result.profile.loginId, 'db-teacher');
  assert.deepEqual(result.profile.grades, ['Class 6', 'Class 9']);
  assert.equal(result.profile.schoolName, 'Fixture School');
  assert.equal(result.profile.password_hash, undefined);
  fail = true;
  const fallback = await controller.teacherProfile(req);
  assert.equal(fallback.profile.gender, 'female');
  assert.equal(fallback.profile.loginId, 'local-teacher');
  assert.deepEqual(fallback.profile.grades, local.grades);
  delete local.gender;
  delete local.loginId;
  assert.equal((await controller.teacherProfile(req)).profile.gender, null);
  assert.equal((await controller.teacherProfile(req)).profile.loginId, null);
  await assert.rejects(controller.teacherProfile({ user: { role: 'student' } }), /Teacher access required/);
  console.log('Teacher profile fixtures passed (database, local fallback, missing fields, role check).');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
