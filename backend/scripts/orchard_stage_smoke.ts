// Isolated end-to-end stage regression; never reads production credentials.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SupabaseService } from '../src/supabase.service';
import { StudentAuthService } from '../src/auth/student-auth.service';
import { EmailService } from '../src/auth/email.service';
import { OrchardService } from '../src/orchard/orchard.service';
import { STAGES } from '../src/orchard/orchard.constants';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-stage-smoke-'));
process.once('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
process.chdir(tmp);

async function main() {
  const db = new SupabaseService();
  const service = new OrchardService(db, new StudentAuthService(db, new EmailService()));
  const student = 'stage-smoke-student';
  const school = 'stage-smoke-school';
  const className = 'Class 8';
  await db.client.from('students').insert([{ id: student, school_id: school, class_name: className, name: 'Stage test' }]);
  for (const subject of ['Mathematics', 'Science']) {
    await db.client.from('teachers').insert([{ subject, school_id: school, grades: [className] }]);
    const result = await db.client.from('lessons').insert([{ title: `${subject} stage test`, subject, school_id: school, class_name: className }]).select();
    await db.client.from('lesson_class_visibility').insert([{ lesson_id: result.data[0].id, class_name: className, is_visible: true }]);
  }
  const start = new Date(Date.now() - 40 * 86400000).toISOString();
  const groups = [
    ['lesson', 'question', 'story'],
    ['homework', 'quiz', 'flashcards'],
    ['active_recall', 'explain_back', 'memory_challenge'],
    ['word_problem', 'real_life', 'project'],
  ];
  for (const key of ['mathematics', 'science']) {
    const initial = await service.getTree(student, key);
    const chapterId = initial.chapters[0].chapterId;
    const visited: string[] = [];
    const verify = async (stage: string) => {
      const detail = await service.getTree(student, key);
      const overview = await service.getOrchard(student);
      const tree = overview.trees.find((row: { subjectKey: string }) => row.subjectKey === key);
      assert.equal(detail.chapters[0].stage, stage);
      assert.equal(detail.tree.stage, stage);
      assert.equal(tree.stage, stage);
      assert.equal(detail.tree.masteredChapters, stage === 'golden_fruit' ? 1 : 0);
      assert.equal(tree.masteredChapters, detail.tree.masteredChapters);
      assert.equal(tree.completedChapters, STAGES.indexOf(stage as typeof STAGES[number]) >= 6 ? 1 : 0);
      assert.equal(detail.tree.progressPct, tree.completedChapters * 100);
      visited.push(stage);
    };
    await verify('seed');
    for (let i = 0; i < groups.length; i++) {
      for (const activityType of groups[i]) {
        assert.equal((await service.recordActivity(student, { subjectKey: key, chapterId, activityType, occurredAt: start })).success, true);
      }
      await verify(STAGES[i + 1]);
    }
    const mature = await service.getTree(student, key);
    assert.equal(mature.chapters[0].dueReview, 'week');
    await service.completeReview(student, { chapterId, reviewType: 'week', passed: false });
    assert.equal((await service.getTree(student, key)).chapters[0].stage, 'mature_tree');
    await service.completeReview(student, { chapterId, reviewType: 'week', passed: true, occurredAt: new Date(Date.now() - 32 * 86400000).toISOString() });
    await verify('blossom');
    assert.equal((await service.getTree(student, key)).chapters[0].dueReview, 'month');
    await service.completeReview(student, { chapterId, reviewType: 'month', passed: true, occurredAt: new Date(Date.now() - 9 * 86400000).toISOString() });
    await verify('fruit');
    for (let i = 0; i < 10; i++) {
      const detail = await service.getTree(student, key);
      if (detail.chapters[0].rootsPct >= 90) break;
      await service.recordActivity(student, { subjectKey: key, chapterId, activityType: 'revision' });
    }
    await verify('golden_fruit');
    assert.deepEqual(visited, STAGES);
    await service.recordActivity(student, { subjectKey: key, chapterId, activityType: 'revision' });
    assert.equal((await service.getTree(student, key)).tree.masteredChapters, 1);
    console.log(`PASS ${key}: ${visited.join(' -> ')}; failed review stays open; repeat mastery earns no extra fruit`);
  }
  console.log('PASS: both subject trees independently reached every stage; overview/detail counts and percentages agree');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
