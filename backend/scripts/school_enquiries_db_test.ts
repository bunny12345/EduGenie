import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

async function main() {
  const url = process.env.ENQUIRY_TEST_DATABASE_URL;
  if (!url || !/^postgres(?:ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)(:|\/)/.test(url)) {
    throw new Error('ENQUIRY_TEST_DATABASE_URL must point to a disposable LOCAL database, never production.');
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
    await db.query(readFileSync(resolve('db/migrations/20261110_school_enquiries.sql'), 'utf8'));
    const codeHash = 'a'.repeat(64);
    const sessionHash = 'b'.repeat(64);
    async function challenge(expired = false) {
      const id = randomUUID();
      await db.query(`insert into school_enquiry_challenges(id,email,name,school_name,message,code_hash,expires_at)
        values($1,'school@example.test','School Visitor','Example School','Please show a demo',$2,now() + $3::interval)`,
      [id, codeHash, expired ? '-1 minute' : '10 minutes']);
      return id;
    }
    const locked = await challenge();
    for (let i = 0; i < 5; i++) {
      const result = await db.query('select school_enquiry_verify($1,$2,$3) as result', [locked, 'c'.repeat(64), sessionHash]);
      assert.equal(result.rows[0].result.verified, false);
    }
    assert.equal((await db.query('select school_enquiry_verify($1,$2,$3) as result', [locked, codeHash, sessionHash])).rows[0].result.verified, false);
    assert.equal((await db.query('select attempts from school_enquiry_challenges where id=$1', [locked])).rows[0].attempts, 5);
    const expired = await challenge(true);
    assert.equal((await db.query('select school_enquiry_verify($1,$2,$3) as result', [expired, codeHash, sessionHash])).rows[0].result.verified, false);
    const nullCode = await challenge();
    assert.equal((await db.query('select school_enquiry_verify($1,null,$2) as result', [nullCode, sessionHash])).rows[0].result.verified, false);

    const id = await challenge();
    await db.query('set role service_role');
    const result = (await db.query('select school_enquiry_verify($1,$2,$3) as result', [id, codeHash, sessionHash])).rows[0].result;
    assert.equal(result.verified, true);
    const enquiryId = result.id;
    assert.equal((await db.query('select * from school_enquiry_messages where enquiry_id=$1', [enquiryId])).rows.length, 1);
    assert.equal((await db.query('select school_enquiry_verify($1,$2,$3) as result', [id, codeHash, sessionHash])).rows[0].result.verified, false);
    const append = (messageId: string, role: string | null, hash: string | null, content = 'Follow up') =>
      db.query('select school_enquiry_append($1,$2,$3,$4,$5)', [enquiryId, hash, messageId, role, content]);
    await assert.rejects(append(randomUUID(), 'visitor', null), /access denied/);
    await assert.rejects(append(randomUUID(), 'visitor', 'd'.repeat(64)), /access denied/);
    await assert.rejects(append(randomUUID(), null, null), /Invalid author/);
    const messageId = randomUUID();
    await append(messageId, 'visitor', sessionHash);
    await append(messageId, 'visitor', sessionHash);
    assert.equal((await db.query('select * from school_enquiry_messages where enquiry_id=$1', [enquiryId])).rows.length, 2);
    await assert.rejects(append(messageId, 'owner', null), /identity mismatch/);
    await assert.rejects(append(messageId, 'visitor', sessionHash, 'Changed retry'), /identity mismatch/);
    await db.query("update school_enquiries set status='resolved' where id=$1", [enquiryId]);
    await append(randomUUID(), 'owner', null, 'Admin reply');
    assert.equal((await db.query('select status from school_enquiries where id=$1', [enquiryId])).rows[0].status, 'open');
    await db.query("update school_enquiries set session_expires_at=now() - interval '1 minute' where id=$1", [enquiryId]);
    await assert.rejects(append(randomUUID(), 'visitor', sessionHash), /access denied/);
    await append(randomUUID(), 'owner', null, 'Admin can still follow up');
    await db.query('reset role');

    const atomicId = await challenge();
    await assert.rejects(db.query('select school_enquiry_verify($1,$2,null)', [atomicId, codeHash]));
    assert.equal((await db.query('select consumed,attempts from school_enquiry_challenges where id=$1', [atomicId])).rows[0].attempts, 0);
    assert.equal((await db.query('select consumed from school_enquiry_challenges where id=$1', [atomicId])).rows[0].consumed, false);

    for (const role of ['anon', 'authenticated']) {
      await db.query(`set role ${role}`);
      for (const table of ['school_enquiries', 'school_enquiry_messages', 'school_enquiry_challenges']) {
        await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
      }
      await assert.rejects(db.query('select school_enquiry_verify($1,$2,$3)', [atomicId, codeHash, sessionHash]), /permission denied/);
      await assert.rejects(append(randomUUID(), 'owner', null), /permission denied/);
      await db.query('reset role');
    }
    const rows = (await db.query("select relrowsecurity from pg_class where relname in ('school_enquiries','school_enquiry_messages','school_enquiry_challenges')")).rows;
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r: { relrowsecurity: boolean }) => r.relrowsecurity));

    const concurrentId = await challenge();
    const second = new Client({ connectionString: url });
    await second.connect();
    try {
      const results = await Promise.all([
        db.query('select school_enquiry_verify($1,$2,$3) as result', [concurrentId, codeHash, 'e'.repeat(64)]),
        second.query('select school_enquiry_verify($1,$2,$3) as result', [concurrentId, codeHash, 'f'.repeat(64)])
      ]);
      assert.equal(results.filter((r) => r.rows[0].result.verified).length, 1, 'a code must only create one enquiry under concurrent verification');
    } finally { await second.end(); }
      const beforeCount = (await db.query('select count(*) from school_enquiries')).rows[0].count;
      await db.query(readFileSync(resolve('db/migrations/20261111_school_enquiry_whatsapp.sql'), 'utf8'));
      assert.equal((await db.query('select count(*) from school_enquiries')).rows[0].count, beforeCount);
      assert.equal((await db.query('select whatsapp_number from school_enquiries where id=$1', [enquiryId])).rows[0].whatsapp_number, null);
      const phoneChallenge = await challenge();
      await db.query('update school_enquiry_challenges set whatsapp_number=$2 where id=$1', [phoneChallenge, '+919876543210']);
      await assert.rejects(db.query('update school_enquiry_challenges set whatsapp_number=$2 where id=$1', [phoneChallenge, '9876543210']), /check constraint/);
      await db.query('set role service_role');
      const phoneEnquiry = (await db.query('select school_enquiry_verify($1,$2,$3) as result', [phoneChallenge, codeHash, '1'.repeat(64)])).rows[0].result;
      assert.equal((await db.query('select whatsapp_number from school_enquiries where id=$1', [phoneEnquiry.id])).rows[0].whatsapp_number, '+919876543210');
      await db.query('reset role');
      for (const role of ['anon', 'authenticated']) {
        await db.query(`set role ${role}`);
        await assert.rejects(db.query('select whatsapp_number from school_enquiries'), /permission denied/);
        await assert.rejects(db.query('select school_enquiry_verify($1,$2,$3)', [phoneChallenge, codeHash, sessionHash]), /permission denied/);
        await db.query('reset role');
      }
      console.log('School enquiry SQL checks passed: verification limits, expiry, atomic writes, concurrent consumption, retry identity, RLS and service-only access.');
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
