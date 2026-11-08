import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { OrchardService } from './orchard.service';
import { SUBJECT_CATALOG } from './orchard.constants';

function fixture(failPage = false) {
  const ids = Array.from({ length: 1200 }, (_, index) => `chapter-${index}`);
  const pages: Array<{ from: number; to: number; filters: Record<string, string> }> = [];
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  Object.defineProperty(db, 'client', { value: {
    from(table: string) {
      const filters: Record<string, string> = {};
      let offset = 0;
      let end = 499;
      const query = {
        select() { return query; },
        eq(key: string, value: string) { filters[key] = value; return query; },
        order() { return query; },
        range(from: number, to: number) { offset = from; end = to; return query; },
        then(resolve: (result: { data: unknown[]; error: { message: string } | null }) => void) {
          if (table !== 'chapter_growth') return resolve({ data: [], error: null });
          pages.push({ from: offset, to: end, filters });
          resolve({
            data: ids.slice(offset, end + 1).map((chapter_id) => ({ chapter_id, stage_index: 7 })),
            error: failPage && offset === 500 ? { message: 'simulated mastery page failure' } : null,
          });
        },
      };
      return query;
    },
  } });
  const studentAuth: StudentAuthService = Object.create(StudentAuthService.prototype);
  const service = new OrchardService(db, studentAuth);
  Object.defineProperty(service, 'ensureOrchard', {
    value: async () => ({ className: 'Class 8', catalog: [SUBJECT_CATALOG[0]] }),
  });
  Object.defineProperty(service, 'ensureChapters', {
    value: async (_subject: string, className: string) => {
      assert.equal(className, 'Class 8');
      return ids.map((id) => ({ id }));
    },
  });
  return { service, pages };
}

test('overview counts all mastery pages with student and subject filters', async () => {
  const { service, pages } = fixture();
  const result = await service.getOrchard('student-1');
  assert.equal(result.trees[0].masteredChapters, 1200);
  assert.deepEqual(pages.map(({ from, to }) => [from, to]), [[0, 499], [500, 999], [1000, 1499]]);
  assert.ok(pages.every(({ filters }) =>
    filters.student_id === 'student-1' && filters.subject_key === SUBJECT_CATALOG[0].subject_key));
});

test('a failed mastery page reports an error rather than a partial acorn count', async () => {
  const { service } = fixture(true);
  await assert.rejects(service.getOrchard('student-1'), ServiceUnavailableException);
});
