// Run with: node -r ts-node/register/transpile-only scripts/homework_ai_grading_test.js
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const jpeg = Buffer.from([255, 216, 255, 224, 1]);
const calls = [];
let modelReply = '{"score":87,"feedback":"Good reasoning. Check the final calculation."}';
let modelAvailable = true;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'node-fetch') {
    return { __esModule: true, default: async (url, options) => {
      calls.push({ url, body: options?.body ? JSON.parse(options.body) : null });
      if (url === 'https://api.openai.com/v1/chat/completions') {
        return { ok: modelAvailable, status: modelAvailable ? 200 : 503, json: async () => ({ choices: [{ message: { content: modelReply } }] }) };
      }
      if (url.endsWith('/v1/chat')) return { ok: true, json: async () => ({ reply: 'Fixture fallback' }) };
      assert.match(url, /^https:\/\/fixture\.invalid\//, 'No real networking is permitted in these tests');
      return {
        ok: !url.includes('missing'),
        headers: { get: () => url.includes('worksheet') ? 'image/png' : 'image/jpeg' },
        arrayBuffer: async () => url.includes('worksheet') ? png : jpeg,
      };
    } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { LlmService } = require('../src/llm/llm.service');
const { TeacherController } = require('../src/controllers/teacher.controller');
Module._load = originalLoad;

const originalEnv = { ...process.env };
const originalCwd = process.cwd();
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'academix-homework-grading-'));

async function main() {
  process.env.OPENAI_API_KEY = 'fixture-not-a-real-key';
  process.env.OLLAMA_ONLY = '';
  process.env.LLM_PROVIDER = '';
  process.env.USE_OLLAMA = '';
  process.env.LLM_URL = 'http://fixture.invalid';
  const llm = new LlmService();
  let homework = {
    id: 'hw', title: 'Fractions', subject: 'Mathematics', student_id: 'student',
    tasks: { meta: { assignmentGroupId: 'assignment', note: 'Simplify each fraction.', attachmentUrls: ['https://fixture.invalid/worksheet.png'] } },
    latest_answer_text: 'One half.',
    latest_attachment_urls: ['https://fixture.invalid/student.jpg'],
  };
  let attempt = null;
  const controller = Object.assign(Object.create(TeacherController.prototype), {
    llm, assignmentContextCache: new Map(),
    localFeed: { getHomeworkById: () => homework },
    db: { client: { from(table) {
      return {
        select() { return this; }, eq() { return this; }, order() { return this; },
        async limit() { return { data: table === 'homework' ? [homework] : (attempt ? [attempt] : []) }; },
      };
    } } },
  });
  const req = { user: { role: 'teacher', sub: 'teacher' } };
  const result = await controller.aiGradeHomework(req, 'hw');
  assert.deepEqual(result, { success: true, score: 87, feedback: 'Good reasoning. Check the final calculation.' });
  let payload = calls.find((call) => call.url.includes('openai.com')).body;
  assert.match(payload.messages[0].content, /FIRST 1 image/);
  assert.deepEqual(payload.messages[1].content, [
    { type: 'text', text: "Student's written answer:\nOne half.\n\nThe student submitted 1 image(s) of their work — review them closely against the assignment." },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
  ]);
  assert.equal(homework.grade, undefined, 'Autocorrect must not publish a grade without teacher confirmation');

  calls.length = 0;
  homework.latest_attachment_urls = ['https://fixture.invalid/worksheet-answer.png'];
  assert.equal((await controller.aiGradeHomework(req, 'hw')).success, true);
  assert.equal(calls.find((call) => call.url.includes('openai.com')).body.messages[1].content.length, 3, 'Keep worksheet/student image positions even when their bytes match');

  calls.length = 0;
  homework.tasks.meta.note = 'Explain each step before simplifying.';
  attempt = { answers: { text: 'Newer answer.' }, attachment_urls: ['https://fixture.invalid/student.jpg'] };
  assert.equal((await controller.aiGradeHomework(req, 'hw')).success, true);
  payload = calls.find((call) => call.url.includes('openai.com')).body;
  assert.match(payload.messages[0].content, /Explain each step/);
  assert.match(payload.messages[1].content[0].text, /Newer answer/);

  homework.tasks.meta.attachmentUrls = Array.from({ length: 6 }, (_, i) => `https://fixture.invalid/worksheet-${i}.png`);
  calls.length = 0;
  assert.equal((await controller.aiGradeHomework(req, 'hw')).success, true);
  assert.equal(calls.find((call) => call.url.includes('openai.com')).body.messages[1].content.length, 8, 'All six worksheet pages and the student photo must reach the model');

  homework = { id: 'hw-text', latest_answer_text: 'Two.', note: 'What is one plus one?' };
  attempt = null;
  calls.length = 0;
  assert.equal((await controller.aiGradeHomework(req, homework.id)).success, true);
  payload = calls.find((call) => call.url.includes('openai.com')).body;
  assert.equal(typeof payload.messages[1].content, 'string', 'Text-only homework keeps the text-only request shape');

  homework = { id: 'hw-image', latestAttachmentUrls: ['https://fixture.invalid/student.jpg'] };
  calls.length = 0;
  assert.equal((await controller.aiGradeHomework(req, homework.id)).success, true);
  assert.equal(calls.find((call) => call.url.includes('openai.com')).body.messages[1].content.length, 2);

  homework.latestAttachmentUrls = ['https://fixture.invalid/missing.jpg'];
  homework.latestAnswerText = 'Some text is also submitted.';
  calls.length = 0;
  assert.equal((await controller.aiGradeHomework(req, homework.id)).success, false);
  assert.equal(calls.some((call) => call.url.includes('openai.com')), false, 'Do not grade only text when a required image failed to load');

  process.chdir(fixtureDir);
  fs.mkdirSync(path.join('local-data', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join('local-data', 'uploads', 'answer.jpg'), jpeg);
  homework = { id: 'hw-local', latest_attachment_urls: ['/uploads/answer.jpg?cache=1'] };
  calls.length = 0;
  assert.equal((await controller.aiGradeHomework(req, homework.id)).success, true);
  assert.equal(calls.length, 1, 'Local uploads must load from disk even with URL query parameters');
  assert.equal(calls[0].body.messages[1].content[1].image_url.url, `data:image/jpeg;base64,${jpeg.toString('base64')}`);

  for (const reply of [
    'Sorry, the model is unavailable.',
    '{"feedback":"Looks good"}',
    '{"score":101,"feedback":"Looks good"}',
    '{"score":90,"feedback":""}',
    '{"error":"The handwriting is unreadable. Please review manually."}',
  ]) {
    modelReply = reply;
    assert.equal((await controller.aiGradeHomework(req, homework.id)).success, false, `Must reject unreliable correction: ${reply}`);
  }

  modelAvailable = false;
  calls.length = 0;
  assert.equal((await controller.aiGradeHomework(req, homework.id)).success, false);
  assert.equal(calls.some((call) => call.url.endsWith('/v1/chat')), false, 'Grading must not fall back to a mock answer');
  calls.length = 0;
  assert.equal(await llm.query('Ordinary chat'), 'Fixture fallback', 'Existing non-grading fallback behavior is preserved');
  assert.equal(typeof calls[0].body.messages[0].content, 'string');
  console.log('Homework AI grading fixtures passed: text/images, multimodal payloads, latest attempts, cache refresh, local uploads, failure handling and review-only suggestions.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.chdir(originalCwd);
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});
