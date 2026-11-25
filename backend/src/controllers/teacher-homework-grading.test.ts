import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TeacherController } from './teacher.controller';

const request = { user: { role: 'teacher', sub: 'teacher-1' } };

function controllerFixture(
  homework?: Record<string, any>,
  attempt?: Record<string, any>,
  curriculum: {
    lessons?: Record<string, any>[];
    chunks?: Record<string, any>[];
    documents?: Record<string, any>[];
  } = {},
) {
  let insertedRows: Record<string, any>[] = [];
  let gradingMessages: Array<{ role: string; content: string }> = [];
  const embeddingQueries: string[] = [];
  const db = {
    client: {
      from(table: string) {
        let rangeStart = 0;
        let rangeEnd = Number.MAX_SAFE_INTEGER;
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          order: () => query,
          range(start: number, end: number) {
            rangeStart = start;
            rangeEnd = end;
            return query;
          },
          insert(rows: Record<string, any>[]) {
            insertedRows = rows;
            return {
              select: async () => ({
                data: rows.map((row, index) => ({ ...row, id: `homework-${index}` })),
                error: null,
              }),
            };
          },
          limit: () => query,
          then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
            const rows = table === 'homework'
              ? (homework ? [homework] : [])
              : table === 'homework_attempts'
                ? (attempt ? [attempt] : [])
                : table === 'lessons'
                  ? curriculum.lessons || []
                  : table === 'lesson_chunks'
                    ? curriculum.chunks || []
                    : table === 'lesson_documents'
                      ? curriculum.documents || []
                      : [];
            return Promise.resolve({
              data: rows.slice(rangeStart, rangeEnd + 1),
              error: null,
            }).then(resolve, reject);
          },
        };
        return query;
      },
    },
  };
  const studentAuth = {
    resolveTeacherGrades: async () => ['Class 8'],
    listStudentsByScope: async () => ({ students: [{ id: 'student-1' }] }),
  };
  const localFeed = {
    addHomework: () => undefined,
    getHomeworkById: () => null,
  };
  const llm = {
    query: async (messages: Array<{ role: string; content: string }>) => {
      gradingMessages = messages;
      return '{"score":85,"feedback":"Good work."}';
    },
  };
  const embeddings = {
    embed: async (text: string) => {
      embeddingQueries.push(text);
      return [1, 0];
    },
    cosine: (left: number[], right: number[]) =>
      left.length === right.length ? left.reduce((sum, value, index) => sum + value * right[index], 0) : 0,
  };
  const controller = Object.create(TeacherController.prototype) as any;
  Object.assign(controller, {
    db,
    studentAuth,
    localFeed,
    llm,
    embeddings,
    assignmentContextCache: new Map(),
  });
  return {
    controller: controller as TeacherController,
    insertedRows: () => insertedRows,
    gradingMessages: () => gradingMessages,
    embeddingQueries: () => embeddingQueries,
  };
}

test('teacher homework assignments persist private AI marking guidance in existing metadata', async () => {
  const fixture = controllerFixture();
  const guidance = 'Use the Unit 5 textbook. Full credit requires stating that roots absorb water.';

  const result = await fixture.controller.assignHomework(request, {
    title: 'Plant worksheet',
    subject: 'Science',
    className: 'Class 8',
    gradingGuidance: guidance,
  });

  assert.equal(result.success, true);
  assert.equal(fixture.insertedRows()[0].tasks.meta.gradingGuidance, guidance);
  assert.equal(result.assignments[0].gradingGuidance, guidance);
});

test('AI correction reads linked textbook chunks and applies the default and teacher rubrics', async () => {
  const fixture = controllerFixture(
    {
      id: 'homework-1',
      title: 'Plant worksheet',
      subject: 'Science',
      tasks: {
        meta: {
          assignmentGroupId: 'assignment-1',
          gradingGuidance: 'Use Unit 5. Full credit requires roots absorb water; accept equivalent wording.',
          lessonIds: ['lesson-1'],
          lessonTitles: ['Unit 5: Plant systems'],
        },
      },
    },
    {
      homework_id: 'homework-1',
      answers: { text: 'Roots take in water from the soil.' },
    },
    {
      lessons: [{
        id: 'lesson-1',
        title: 'Unit 5: Plant systems',
        subject: 'Science',
        teacher_id: 'teacher-1',
      }],
      chunks: [{
        lesson_id: 'lesson-1',
        document_id: 'document-1',
        teacher_id: 'teacher-1',
        chunk_index: 0,
        page_number: 3,
        chunk_text: 'Roots absorb water from the soil through root hairs.',
        embedding: [1, 0],
      }],
      documents: [{
        id: 'document-1',
        teacher_id: 'teacher-1',
        file_name: 'Science textbook.pdf',
      }],
    },
  );

  const result = await fixture.controller.aiGradeHomework(request, 'homework-1');
  const systemPrompt = fixture.gradingMessages()[0]?.content || '';
  const userPrompt = fixture.gradingMessages()[1]?.content || '';

  assert.equal(result.success, true);
  assert.match(systemPrompt, /Unit 5: Plant systems/);
  assert.match(systemPrompt, /Use Unit 5\. Full credit requires roots absorb water/);
  assert.match(systemPrompt, /accept accurate paraphrases/i);
  assert.match(systemPrompt, /For mathematics, check the method, each shown step/);
  assert.match(systemPrompt, /science and social studies/);
  assert.match(userPrompt, /Science textbook\.pdf, page 3/);
  assert.match(userPrompt, /Roots absorb water from the soil through root hairs/);
  assert.match(fixture.embeddingQueries()[0], /Plant worksheet/);
});

test('AI correction auto-detects a relevant unit from the teacher subject curriculum when none is linked', async () => {
  const fixture = controllerFixture(
    {
      id: 'homework-2',
      title: 'Equivalent fractions',
      subject: 'Math',
      note: 'Show each step while finding the equivalent fraction.',
      tasks: { meta: { assignmentGroupId: 'assignment-2' } },
    },
    {
      homework_id: 'homework-2',
      answers: { text: '1/2 = 2/4 because both are equal.' },
    },
    {
      lessons: [
        { id: 'math-lesson', title: 'Fractions', subject: 'Mathematics', teacher_id: 'teacher-1' },
        { id: 'english-lesson', title: 'Reading stories', subject: 'English', teacher_id: 'teacher-1' },
      ],
      chunks: [
        {
          lesson_id: 'math-lesson',
          document_id: 'math-document',
          teacher_id: 'teacher-1',
          chunk_index: 0,
          page_number: 8,
          chunk_text: 'Equivalent fractions represent the same value. Multiply the numerator and denominator by the same non-zero number.',
          embedding: [1, 0],
        },
        {
          lesson_id: 'english-lesson',
          document_id: 'english-document',
          teacher_id: 'teacher-1',
          chunk_index: 0,
          chunk_text: 'A story has characters, a setting, and a sequence of events.',
          embedding: [1, 0],
        },
      ],
      documents: [{
        id: 'math-document',
        teacher_id: 'teacher-1',
        file_name: 'Mathematics textbook.pdf',
      }],
    },
  );

  const result = await fixture.controller.aiGradeHomework(request, 'homework-2');
  const systemPrompt = fixture.gradingMessages()[0]?.content || '';
  const userPrompt = fixture.gradingMessages()[1]?.content || '';

  assert.equal(result.success, true);
  assert.match(systemPrompt, /Fractions/);
  assert.match(userPrompt, /Equivalent fractions represent the same value/);
  assert.doesNotMatch(userPrompt, /A story has characters/);
  assert.match(fixture.embeddingQueries()[0], /Show each step/);
});
