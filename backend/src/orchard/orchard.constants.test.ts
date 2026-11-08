import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assignSchoolTrees, computeStage, countMasteredChapters, schoolTreeEntry, subjectEntryFor, treeStageFromGrowth, STAGE_REQUIREMENTS, SUBJECT_CATALOG } from './orchard.constants';

test('acorns count unique Golden Fruit chapters in the current curriculum only', () => {
  assert.equal(countMasteredChapters(['a', 'b', 'c'], [
    { chapter_id: 'a', stage_index: 7 },
    { chapter_id: 'a', stage_index: 7 },
    { chapter_id: 'b', stage_index: 6 },
    { chapter_id: 'c', stage_index: 4 },
    { chapter_id: 'other-class', stage_index: 7 },
    { chapter_id: 'withdrawn', stage_index: 7 },
  ]), 1);
  assert.equal(countMasteredChapters([], [{ chapter_id: 'a', stage_index: 7 }]), 0);
  const ids = Array.from({ length: 1200 }, (_, index) => `chapter-${index}`);
  assert.equal(countMasteredChapters(ids, ids.map((chapter_id) => ({ chapter_id, stage_index: 7 }))), 1200);
});

test('chapter mastery still requires all milestones and 90 percent roots', () => {
  const milestones = Object.fromEntries(Object.values(STAGE_REQUIREMENTS).flat().map((key) => [key, true]));
  assert.equal(computeStage(milestones, 89).stage, 'fruit');
  assert.equal(computeStage(milestones, 90).stage, 'golden_fruit');
  assert.equal(computeStage({ ...milestones, month_retention: false }, 100).stage, 'blossom');
  assert.notEqual(treeStageFromGrowth([7, 6], 2).stage, 'golden_fruit');
  assert.equal(treeStageFromGrowth([7, 7], 2).stage, 'golden_fruit');
});

test('six established subjects and four additions use ten distinct designs', () => {
  const keys = [...SUBJECT_CATALOG.map((s) => s.subject_key), 'biology', 'geography', 'music', 'art'];
  const assigned = assignSchoolTrees(keys, []);
  assert.equal(new Set(assigned.map((row) => row.tree_type)).size, 10);
  for (const subject of SUBJECT_CATALOG) {
    assert.equal(assigned.find((row) => row.subject_key === subject.subject_key)?.tree_type, subject.tree_type);
  }
  assert.deepEqual(new Set(assigned.filter((row) => !SUBJECT_CATALOG.some((s) => s.subject_key === row.subject_key))
    .map((row) => row.tree_type)), new Set(['lemon', 'peach', 'plum', 'coconut']));
});

test('any ten custom subjects use unused designs before reusing the balanced pool', () => {
  const keys = Array.from({ length: 35 }, (_, i) => `custom_${String(i).padStart(2, '0')}`);
  const first = assignSchoolTrees(keys.slice(0, 10), []);
  assert.equal(new Set(first.map((row) => row.tree_type)).size, 10);
  const all = assignSchoolTrees(keys, first);
  assert.deepEqual(all.slice(0, 10), first);
  assert.equal(all.length, 35);
  const usage = [...new Set(all.map((row) => row.tree_type))]
    .map((type) => all.filter((row) => row.tree_type === type).length);
  assert.ok(Math.max(...usage) - Math.min(...usage) <= 1);
  assert.deepEqual(assignSchoolTrees([...keys].reverse(), all), [...all].reverse());
  assert.deepEqual(assignSchoolTrees(['custom_00'], all), [first[0]]);
});

test('school-specific presentation does not change a subject key or growth rules', () => {
  const original = subjectEntryFor('biology');
  const themed = schoolTreeEntry(original, 'lemon');
  assert.equal(themed.subject_key, original.subject_key);
  assert.equal(themed.display_name, original.display_name);
  assert.equal(themed.tree_type, 'lemon');
  assert.equal(themed.fruit_type, 'lemon');
  assert.equal(themed.fruit_emoji, '🍋');
  assert.notEqual(original.tree_type, 'lemon');
  assert.throws(() => schoolTreeEntry(original, 'missing'), /Unknown Orchard/);
});
