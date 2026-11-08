import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { EmailService } from '../auth/email.service';
import { AuthGuard } from '../auth/auth.guard';
import { LearningScoreService } from '../progress/learning-score.service';
import { SchoolController } from './school.controller';
import { ReportCardsController } from './report-cards.controller';

test('school progress routes use verified school scope and the shared reports', async (t) => {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {
    students: [
      { id: 'student-a', name: 'Asha', school_id: 'school-a', class_name: 'Class 8' },
      { id: 'student-b', name: 'Banu', school_id: 'school-a', class_name: 'Class 8' },
      { id: 'student-c', name: 'Chitra', school_id: 'school-a', class_name: 'Class 9' },
      { id: 'outsider', name: 'Other School', school_id: 'school-b', class_name: 'Class 8' },
      { id: 'unscoped', name: 'No School', class_name: 'Class 8' }
    ],
    report_exams: [
      { id: 'exam-a', school_id: 'school-a', class_name: 'Class 8', name: 'Term 1', max_marks: 100 },
      { id: 'exam-pending', school_id: 'school-a', class_name: 'Class 8', name: 'Term 2', max_marks: 100 },
      { id: 'exam-other', school_id: 'school-b', class_name: 'Class 8', name: 'Other exam', max_marks: 100 }
    ],
    report_exam_marks: [
      { exam_id: 'exam-a', student_id: 'student-a', subject: 'Mathematics', marks: 80 },
      { exam_id: 'exam-a', student_id: 'student-a', subject: 'Science', marks: 90 },
      { exam_id: 'exam-a', student_id: 'student-b', subject: 'Mathematics', marks: 90 },
      { exam_id: 'exam-a', student_id: 'student-b', subject: 'Science', marks: 95 },
      { exam_id: 'exam-pending', student_id: 'student-a', subject: 'Mathematics', marks: 85 }
    ]
  };
  const ranges: number[] = [];
  let rosterError = false;
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = {
    from(table: string) {
      let rows = [...(tables[table] || [])];
      let error: { message: string } | null = null;
      const query = {
        select(columns: string) {
          if (table === 'students' && columns !== '*') {
            assert.equal(columns, 'id,name,class_name,school_id');
            if (rosterError) error = { message: 'Test roster unavailable' };
          }
          return query;
        },
        eq(key: string, value: unknown) {
          rows = rows.filter((row) => row[key] === value);
          return query;
        },
        in(key: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[key]));
          return query;
        },
        order(key: string) {
          rows.sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')));
          return query;
        },
        range(from: number, to: number) {
          ranges.push(from);
          rows = rows.slice(from, to + 1);
          return query;
        },
        limit(limit: number) { rows = rows.slice(0, limit); return query; },
        then(resolve: (result: { data: Row[]; error: { message: string } | null }) => void) {
          resolve({ data: rows, error });
        }
      };
      return query;
    }
  };
  db.verifyJwt = async (token: string) => {
    if (token === 'school-a') return { sub: 'school-a', role: 'school_admin', schoolId: 'school-a' };
    if (token === 'teacher') return { sub: 'teacher-a', role: 'teacher', schoolId: 'school-a' };
    if (token === 'student') return { sub: 'student-a', role: 'student', schoolId: 'school-a' };
    return null;
  };
  const auth = new StudentAuthService(db, Object.create(EmailService.prototype));
  const scoreCalls: string[] = [];
  const score = { success: true, score: 335, maxScore: 1000, dimensions: [], subjects: [], trend: [], hasData: true };
  @Module({
    controllers: [SchoolController, ReportCardsController],
    providers: [
      AuthGuard,
      { provide: SupabaseService, useValue: db },
      { provide: StudentAuthService, useValue: {
        schoolAdminSchoolId: auth.schoolAdminSchoolId.bind(auth),
        resolveSchoolStudentProfile: auth.resolveSchoolStudentProfile.bind(auth),
        resolveStudentProfile: auth.resolveStudentProfile.bind(auth),
        listSchoolProgressStudents: auth.listSchoolProgressStudents.bind(auth),
        getLocalTeacher: () => null,
        resolveTeacherGrades: async () => ['Class 8'],
        resolveTeacherSubject: async () => 'Mathematics',
        listClassTeachers: async () => [
          { id: 'teacher-m', name: 'Math Teacher', subject: 'Mathematics' },
          { id: 'teacher-s', name: 'Science Teacher', subject: 'Science' }
        ]
      } },
      { provide: LearningScoreService, useValue: {
        getLearningScore: async (id: string) => { scoreCalls.push(id); return score; }
      } }
    ]
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const request = (path: string, token = 'school-a') =>
    fetch(`${base}${path}`, { headers: token ? { Authorization: token } : {} });
  type RosterResponse = Awaited<ReturnType<SchoolController['progressStudents']>>;
  type CardsResponse = {
    success: boolean; studentName: string;
    reportCards: Array<{ total: number; rank: number; classSize: number; celebrationPending: boolean }>;
    pending: Array<{ examName: string; missingSubjects: string[] }>;
  };

  await t.test('requires authentication and administrator role', async () => {
    for (const path of ['/school/progress/students', '/school/students/student-a/learning-score', '/school/students/student-a/report-cards']) {
      assert.equal((await request(path, '')).status, 401);
      assert.equal((await request(path, 'teacher')).status, 403);
      assert.equal((await request(path, 'student')).status, 403);
    }
  });
  await t.test('returns only minimal school roster fields and all available classes', async () => {
    const res = await request('/school/progress/students?schoolId=school-b');
    assert.equal(res.status, 200);
    const data = await res.json() as RosterResponse;
    assert.deepEqual(data.classes, ['Class 8', 'Class 9']);
    assert.deepEqual(data.students.map((s: { id: string }) => s.id), ['student-a', 'student-b', 'student-c']);
    assert.deepEqual(Object.keys(data.students[0]).sort(), ['className', 'id', 'name']);
  });
  await t.test('does not truncate the school roster after 500 students', async () => {
    const added = Array.from({ length: 503 }, (_, i) => ({
      id: `z-${String(i).padStart(4, '0')}`, name: `Learner ${i}`, school_id: 'school-a', class_name: 'Class 10'
    }));
    tables.students.push(...added);
    ranges.length = 0;
    const data = await (await request('/school/progress/students')).json() as RosterResponse;
    assert.equal(data.students.length, 506);
    assert.deepEqual(ranges, [0, 500]);
    assert.ok(data.students.some((s: { id: string }) => s.id === 'z-0502'));
    tables.students.splice(5);
  });
  await t.test('rejects unknown, unscoped and other-school students before computing scores', async () => {
    scoreCalls.length = 0;
    for (const id of ['outsider', 'unscoped', 'missing']) {
      for (const suffix of ['learning-score', 'report-cards']) {
        assert.equal((await request(`/school/students/${id}/${suffix}?schoolId=school-b`)).status, 403);
      }
    }
    assert.deepEqual(scoreCalls, []);
  });
  await t.test('uses the identical learning-score payload for the selected student', async () => {
    const data = await (await request('/school/students/student-c/learning-score')).json();
    assert.deepEqual(data, { ...score, studentId: 'student-c' });
    assert.deepEqual(scoreCalls, ['student-c']);
  });
  await t.test('returns released cards, full ranks and pending subjects without celebrations', async () => {
    const data = await (await request('/school/students/student-a/report-cards')).json() as CardsResponse;
    assert.equal(data.success, true);
    assert.equal(data.studentName, 'Asha');
    assert.equal(data.reportCards.length, 1);
    assert.equal(data.reportCards[0].total, 170);
    assert.equal(data.reportCards[0].rank, 2);
    assert.equal(data.reportCards[0].classSize, 2);
    assert.equal(data.reportCards[0].celebrationPending, false);
    assert.deepEqual(data.pending[0].missingSubjects, ['Science']);
    assert.equal(data.pending[0].examName, 'Term 2');
  });
  await t.test('preserves student and teacher report cards while showing all ranks to school admins', async () => {
    for (let i = 0; i < 3; i++) {
      tables.students.push({ id: `rank-${i}`, name: `Rank learner ${i}`, school_id: 'school-a', class_name: 'Class 8' });
      for (const subject of ['Mathematics', 'Science']) {
        tables.report_exam_marks.push({ exam_id: 'exam-a', student_id: `rank-${i}`, subject, marks: 98 });
      }
    }
    const school = await (await request('/school/students/student-a/report-cards')).json() as CardsResponse;
    const teacher = await (await request('/teacher/students/student-a/report-cards', 'teacher')).json() as CardsResponse;
    const student = await (await request('/progress/report-cards', 'student')).json() as CardsResponse;
    assert.equal(school.reportCards[0].rank, 5);
    assert.equal(teacher.reportCards[0].rank, 5);
    assert.equal(student.reportCards[0].rank, null);
    assert.equal(student.reportCards[0].total, school.reportCards[0].total);
    assert.equal(teacher.reportCards[0].total, school.reportCards[0].total);
    tables.students.splice(5);
    tables.report_exam_marks.splice(5);
  });
  await t.test('reports a roster database failure rather than an empty success', async () => {
    rosterError = true;
    assert.equal((await request('/school/progress/students')).status, 503);
    rosterError = false;
  });
});
