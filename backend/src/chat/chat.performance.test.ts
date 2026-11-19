import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { OrchardService } from '../orchard/orchard.service';
import { LocalFeedService } from '../shared/local-feed.service';
import { SchoolworkStatusService } from './schoolwork-status.service';
import { LearningScoreService } from '../progress/learning-score.service';

type Row = Record<string, unknown>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(options: { holdEmbedding?: boolean; holdPersistence?: boolean; failHistory?: boolean; failChunks?: boolean; latencyMs?: number; unsafeReply?: boolean; invalidReview?: boolean; reviewOnceInvalid?: boolean } = {}) {
  const studentId = randomUUID();
  const conversationId = `conv-${studentId}:subject-science:lesson-lesson`;
  const embedding = deferred();
  const embeddingStarted = deferred();
  const persistence = deferred();
  const backgroundDone = deferred();
  if (!options.holdEmbedding) embedding.resolve();
  if (!options.holdPersistence) persistence.resolve();
  const reads: string[] = [];
  const filters: Array<{ table: string; key: string; value: unknown }> = [];
  const writes: Array<{ table: string; rows: Row[] }> = [];
  const prompts: Array<Array<{ role: string; content: string }>> = [];
  const requestOptions: Array<Parameters<LlmService['query']>[1]> = [];
  const tables: Record<string, Row[]> = {
    students: [{ id: studentId, name: 'Learner', class_name: 'Class 8' }],
    lessons: [{ id: 'lesson', title: 'Plants', subject: 'Science' }],
    lesson_class_visibility: [{ lesson_id: 'lesson' }],
    lesson_chunks: [
      { id: 'c1', lesson_id: 'lesson', document_id: 'textbook', chunk_text: 'Leaves use sunlight to make food.', embedding: [1, 0] },
      { id: 'c2', lesson_id: 'lesson', document_id: 'revision', chunk_text: 'Important question: Why do plants need sunlight?', embedding: [1, 0] },
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
        range() { return query; },
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
  let reviewCount = 0;
  llm.query = async (input, opts) => {
    assert(Array.isArray(input));
    prompts.push(input);
    requestOptions.push(opts);
    if (input[0].content.includes('HOMEWORK ANSWER-LEAK REVIEW')) {
      reviewCount++;
      if (options.invalidReview || (options.reviewOnceInvalid &&
          (reviewCount === 1 || !input[0].content.includes('FORMAT CORRECTION')))) return 'invalid review';
      const payload = JSON.parse(input[1].content);
      return JSON.stringify({ homeworkIndex: options.unsafeReply || payload.knownAssignedHomework ? 0 : null, safe: !options.unsafeReply });
    }
    if (options.unsafeReply) return 'The angles always add to 180 degrees, or half a turn.';
    if (options.reviewOnceInvalid) return 'Think about what the leaf uses to get started. What could you look for in your lesson?';
    return 'Leaves use sunlight to make food. Why is sunlight important?';
  };
  const embeddings: EmbeddingsService = Object.create(EmbeddingsService.prototype);
  embeddings.embed = async () => {
    embeddingStarted.resolve();
    await embedding.promise;
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    return [1, 0];
  };
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  auth.resolveStudentProfile = async (id) => ({ id, name: 'Learner', className: 'Class 8', schoolId: studentId, teacherId: '' });
  auth.listClassTeachers = async () => [{ id: 'science-teacher', name: 'Science teacher', subject: 'Science' }];
  const orchard: OrchardService = Object.create(OrchardService.prototype);
  let growth = 0;
  orchard.recordActivity = async () => { growth++; return {}; };
  const feed: LocalFeedService = Object.create(LocalFeedService.prototype);
  feed.listHomeworkForStudent = () => [];
  feed.listAttemptsForStudent = () => [];
  const learning: LearningScoreService = Object.create(LearningScoreService.prototype);
  learning.listAssignedTests = async () => tables.tests || [];
  learning.getLearningScore = async () => ({
    hasData: true, score: 612, maxScore: 1000,
    trend: [{ score: 580 }, { score: 612 }, { score: null, future: true }],
    subjects: [{ name: 'Science', score: 55, status: 'needs-focus' }],
  });
  const chat = new ChatService(llm, db, embeddings, auth, orchard, feed, new SchoolworkStatusService(db, feed, auth, learning));
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
    chat, studentId, conversationId, embedding, embeddingStarted, persistence, backgroundDone, reads, filters, writes,
    prompts, requestOptions, tables, snapshots, growth: () => growth,
  };
}

test('Home Sam reports today’s assigned homework and submissions without curriculum or a model call', async () => {
  const f = fixture({ holdEmbedding: true });
  const now = new Date().toISOString();
  f.tables.homework = [
    { id: 'todo', subject: 'Science', title: 'Leaves worksheet', note: 'Private question text', due_at: now },
    { id: 'done', subject: 'Science', title: 'Roots worksheet', created_at: now },
    { id: 'other-class', subject: 'Science', title: 'Other class assignment', class_name: 'Class 9', due_at: now },
    { id: 'future', subject: 'Science', title: 'Invisible assignment', start_at: '2099-12-01T10:00:00Z', created_at: now },
  ];
  f.tables.homework_attempts = [{ id: 'attempt', homework_id: 'done' }];
  const result = await f.chat.handleQuickMessage(f.studentId, 'What is the homeworks today?');
  assert.match(result.reply, /1 pending, 1 submitted/);
  assert.match(result.reply, /Leaves worksheet — not submitted/);
  assert.match(result.reply, /Roots worksheet — submitted/);
  assert.doesNotMatch(result.reply, /Other class assignment|Invisible assignment|Private question text/);
  assert.deepEqual(f.prompts, []);
  assert(!f.reads.includes('lesson_chunks'));
  assert(!f.reads.includes('test_attempts'));
  assert(f.filters.filter((filter) => /homework/.test(filter.table)).every((filter) => filter.value === f.studentId));
});

test('Unit Sam only lists linked homework and redirects the rest to the right Unit or Home', async () => {
  const f = fixture({ holdEmbedding: true });
  f.tables.homework = [
    { id: 'mine', subject: 'Science', title: 'Leaf activity', tasks: { meta: { lessonIds: ['lesson'] } } },
    { id: 'other', subject: 'Science', title: 'Unshown worksheet', tasks: { meta: { lessonIds: ['energy'], lessonTitles: ['Energy'] } } },
  ];
  const result = await f.chat.handleMessage(f.studentId, 'What is my homework?', {
    lessonId: 'lesson', lessonSubject: 'Science', conversationId: f.conversationId,
  });
  assert.equal(result.conversationId, f.conversationId);
  assert.match(result.reply, /Leaf activity/);
  assert.match(result.reply, /Science → Energy.*ask Sam on Home/);
  assert.doesNotMatch(result.reply, /Unshown worksheet/);
  assert.deepEqual(f.prompts, []);
  assert.equal(f.growth(), 0, 'a status lookup is not Unit mastery activity');
});

test('Unit Sam redirects an identified worksheet from another Unit without teaching it', async () => {
  const f = fixture();
  f.tables.homework = [{
    id: 'outside', subject: 'Science', title: 'Electric circuits worksheet',
    tasks: { meta: { lessonIds: ['energy'], lessonTitles: ['Energy'] } },
  }];
  const result = await f.chat.handleMessage(f.studentId, 'Give me a hint for the Electric circuits worksheet.', {
    lessonId: 'lesson', lessonSubject: 'Science', conversationId: f.conversationId,
  });
  assert.match(result.reply, /Science → Energy.*ask Sam on Home/);
  assert.deepEqual(f.prompts, []);
});

test('Home Sam reports scheduled tests, recorded zero scores and the real monthly graph trend', async () => {
  const f = fixture({ holdEmbedding: true });
  f.tables.tests = [
    { id: 'next', subject: 'Science', title: 'Upcoming quiz', start_at: '2099-01-19T04:30:00Z' },
    { id: 'done', subject: 'Science', title: 'Plants quiz' },
  ];
  f.tables.test_attempts = [{ id: 'a', test_id: 'done', score: 0, created_at: '2020-01-01T00:00:00Z' }];
  const result = await f.chat.handleQuickMessage(f.studentId, 'Show me my mock test results and my progress graph');
  assert.match(result.reply, /Upcoming quiz — scheduled/);
  assert.match(result.reply, /Plants quiz — completed, 0%/);
  assert.match(result.reply, /580 to 612 \(up\)/);
  assert.match(result.reply, /Start with Science \(55%\)/);
  assert.deepEqual(f.prompts, []);
});

test('Home Sam reads homework during embedding and still reviews the class-grounded reply', async () => {
  const f = fixture({ holdEmbedding: true });
  const response = f.chat.handleQuickMessage(f.studentId, 'Why do plants use sunlight?');
  await Promise.race([f.embeddingStarted.promise, response]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const startedDuringEmbedding = f.reads.includes('homework');
  f.embedding.resolve();
  const result = await response;
  assert(startedDuringEmbedding);
  assert.match(f.prompts[0][0].content, /Leaves use sunlight to make food/);
  assert.match(f.prompts[1][0].content, /HOMEWORK ANSWER-LEAK REVIEW/);
  assert.deepEqual(result.subjects, ['Science']);
  assert.match(result.reply, /Leaves use sunlight to make food/);
});

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

test('image questions and short follow-ups cannot leak a homework constant or repeat old answers', async () => {
  const f = fixture({ unsafeReply: true });
  f.tables.homework[0].note = 'Using the Polygon tool, draw a triangle and mark its angles. What is the sum of all angles?';
  const sharedHeader = 'fixture-worksheet-image-header'.repeat(4);
  const imageBase64 = Buffer.from(sharedHeader + '-first').toString('base64');
  const secondImageBase64 = Buffer.from(sharedHeader + '-second').toString('base64');
  const image = 'data:image/png;base64,' + imageBase64;
  const first = await f.chat.handleMessage(f.studentId, 'Please explain these images.', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science', imageDataUrls: [image, 'data:image/png;base64,' + secondImageBase64],
  });
  await f.backgroundDone.promise;
  assert(!/180|half a turn/.test(first.reply));
  assert.deepEqual(f.requestOptions[0].imageBase64List, [imageBase64, secondImageBase64], 'Different worksheets with matching image headers must not be collapsed');
  const priorCallCount = f.prompts.length;
  assert.deepEqual(first.followups, ['Give me one more small hint', 'Explain the concept as a story', 'Ask me a check question']);
  const second = await f.chat.handleMessage(f.studentId, 'What is the sum?', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
    recentMessages: [{ role: 'assistant', content: 'The answer is 180 degrees.' }],
  });
  assert(!/180|half a turn/.test(second.reply));
  const followupReviewIndex = f.prompts.findIndex((prompt, index) => index >= priorCallCount && prompt[0].content.includes('HOMEWORK ANSWER-LEAK REVIEW'));
  assert.deepEqual(f.requestOptions[followupReviewIndex].imageBase64List, [imageBase64, secondImageBase64], 'Image context must remain available for short text follow-ups');
  assert(f.prompts.filter((prompt) => prompt[0].content.includes('HOMEWORK ANSWER-LEAK REVIEW')).length >= 4);
  assert(f.writes.filter((write) => write.table === 'messages').flatMap((write) => write.rows)
    .filter((row) => row.role === 'ai').every((row) => !String(row.message).includes('180')));
});

test('an invalid homework reply review fails explicitly instead of returning the unchecked answer', async () => {
  const f = fixture({ invalidReview: true });
  await assert.rejects(f.chat.handleMessage(f.studentId, 'Describe the function of a leaf', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
  }), /could not verify a safe homework hint/);
  assert.equal(f.writes.filter((write) => write.table === 'messages').flatMap((write) => write.rows)
    .filter((row) => row.role === 'ai').length, 0);
});

test('a transient malformed safety review retries in JSON mode and returns only the approved hint', async () => {
  const f = fixture({ reviewOnceInvalid: true });
  const result = await f.chat.handleMessage(f.studentId, 'Describe the function of a leaf', {
    conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
  });
  await f.backgroundDone.promise;
  assert(result.reply.includes('get started'));
  const reviews = f.prompts.map((prompt, index) => ({ prompt, opts: f.requestOptions[index] }))
    .filter(({ prompt }) => prompt[0].content.includes('HOMEWORK ANSWER-LEAK REVIEW'));
  assert.equal(reviews.length, 2);
  assert(reviews.every(({ opts }) => opts.responseFormat === 'json' && opts.requireModelResponse));
});

test('the tutor controller surfaces safety-check failures without a generic 500 or an AI reply', async () => {
  const f = fixture({ invalidReview: true });
  const feed: LocalFeedService = Object.create(LocalFeedService.prototype);
  feed.logStudentActivity = () => { throw new Error('A failed chat must not log a successful send'); };
  const controller = new ChatController(f.chat, feed);
  const response = await controller.chat({ user: { sub: f.studentId, role: 'student' } }, {
    message: 'Describe the function of a leaf', conversationId: f.conversationId, lessonId: 'lesson', lessonSubject: 'Science',
  });
  assert.equal(response.success, false);
  assert('error' in response);
  assert.match(response.error, /could not verify a safe homework hint/);
  assert(!('reply' in response));
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
