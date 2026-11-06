import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

async function main() {
  const url = process.env.SUPPORT_TEST_DATABASE_URL;
  if (!url || !/^postgres(?:ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)(:|\/)/.test(url)) {
    throw new Error('Set SUPPORT_TEST_DATABASE_URL to a disposable LOCAL PostgreSQL cluster. Never use a production database for this test.');
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end $$;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        'select coalesce(nullif(current_setting(''request.jwt.claims'', true), ''''), ''{}'')::jsonb';
      grant usage on schema auth to authenticated;
      grant execute on function auth.jwt() to authenticated;
    `);
    await db.query(readFileSync(resolve('db/migrations/20261106_student_support.sql'), 'utf8'));
    const student = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const school = '33333333-3333-4333-8333-333333333333';
    const id = '44444444-4444-4444-8444-444444444444';
    const messageId = '55555555-5555-4555-8555-555555555555';
    const replyId = '66666666-6666-4666-8666-666666666666';
    const payload = { id, requester_id: student, requester_role: 'student', school_id: school,
      requester_name: 'Test Student', class_name: 'Class 6', category: 'glitch', subject: 'Test glitch' };
    await db.query('set role service_role');
    await db.query('select support_create_ticket($1::jsonb,$2::jsonb)', [payload, JSON.stringify([{ id: messageId, author_role: 'student', content: 'Upload failed' }])]);
    await db.query('select support_create_ticket($1::jsonb,$2::jsonb)', [payload, JSON.stringify([{ id: messageId, author_role: 'student', content: 'Upload failed' }])]);
    assert.equal((await db.query('select * from support_messages')).rows.length, 1, 'ticket creation must be idempotent');
    await assert.rejects(db.query('select support_append_message($1,$2,$3,$4,$5,$6)', [id, other, school, replyId, 'student', 'Intruder']), /ownership mismatch/);
    await db.query('select support_append_message($1,$2,$3,$4,$5,$6)', [id, null, null, replyId, 'owner', 'Try again']);
    await db.query('select support_append_message($1,$2,$3,$4,$5,$6)', [id, null, null, replyId, 'owner', 'Try again']);
    assert.equal((await db.query('select * from support_messages')).rows.length, 2, 'replies must be idempotent');
    await db.query("update support_tickets set status='resolved' where id=$1", [id]);
    await db.query('select support_append_message($1,$2,$3,$4,$5,$6)', [id, student, school, '77777777-7777-4777-8777-777777777777', 'student', 'Still broken']);
    assert.equal((await db.query('select status from support_tickets where id=$1', [id])).rows[0].status, 'open');
    await assert.rejects(db.query('select support_create_ticket($1::jsonb,$2::jsonb)', [
      { ...payload, id: '88888888-8888-4888-8888-888888888888' },
      JSON.stringify([{ id: '99999999-9999-4999-8999-999999999999', author_role: 'invalid', content: 'Broken insert' }]),
    ]));
    assert.equal((await db.query("select * from support_tickets where id='88888888-8888-4888-8888-888888888888'")).rows.length, 0, 'ticket and message creation must be atomic');
    await db.query('reset role');
    await db.query('set role authenticated');
    async function claims(sub: string, role = 'student', schoolId = school) {
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub, role, schoolId })]);
    }
    await claims(student);
    assert.equal((await db.query('select * from support_tickets')).rows.length, 1);
    assert.equal((await db.query('select * from support_messages')).rows.length, 3);
    await assert.rejects(db.query('select support_append_message($1,$2,$3,$4,$5,$6)', [id, student, school, replyId, 'owner', 'Forged owner']));
    await assert.rejects(db.query("update support_tickets set status='resolved'"));
    await claims(other);
    assert.equal((await db.query('select * from support_tickets')).rows.length, 0);
    assert.equal((await db.query('select * from support_messages')).rows.length, 0);
    await claims(student, 'teacher');
    assert.equal((await db.query('select * from support_tickets')).rows.length, 0);
    await claims(student, 'student', other);
    assert.equal((await db.query('select * from support_tickets')).rows.length, 0);
    await db.query('reset role');
    await db.query('set role anon');
    await assert.rejects(db.query('select * from support_tickets'));
    console.log('Support SQL: atomic creation/replies, idempotency, reopen, student and school RLS isolation, and service-only writes PASS.');
  } finally { await db.end(); }
}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
