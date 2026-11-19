import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'crypto';
import { DashboardController } from './dashboard.controller';
import { TeacherController } from './teacher.controller';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { LocalFeedService } from '../shared/local-feed.service';

test('dashboard reads independent panels concurrently while preserving profile, class filtering and streak data', async () => {
  const studentId = randomUUID();
  const today = new Date().toISOString();
  const tables: Record<string, Array<Record<string, unknown>>> = {
    students: [{ gender: 'female', login_id: 'test-login' }],
    schools: [{ school_name: 'Test School' }],
    homework: [
      { title: 'Current class', class_name: 'Class 8', status: 'submitted', submitted_at: today },
      { title: 'Other class', class_name: 'Class 9' },
    ],
    progress_metrics: [],
    memories: [{ key: 'Fractions', value: 'Revision' }],
    announcements: [
      { id: 'notice', title: 'Notice', message: 'Hello', audience: 'students', created_at: today },
      { id: 'class-post', title: 'Class notice', audience: 'class:Class 8', target_class: 'Class 8', created_by: 'teacher', created_at: today },
      { id: 'other-school', title: 'Other school', audience: 'class:Class 8', created_by: 'other-teacher', created_at: today },
      { id: 'other-class', title: 'Other class', audience: 'class:Class 9', created_by: 'teacher', created_at: today },
      { id: 'scheduled', title: 'Scheduled', audience: 'class:Class 8', created_by: 'teacher', start_at: '2099-01-01T00:00:00Z' },
      { id: 'expired', title: 'Expired', audience: 'class:Class 8', created_by: 'teacher', end_at: '2000-01-01T00:00:00Z' },
    ],
    test_attempts: [],
    orchard_activity: [],
  };
  let pending = 0;
  let peak = 0;
  const reads: string[] = [];
  let writeError: { message: string } | null = null;
  let skipWrite = false;
  const db = Object.create(SupabaseService.prototype);
  db.client = {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | undefined;
      const query = {
        select: () => query, order: () => query, limit: () => query, range: () => query,
        eq: (key: string, value: unknown) => {
          if (table === 'announcements') filters.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
        update: (values: Record<string, unknown>) => { patch = values; return query; },
        then(resolve: (result: { data: Record<string, unknown>[]; error: typeof writeError }) => void) {
          reads.push(table);
          pending++;
          peak = Math.max(peak, pending);
          return new Promise<void>((done) => setImmediate(() => {
            pending--;
            let rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
            if (patch && (writeError || skipWrite)) rows = [];
            else if (patch) rows.forEach((row) => Object.assign(row, patch));
            resolve({ data: rows, error: patch ? writeError : null });
            done();
          }));
        },
      };
      return query;
    },
  };
  const auth = Object.create(StudentAuthService.prototype);
  auth.resolveStudentProfile = async () => ({
    id: studentId, name: 'Student', className: 'Class 8', schoolId: 'school', teacherId: 'teacher',
  });
  auth.listClassTeachers = async () => [{ id: 'teacher', name: 'Teacher', subject: 'Science' }];
  const feed = new LocalFeedService();
  const controller = new DashboardController(db, feed, auth);
  const response = await controller.getDashboard({ studentId }, studentId);
  assert.equal(response.success, true);
  assert.equal(response.greetingName, 'Student');
  assert.equal(response.schoolName, 'Test School');
  assert.equal(response.loginId, 'test-login');
  assert.deepEqual(response.todayPlan.map((item) => item.title), ['Current class']);
  assert.deepEqual(response.classTeachers.map((teacher) => teacher.subject), ['Science']);
  assert.equal(response.streak.activeToday, true);
  assert.deepEqual(response.announcements.map((a) => a.id), ['notice', 'class-post']);
  assert(peak >= 5, `Expected independent queries in flight together, got ${peak}`);
  assert.equal(reads.filter((table) => table === 'homework').length, 1);
  const count = reads.length;
  assert.deepEqual(await controller.getDashboard({ studentId }, studentId), response);
  assert.equal(reads.length, count, 'existing dashboard cache must still avoid repeated reads');

  const teacher = new TeacherController(db, auth, feed, null!, null!);
  const req = { user: { role: 'teacher', sub: 'teacher' } };
  const edit = { title: 'Updated class notice', message: 'New details', className: 'Class 9' };
  writeError = { message: 'Could not save' };
  assert.deepEqual(await teacher.updateAnnouncement('class-post', req, edit), { success: false, error: 'Could not save' });
  writeError = null;
  skipWrite = true;
  assert.equal((await teacher.updateAnnouncement('class-post', req, edit)).success, false);
  skipWrite = false;
  assert.equal((await teacher.updateAnnouncement('class-post', req, edit)).success, true);
  const refreshed = await controller.getDashboard({ studentId }, studentId);
  assert.deepEqual(refreshed.announcements.find((a) => a.id === 'class-post'), {
    id: 'class-post', title: edit.title, message: edit.message, audience: 'class:Class 8', createdAt: today,
  });
});
