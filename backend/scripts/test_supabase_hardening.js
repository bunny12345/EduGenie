// Runs against a disposable local PostgreSQL cluster, never DATABASE_URL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const tables = [
  'rewards', 'registration_invites', 'conversation_snapshots', 'tests', 'test_questions',
  'flashcard_decks', 'flashcards', 'flashcard_progress', 'game_sessions',
  'flashcard_chapter_completions', 'class_members', 'quiz_decks', 'quiz_questions',
  'lesson_stories', 'lesson_story_progress',
];
const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20261110_supabase_advisor_hardening.sql'), 'utf8');
const verification = fs.readFileSync(path.join(__dirname, '../db/verify_supabase_advisor.sql'), 'utf8');

test('Advisor hardening on isolated PostgreSQL', async (t) => {
  const directory = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'ax-rls-'));
  const data = path.join(directory, 'data');
  const command = (name, args) => {
    const result = spawnSync(name, args, {
      encoding: 'utf8', timeout: 60000, env: { ...process.env, LC_ALL: 'C' },
    });
    if (result.error) throw result.error;
    const log = path.join(directory, 'postgres.log');
    assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}${result.status && fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''}`);
  };
  let started = false;
  let client;
  t.after(async () => {
    try {
      if (client) await client.end();
    } finally {
      if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
      fs.rmSync(directory, { recursive: true });
    }
  });
  command('initdb', ['-D', data, '-U', 'security_test', '-A', 'trust', '--no-locale']);
  command('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start',
    '-o', `-F -k '${directory}' -h '' -p 5432`]);
  started = true;
  client = new Client({ host: directory, port: 5432, database: 'postgres', user: 'security_test' });
  await client.connect();
  await client.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS');
  for (const table of tables) {
    await client.query(`CREATE TABLE public.${table} (id int, token text);
      INSERT INTO public.${table} VALUES (1, 'fixture-only');
      GRANT ALL ON public.${table} TO PUBLIC, anon, authenticated, service_role;
      GRANT SELECT (token), UPDATE (token) ON public.${table} TO anon, authenticated;
      CREATE POLICY existing_policy ON public.${table} USING (true) WITH CHECK (true)`);
  }
  const policies = () => client.query(`SELECT polrelid, polname, polcmd, polroles, polqual::text, polwithcheck::text
    FROM pg_policy ORDER BY polrelid, polname`);
  const before = (await policies()).rows;
  const apply = async () => {
    try {
      await client.query(migration);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };

  await t.test('all tables protected; existing policies, data and backend access preserved', async () => {
    await apply();
    const rows = (await client.query(verification)).rows;
    assert.equal(rows.length, 15);
    for (const row of rows) {
      assert.equal(row.table_exists, true, row.table_name);
      assert.equal(row.rls_enabled, true, row.table_name);
      assert.equal(row.anon_access, false, row.table_name);
      assert.equal(row.authenticated_access, false, row.table_name);
      assert.equal(row.backend_access, true, row.table_name);
    }
    assert.deepEqual((await policies()).rows, before);
    await client.query('SET ROLE service_role');
    try {
      for (const table of tables) {
        assert.equal((await client.query(`SELECT * FROM public.${table}`)).rows.length, 1);
        await client.query(`INSERT INTO public.${table} VALUES (2, 'backend-only')`);
        await client.query(`UPDATE public.${table} SET token = 'updated' WHERE id = 2`);
        assert.equal((await client.query(`DELETE FROM public.${table} WHERE id = 2`)).rowCount, 1);
      }
    } finally {
      await client.query('RESET ROLE');
    }
    for (const role of ['anon', 'authenticated']) {
      await client.query(`SET ROLE ${role}`);
      try {
        for (const table of tables) {
          for (const sql of [
            `SELECT token FROM public.${table}`,
            `INSERT INTO public.${table} VALUES (3, 'blocked')`,
            `UPDATE public.${table} SET token = 'blocked'`,
            `DELETE FROM public.${table}`,
          ]) await assert.rejects(client.query(sql), { code: '42501' });
        }
      } finally {
        await client.query('RESET ROLE');
      }
    }
  });
  await t.test('safe to reapply', async () => {
    await apply();
    assert.deepEqual((await policies()).rows, before);
  });
  await t.test('inherited exposure aborts and rolls back every table change', async () => {
    await client.query(`CREATE ROLE legacy_reader;
      GRANT SELECT ON public.registration_invites TO legacy_reader;
      GRANT legacy_reader TO anon;
      ALTER TABLE public.rewards DISABLE ROW LEVEL SECURITY`);
    await assert.rejects(apply(), /Inherited privileges/);
    assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rewards'::regclass")).rows[0].relrowsecurity, false);
    await client.query('REVOKE legacy_reader FROM anon');
    await apply();
  });
  await t.test('missing expected table aborts without partial application', async () => {
    await client.query(`ALTER TABLE public.lesson_story_progress RENAME TO saved_story_progress;
      ALTER TABLE public.rewards DISABLE ROW LEVEL SECURITY`);
    await assert.rejects(apply(), /Expected flagged table/);
    assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rewards'::regclass")).rows[0].relrowsecurity, false);
    await client.query('ALTER TABLE public.saved_story_progress RENAME TO lesson_story_progress');
    await apply();
  });
  await t.test('missing backend privileges aborts rather than breaking server access', async () => {
    await client.query('REVOKE DELETE ON public.tests FROM service_role');
    await assert.rejects(apply(), /service_role lacks backend privileges/);
    await client.query('GRANT DELETE ON public.tests TO service_role');
    await apply();
  });
});
