import { test, TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'crypto';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { EmailService } from '../auth/email.service';

const retention = 48 * 60 * 60 * 1000;
const now = Date.parse('2026-11-09T18:00:00Z');

function configure(t: TestContext) {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://support.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  t.after(() => {
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  });
}

function clock(t: TestContext) {
  let time = now;
  t.mock.method(Date, 'now', () => time);
  return { tick: (milliseconds: number) => { time += milliseconds; } };
}

function fixture() {
  const schoolId = randomUUID();
  const rows = [
    { role: 'student', status: 'resolved', age: retention },
    { role: 'teacher', status: 'resolved', age: retention + 1 },
    { role: 'school_admin', status: 'resolved', age: retention + 1000 },
    { role: 'student', status: 'resolved', age: retention - 1 },
    { role: 'teacher', status: 'open', age: retention * 3 },
  ].map(({ role, status, age }) => ({
    id: randomUUID(), requester_id: role === 'school_admin' ? schoolId : randomUUID(),
    requester_role: role, school_id: schoolId, requester_name: 'Test requester', class_name: '',
    category: 'glitch', subject: 'Test request', status,
    created_at: new Date(now - retention * 4).toISOString(),
    updated_at: new Date(now - age).toISOString(),
  }));
  const messages = rows.map((row) => ({ id: randomUUID(), ticket_id: row.id }));
  const state = { rows, messages, fail: false, deletes: 0 };
  const db = Object.create(SupabaseService.prototype);
  db.client = {
    from: (table: string) => {
      const filters: Array<(row: typeof rows[number]) => boolean> = [];
      let action = 'select';
      let update: Partial<typeof rows[number]> = {};
      const query = {
        select: () => query,
        delete: () => { action = 'delete'; return query; },
        update: (value: typeof update) => { action = 'update'; update = value; return query; },
        eq: (key: keyof typeof rows[number], value: string) => { filters.push((row) => row[key] === value); return query; },
        neq: (key: keyof typeof rows[number], value: string) => { filters.push((row) => row[key] !== value); return query; },
        lte: (key: 'updated_at', value: string) => { filters.push((row) => row[key] <= value); return query; },
        order: () => query,
        range: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => void) => Promise.resolve().then(() => {
          if (state.fail) return resolve({ data: null, error: { message: 'cleanup unavailable' } });
          if (table === 'schools') return resolve({ data: [{ id: schoolId, school_name: 'Test School' }], error: null });
          const matches = state.rows.filter((row) => filters.every((filter) => filter(row)));
          if (action === 'delete') {
            assert.equal(table, 'support_tickets');
            state.deletes++;
            const ids = new Set(matches.map((row) => row.id));
            state.rows = state.rows.filter((row) => !ids.has(row.id));
            // Mirrors the existing support_messages ON DELETE CASCADE constraint.
            state.messages = state.messages.filter((message) => !ids.has(message.ticket_id));
          } else if (action === 'update') {
            for (const row of matches) Object.assign(row, update);
          }
          resolve({ data: table === 'support_messages' ? state.messages : matches, error: null });
        }),
      };
      return query;
    },
  };
  const auth = Object.create(StudentAuthService.prototype);
  auth.resolveStudentProfile = async (id: string) => ({ id, schoolId, name: 'Test Student', className: '', teacherId: '' });
  const service = new SupportService(db, auth, Object.create(EmailService.prototype));
  return { service, state, schoolId };
}

test('resolved tickets expire at exactly 48 hours across roles, not creation time or last open activity', async (t) => {
  configure(t);
  const time = clock(t);
  const { service, state } = fixture();
  const recent = state.rows[3];
  const open = state.rows[4];
  await service.cleanupResolvedTickets();
  assert.deepEqual(state.rows.map((row) => row.id), [recent.id, open.id]);
  assert.deepEqual(state.messages.map((message) => message.ticket_id), [recent.id, open.id]);
  time.tick(1);
  await service.cleanupResolvedTickets();
  assert.deepEqual(state.rows.map((row) => row.id), [open.id]);
});

test('reopening preserves a request and resolving again starts a fresh 48-hour period', async (t) => {
  configure(t);
  const time = clock(t);
  const { service, state } = fixture();
  const ticket = state.rows[3];
  await service.status(ticket.id, 'open');
  time.tick(retention);
  await service.cleanupResolvedTickets();
  assert(state.rows.includes(ticket));
  await service.status(ticket.id, 'resolved');
  const resolvedAt = ticket.updated_at;
  time.tick(1000);
  await service.status(ticket.id, 'resolved');
  assert.equal(ticket.updated_at, resolvedAt, 'repeating resolved must not postpone expiry');
  time.tick(retention - 1001);
  await service.cleanupResolvedTickets();
  assert(state.rows.includes(ticket));
  time.tick(1);
  await service.cleanupResolvedTickets();
  assert(!state.rows.includes(ticket));
});

test('reads purge overdue requests after downtime and expired threads cannot be reopened', async (t) => {
  configure(t);
  clock(t);
  const { service, state, schoolId } = fixture();
  const expiredId = state.rows[0].id;
  const studentId = state.rows[3].requester_id;
  const studentList = await service.list({ actorId: studentId, actorRole: 'student' });
  assert.equal(studentList.tickets.length, 1);
  assert.equal(studentList.tickets[0].requester_id, studentId);
  assert.equal((await service.list({ actorId: schoolId, actorRole: 'school_admin' })).tickets.length, 0);
  assert.equal((await service.list()).tickets.length, 2);
  await assert.rejects(service.detail(expiredId), NotFoundException);
  await assert.rejects(service.status(expiredId, 'open'), NotFoundException);
});

test('startup and minute sweeps clean up without visits, stop on destruction and retry logged failures', async (t) => {
  configure(t);
  const time = clock(t);
  const interval = t.mock.method(global, 'setInterval');
  const clear = t.mock.method(global, 'clearInterval');
  const log = t.mock.method(console, 'error', () => {});
  const { service, state } = fixture();
  t.after(() => service.onModuleDestroy());
  await service.onModuleInit();
  assert.equal(state.rows.length, 2);
  assert.equal(interval.mock.calls[0].arguments[1], 60000);
  const sweep = interval.mock.calls[0].arguments[0];
  state.fail = true;
  time.tick(60000);
  sweep();
  // Allow the scheduled query and error reporting to complete.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert(log.mock.calls.some((call) => String(call.arguments[0]).includes('Scheduled resolved-request cleanup failed')));
  state.fail = false;
  time.tick(60000);
  sweep();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(state.rows.length, 1);
  service.onModuleDestroy();
  assert.equal(clear.mock.calls[0].arguments[0], interval.mock.calls[0].result);
});

test('cleanup errors surface to readers, concurrent sweeps coalesce and missing configuration stays disabled', async (t) => {
  configure(t);
  clock(t);
  t.mock.method(console, 'error', () => {});
  const { service, state } = fixture();
  await Promise.all([service.cleanupResolvedTickets(), service.cleanupResolvedTickets()]);
  assert.equal(state.deletes, 1);
  state.fail = true;
  await assert.rejects(service.list(), ServiceUnavailableException);
  state.fail = false;
  await service.cleanupResolvedTickets();
  assert.equal(state.deletes, 2);
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  await service.onModuleInit();
  assert.equal(state.deletes, 2);
});
