import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { ChatService } from './chat.service';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { OrchardService } from '../orchard/orchard.service';
import { LocalFeedService } from '../shared/local-feed.service';

type Row = Record<string, unknown>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(options: { holdEmbedding?: boolean; holdPersistence?: boolean; failHistory?: boolean; failChunks?: boolean; latencyMs?: number } = {}) {
  const studentId = randomUUID();
  const conversationId = `conv-${studentId}:subject-science:lesson-lesson`;
  const embedding = deferred();
  const persistence = deferred();
  const backgroundDone = deferred();
  if (!options.holdEmbedding) embedding.resolve();
  if (!options.holdPersistence) persistence.resolve();
  const reads: string[] = [];
  const filters: Array<{ table: string; key: string; value: unknown }> = [];
  const writes: Array<{ table: string; rows: Row[] }> = [];
  const prompts: Array<Array<{ role: string; content: string }>> = [];
  const tables: Record<string, Row[]> = {
    students: [{ id: studentId, name: 'Learner', class_name: 'Class 8' }],
    lessons: [{ id: 'lesson', title: 'Plants', subject: 'Science' }],
    lesson_chunks: [
      { id: 'c1', document_id: 'textbook', chunk_text: 'Leaves use sunlight to make food.', embedding: [1, 0] },
      { id: 'c2', document_id: 'revision', chunk_text: 'Important question: Why do plants need sunlight?', embedding: [1, 0] },
    ],
    lesson_documents: [
      { id: 'textbook', file_name: 'Lesson.pdf' },
      { id: 'revision', file_name: 'Important questions.pdf' },
    ],
    memories: [{ key: 'preference', value: 'Use garden examples', embedding: [1, 0] }],
    messages: [
      { role: 'ai', message: 'What do roots absorb?' },
      { role: 'user', message: 'Teach me about roots' },
    ],
    conversation_snapshots: [],
    homework: [{
      id: randomUUID(), subject: 'Science', title: 'Plant worksheet',
      note: 'Describe the function of a leaf',
    }],
    homework_attempts: [],
  };
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = {
    from(table: string) {
      let additions: Row[] | undefined;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push({ table, key, value }); return query; },
        in() { return query; },
        order() { return query; },
        limit() { return query; },
        insert(rows: Row[]) { additions = rows; return query; },
        then(resolve: (result: { data: Row[]; error: null }) => void, reject: (error: Error) => void) {
          reads.push(table);
          const finish = () => {
            if (options.failHistory && table === 'messages' && !additions) {
              reject(new Error('simulated history outage'));
            } else if (options.failChunks && table === 'lesson_chunks') {
              reject(new Error('simulated lesson chunks outage'));
            } else {
              if (additions) writes.push({ table, rows: additions });
              resolve({ data: additions || tables[table] || [], error: null });
            }
          };
          if (options.latencyMs) setTimeout(finish, options.latencyMs);
          else setImmediate(finish);
        },
      };
      return query;
    },
  };
  const llm: LlmService = Object.create(LlmService.prototype);
  llm.query = async (input) => {
    assert(Array.isArray(input));
    prompts.push(input);
    return 'Leaves use sunlight to make food. Why is sunlight important?';
  };
  const embeddings: EmbeddingsService = Object.create(EmbeddingsService.prototype);
  embeddings.embed = async () => {
    await embedding.promise;
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    return [1, 0];
  };
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  const orchard: OrchardService = Object.create(OrchardService.prototype);
  let growth = 0;
  orchard.recordActivity = async () => { growth++; return {}; };
  const feed: LocalFeedService = Object.create(LocalFeedService.prototype);
  feed.listHomeworkForStudent = () => [];
  const chat = new ChatService(llm, db, embeddings, auth, orchard, feed);
  const snapshots: unknown[][] = [];
  Object.defineProperties(chat, {
    loadLocalSnapshotHistory: { value: () => [] },
    persistSnapshotHistory: { value: async (_student: string, _conversation: string, turns: unknown[]) => {
      await persistence.promise;
      snapshots.push(turns);
    } },
    upsertLessonMasteryRecord: { value: async () => { backgroundDone.resolve(); } },
  });
  return {
    chat, studentId, conversationId, embedding, persistence, backgroundDone, reads, filters, writes,
    prompts, tables, snapshots, growth: () => growth,
  };
}

test('embedding, history, profile, lesson and homework reads start together without losing context', async () => {
  const f = fixture({ holdEmbedding: true });
  const response = f.chat.handleMessage(f.studentId, 'Why do plants need sunlight?', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const table of ['students', 'memories', 'messages', 'conversation_snapshots', 'lessons', 'lesson_chunks', 'homework']) {
    assert(f.reads.includes(table), `${table} should start before the embedding finishes`);
  }
  f.embedding.resolve();
  const result = await response;
  await f.backgroundDone.promise;
  assert.equal(result.conversationId, f.conversationId);
  assert(result.reply.includes('Leaves'));
  assert(result.followups.length > 0);
  const system = f.prompts[0][0].content;
  for (const text of ['Learner', 'Class 8', 'Use garden examples', 'Lesson.pdf', 'Important questions.pdf',
    'Leaves use sunlight', 'Why do plants need sunlight?', 'CRITICAL TOPIC BOUNDARY', 'LOCKED']) {
    assert(system.includes(text), `Prompt must retain ${text}`);
  }
  assert(f.prompts[0].some((turn) => turn.content === 'What do roots absorb?'));
  assert(f.filters.some((filter) => filter.table === 'messages' && filter.key === 'student_id' && filter.value === f.studentId));
  assert(f.filters.some((filter) => filter.table === 'messages' && filter.key === 'conversation_id' && filter.value === f.conversationId));
  assert.equal(f.writes.filter((write) => write.table === 'messages').length, 2);
  assert.equal(f.snapshots.length, 1);
  assert.equal(f.growth(), 1);
});

test('parallel retrieval still blocks direct answers to locked homework and drops prior answers', async () => {
  const f = fixture();
  await f.chat.handleMessage(f.studentId, 'Describe the function of a leaf', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
    recentMessages: [{ role: 'assistant', content: 'An old direct homework answer' }],
  });
  await f.backgroundDone.promise;
  assert.equal(f.prompts[0].length, 2);
  assert(f.prompts[0][0].content.includes('Do NOT solve this specific problem'));
  assert(!JSON.stringify(f.prompts[0]).includes('An old direct homework answer'));
});

test('subject resolved from lesson metadata still scopes homework checks', async () => {
  const f = fixture();
  f.tables.homework.push({ id: randomUUID(), subject: 'Math', title: 'Other subject secret', note: 'Solve 2 + 2' });
  await f.chat.handleMessage(f.studentId, 'Explain sunlight', {
    conversationId: f.conversationId, lessonId: 'lesson',
  });
  await f.backgroundDone.promise;
  assert(f.prompts[0][0].content.includes('Plant worksheet'));
  assert(!f.prompts[0][0].content.includes('Other subject secret'));
});

test('history outages retain client context and are explicitly logged', async () => {
  const f = fixture({ failHistory: true });
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await f.chat.handleMessage(f.studentId, 'Explain sunlight', {
      conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
      recentMessages: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier explanation' },
      ],
    });
    await f.backgroundDone.promise;
    assert(f.prompts[0].some((turn) => turn.content === 'Earlier explanation'));
    assert(warnings.some((args) => String(args[0]).includes('Tutor history lookup failed')));
  } finally {
    console.warn = warn;
  }
});

test('slow snapshot writes do not delay the reply or discard persistence', async () => {
  const f = fixture({ holdPersistence: true });
  const result = await f.chat.handleMessage(f.studentId, 'Explain sunlight', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
  });
  assert(result.reply);
  assert.equal(f.snapshots.length, 0);
  f.persistence.resolve();
  await f.backgroundDone.promise;
  assert.equal(f.snapshots.length, 1);
  assert.equal(f.writes.filter((write) => write.table === 'messages').length, 2);
});

test('a chunk lookup failure does not lose the resolved lesson boundary or homework scope', async () => {
  const f = fixture({ failChunks: true });
  f.tables.homework.push({ id: randomUUID(), subject: 'Math', title: 'Other subject secret' });
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await f.chat.handleMessage(f.studentId, 'Explain sunlight', {
      conversationId: f.conversationId, lessonId: 'lesson',
    });
    await f.backgroundDone.promise;
    const system = f.prompts[0][0].content;
    assert(system.includes('CRITICAL TOPIC BOUNDARY'));
    assert(system.includes('lesson "Plants"'));
    assert(system.includes('Plant worksheet'));
    assert(!system.includes('Other subject secret'));
    assert(warnings.some((args) => String(args[0]).includes('lesson context lookup failed')));
  } finally {
    console.warn = warn;
  }
});

test('lesson reply preparation takes fewer than seven simulated network round trips', async (t) => {
  const latencyMs = 40;
  const f = fixture({ latencyMs });
  const start = performance.now();
  await f.chat.handleMessage(f.studentId, 'Explain sunlight', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
  });
  const elapsed = performance.now() - start;
  await f.backgroundDone.promise;
  t.diagnostic(`Reply preparation: ${elapsed.toFixed(1)}ms with ${latencyMs}ms per embedding/database request; model is stubbed.`);
  assert(elapsed < latencyMs * 7, `Preparation took ${elapsed.toFixed(1)}ms; independent requests should overlap`);
});
