import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { StudentAuthService } from '../auth/student-auth.service';
import { LearningScoreService } from '../progress/learning-score.service';
import { SupabaseService } from '../supabase.service';
import { AttendanceController } from './attendance.controller';

type Row = Record<string, string | boolean>;
const period = { startDate: '2000-01-10', endDate: '2000-01-31' };
const teacher = (sub = 'teacher') => ({ user: { role: 'teacher', sub, schoolId: 'school' } });
const student = (sub = 'a') => ({ user: { role: 'student', sub } });

function fixture() {
  const rows: Row[] = [];
  const db = Object.create(SupabaseService.prototype) as SupabaseService;
  const store = (incoming: Row[]) => {
    for (const mark of incoming) {
      const i = rows.findIndex((row) => ['school_id', 'class_key', 'attendance_date', 'student_id'].every((key) => row[key] === mark[key]));
      if (i < 0) rows.push(mark);
      else rows[i] = mark;
    }
    return { error: null };
  };
  db.client = { from: () => {
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select: () => query,
      order: () => query,
      eq: (key: string, value: string) => { filters.push((row) => row[key] === value); return query; },
      gte: (key: string, value: string) => { filters.push((row) => String(row[key]) >= value); return query; },
      lte: (key: string, value: string) => { filters.push((row) => String(row[key]) <= value); return query; },
      range: async (start: number, end: number) => ({ data: rows.filter((row) => filters.every((filter) => filter(row))).slice(start, end + 1), error: null }),
      insert: async (marks: Row[]) => store(marks),
      upsert: async (marks: Row[]) => store(marks),
    };
    return query;
  } };
  const auth = Object.create(StudentAuthService.prototype) as StudentAuthService;
  auth.resolveTeacherGrades = async (id) => id === 'other-teacher' ? ['Class 9'] : ['Class 8'];
  auth.listSchoolProgressStudents = async () => [
    { id: 'a', name: 'Student A', className: 'Class 8' },
    { id: 'b', name: 'Student B', className: 'Class 8' },
    { id: 'c', name: 'Student C', className: 'Class 9' },
  ];
  auth.resolveStudentProfile = async (id) => ({ id, name: '', schoolId: 'school', className: 'Class 8', teacherId: '' });
  const learning = Object.create(LearningScoreService.prototype) as LearningScoreService;
  learning.getSchoolProgressPeriod = async () => period;
  return { rows, controller: new AttendanceController(db, auth, learning) };
}

test('only saved marks count, and another assigned teacher can correct one student without changing the others', async () => {
  const { controller, rows } = fixture();
  const day = '2000-01-11';
  const draft = await controller.register(teacher(), 'Class 8', day);
  assert.deepEqual(draft.students.map(({ id, present }) => [id, present]), [['a', true], ['b', true]]);
  assert.equal(draft.saved, false);
  assert.equal((await controller.student(student())).percentage, null);
  await controller.save(teacher(), { className: 'Class 8', date: day, saved: false, entries: [
    { studentId: 'a', present: false }, { studentId: 'b', present: false },
  ] });
  const register = await controller.register(teacher('second'), 'Class 8', day);
  assert(register.saved);
  assert(register.students.every((mark) => mark.recorded && !mark.present));
  await controller.save(teacher('second'), { className: 'Class 8', date: day, saved: true, entries: [{ studentId: 'a', present: true }] });
  await controller.save(teacher(), { className: 'Class 8', date: '2000-01-13', saved: false, entries: [
    { studentId: 'a', present: false }, { studentId: 'b', present: true },
  ] });
  rows.push({ school_id: 'school', class_key: 'class 8', attendance_date: '2000-01-09', student_id: 'a', present: false });
  rows.push({ school_id: 'another-school', class_key: 'class 8', attendance_date: '2000-01-12', student_id: 'a', present: false });
  const result = await controller.student(student());
  assert.equal(result.percentage, 50);
  assert.deepEqual(result.records, [{ date: '2000-01-13', present: false }, { date: day, present: true }]);
  assert.deepEqual((await controller.student(student('b'))).records.at(-1), { date: day, present: false });
});

test('rejects unauthorized classes and students, wrong dates and incomplete initial registers', async () => {
  const { controller } = fixture();
  const body = { className: 'Class 8', date: '2000-01-11', saved: false, entries: [{ studentId: 'a', present: true }] };
  await assert.rejects(controller.save(teacher('other-teacher'), body), /assigned classes/);
  await assert.rejects(controller.save(student(), body), /Teacher access/);
  await assert.rejects(controller.student(teacher()), /Student access/);
  await assert.rejects(controller.save(teacher(), { ...body, date: '2000-02-01' }), /within the school progress period/);
  await assert.rejects(controller.save(teacher(), { ...body, entries: [{ studentId: 'c', present: true }] }), /not in this class/);
  await assert.rejects(controller.save(teacher(), body), /register or roster changed/);
});
