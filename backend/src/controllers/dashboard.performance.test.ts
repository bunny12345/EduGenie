import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'crypto';
import { DashboardController } from './dashboard.controller';
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
    announcements: [{ id: 'notice', title: 'Notice', message: 'Hello', created_at: today }],
    test_attempts: [],
    orchard_activity: [],
  };
  let pending = 0;
  let peak = 0;
  const reads: string[] = [];
  const db = Object.create(SupabaseService.prototype);
  db.client = {
    from(table: string) {
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
        then(resolve: (result: { data: Record<string, unknown>[]; error: null }) => void) {
          reads.push(table);
          pending++;
          peak = Math.max(peak, pending);
          return new Promise<void>((done) => setImmediate(() => {
            pending--;
            resolve({ data: tables[table] || [], error: null });
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
  const feed = Object.create(LocalFeedService.prototype);
  feed.listHomeworkForStudent = () => [];
  feed.listAnnouncements = () => [];
  const controller = new DashboardController(db, feed, auth);
  const response = await controller.getDashboard({ studentId }, studentId);
  assert.equal(response.success, true);
  assert.equal(response.greetingName, 'Student');
  assert.equal(response.schoolName, 'Test School');
  assert.equal(response.loginId, 'test-login');
  assert.deepEqual(response.todayPlan.map((item) => item.title), ['Current class']);
  assert.deepEqual(response.classTeachers.map((teacher) => teacher.subject), ['Science']);
  assert.equal(response.streak.activeToday, true);
  assert.equal(response.announcements[0].title, 'Notice');
  assert(peak >= 5, `Expected independent queries in flight together, got ${peak}`);
  assert.equal(reads.filter((table) => table === 'homework').length, 1);
  const count = reads.length;
  assert.deepEqual(await controller.getDashboard({ studentId }, studentId), response);
  assert.equal(reads.length, count, 'existing dashboard cache must still avoid repeated reads');
});
