// Run with: node -r ts-node/register/transpile-only scripts/curriculum_pdf_import_test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'node-fetch') return { __esModule: true, default: async () => { throw new Error('Live networking is forbidden in PDF import fixtures'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const { CurriculumService } = require('../src/curriculum/curriculum.service');
const { CurriculumController } = require('../src/controllers/curriculum.controller');
const { readMultiLessonPdf } = require('../src/curriculum/multi-lesson-pdf');
Module._load = originalLoad;

async function textbook(first = 1, frontMatter = false, options = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = (heading, text) => {
    const p = pdf.addPage([600, 780]);
    if (heading) p.drawText(heading, { x: 50, y: 700, size: 24, font });
    for (let i = 0; i < 8; i++) p.drawText(`${text || 'Body text'} line ${i + 1}.`, { x: 50, y: 610 - i * 30, size: 12, font });
    return p;
  };
  if (frontMatter) { page('English textbook', 'Cover'); page('Contents', 'Unit 1 The River; Unit 2 The Garden; Unit 3 The Bridge'); }
  const titles = first === 1 ? ['The River', 'The Garden', 'The Bridge'] : ['The Mountain', 'The Ocean', 'The Forest'];
  for (let i = 0; i < 3; i++) {
    const number = first + i;
    const numberToPrint = options.gap && i === 1 ? number + 1 : number;
    const heading = options.noHeadings ? 'Learning material' : `Unit ${numberToPrint}: ${titles[i]}`;
    const p = page(heading, `ONLY_UNIT_${number}_CONTENT`);
    if (options.sharedPage && i === 0) p.drawText('Unit 2: Another unit', { x: 50, y: 440, size: 24, font });
    if (frontMatter && i === 0) pdf.addPage([600, 780]);
    page(options.noHeadings ? '' : heading, `ONLY_UNIT_${number}_CONTINUATION`);
  }
  if (frontMatter) page('Index', 'CROSS_UNIT_INDEX_NOT_FOR_LAST_UNIT');
  return Buffer.from(await pdf.save());
}

function fixture() {
  const tables = {
    teachers: [
      { id: 'english', school_id: 'school-a', subject: 'English', grades: [7, 8] },
      { id: 'math', school_id: 'school-a', subject: 'Mathematics', grades: ['Class 7'] },
      { id: 'foreign', school_id: 'school-b', subject: 'English', grades: ['Class 7'] },
    ],
    lessons: [
      { id: 'other-class', teacher_id: 'english', subject: 'English', class_name: 'Class 8', order_index: 9, title: 'Keep other class unchanged' },
      { id: 'other-subject', teacher_id: 'math', subject: 'Mathematics', class_name: 'Class 7', order_index: 2, title: 'Keep other subject unchanged' },
      { id: 'other-school', teacher_id: 'foreign', subject: 'English', class_name: 'Class 7', order_index: 1, title: 'Keep other school unchanged' },
    ],
    lesson_documents: [], lesson_chunks: [], lesson_class_visibility: [],
  };
  const originals = JSON.stringify(tables.lessons);
  const calls = [];
  const writes = [];
  let failInsert;
  let failVisibility = false;
  let modelFailure;
  let embeddingGate;
  const db = { client: { from(table) {
    const filters = [];
    let operation = 'select';
    let payload;
    let count;
    const query = {
      select() { return query; }, eq(key, value) { filters.push((row) => row[key] === value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      ilike(key, value) { filters.push((row) => String(row[key]).toLowerCase() === String(value).toLowerCase()); return query; },
      order() { return query; }, limit(n) { count = n; return query; },
      insert(rows) { operation = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return query; },
      update(row) { operation = 'update'; payload = row; return query; },
      delete() { operation = 'delete'; return query; },
      then(resolve) {
        const rows = tables[table] || (tables[table] = []);
        const matches = (row) => filters.every((filter) => filter(row));
        if ((operation === 'insert' && failInsert === table) || (operation === 'update' && table === 'lesson_class_visibility' && payload.is_visible && failVisibility)) {
          resolve({ data: [], error: { message: 'Simulated write failure' } }); return;
        }
        let data = rows.filter(matches);
        if (operation === 'insert') { data = payload.map((row) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...row })); rows.push(...data); }
        if (operation === 'update') data.forEach((row) => Object.assign(row, payload));
        if (operation === 'delete') tables[table] = rows.filter((row) => !matches(row));
        if (operation !== 'select') writes.push({ table, operation, payload });
        resolve({ data: count ? data.slice(0, count) : data, error: null });
      },
    };
    return query;
  } } };
  const llm = { query: async (messages, options) => {
    assert.equal(options.requireModelResponse, true);
    const input = JSON.parse(messages[1].content);
    calls.push(input);
    if (modelFailure) {
      const response = typeof modelFailure === 'function' ? modelFailure(input) : modelFailure;
      if (response !== null) return response;
    }
    return JSON.stringify(input.pageHeaders ? { verified: true } : { units: input.starts.map(({ page, title, heading }) => ({ page, title, heading })) });
  } };
  const service = new CurriculumService(db, { embed: async () => { if (embeddingGate) await embeddingGate; return Array(384).fill(0.1); } },
    { generateForLesson: async () => ({}) }, { generateForLesson: async () => ({}) }, llm);
  const input = (buffer, teacherId = 'english') => ({ schoolId: 'school-a', teacherId, subject: 'English', className: 'Class 7', fileName: 'book.pdf', data: buffer.toString('base64') });
  const preview = (buffer) => service.previewMultiLessonPdf(input(buffer));
  const publish = (id) => service.publishMultiLessonPdf({ schoolId: 'school-a', previewId: id, confirmed: true });
  return { service, db, tables, originals, calls, writes, input, preview, publish,
    model: (value) => { modelFailure = value; }, fail: (value) => { failInsert = value; },
    failPublish: () => { failVisibility = true; }, holdEmbedding: (promise) => { embeddingGate = promise; } };
}

async function main() {
  const cwd = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'academix-pdf-import-'));
  try {
    process.chdir(temp);
    const textFixture = fixture();
    const createdText = await textFixture.service.createLessonAsSchoolAdmin({
      schoolId: 'school-a', teacherId: 'english', subject: 'English', className: 'Class 7', title: 'Pasted lesson',
    });
    const textInput = { schoolId: 'school-a', lessonId: createdText.lesson.id };
    const content = 'Force = mass × acceleration.\nతెలుగు: ప్రకృతి.\n' + 'This lesson describes motion and its examples. '.repeat(160);
    const textResult = await textFixture.service.saveLessonTextAsSchoolAdmin({ ...textInput, content });
    assert.equal(textResult.document.mime_type, 'text/plain');
    assert.equal(textResult.document.extraction_status, 'completed');
    assert(textResult.chunkCount > 1);
    const textChunks = textFixture.tables.lesson_chunks;
    assert(textChunks.every((chunk) => chunk.lesson_id === createdText.lesson.id && chunk.document_id === textResult.document.id));
    assert(textChunks.some((chunk) => chunk.chunk_text.includes('తెలుగు: ప్రకృతి')));
    assert.equal(fs.readFileSync(path.join(temp, 'local-data', textResult.fileUrl.slice(1)), 'utf8'), content.trim(), 'Store the original Unicode text without PDF conversion or truncation');
    const textStudentLessons = await textFixture.service.listLessons({ className: 'Class 7', subject: 'English' });
    assert.equal(textStudentLessons.lessons[0].title, 'Pasted lesson');
    assert.equal(textStudentLessons.lessons[0].documentCount, 1);
    assert.equal(textFixture.calls.length, 0, 'Pasted content must not need AI segmentation');
    for (const invalidContent of ['', ' \n ', null, 'x'.repeat(200001)]) {
      await assert.rejects(textFixture.service.saveLessonTextAsSchoolAdmin({ ...textInput, content: invalidContent }), /Paste|200,000/);
    }
    await assert.rejects(textFixture.service.saveLessonTextAsSchoolAdmin({ ...textInput, schoolId: 'school-b', content: 'Not my lesson' }), /scope/);
    const textController = new CurriculumController(textFixture.service, textFixture.db, {});
    assert.equal((await textController.saveLessonText({ actorRole: 'teacher' }, textInput.lessonId, { content })).success, false);
    const maxText = await textFixture.service.saveLessonTextAsSchoolAdmin({ ...textInput, content: 'x'.repeat(200000) });
    assert.equal(maxText.extractedTextLength, 200000);
    const failedText = fixture();
    failedText.fail('lesson_chunks');
    const failedTextController = new CurriculumController(failedText.service, failedText.db, {});
    const failedTextResult = await failedTextController.saveLessonText({ actorRole: 'school_admin', actorId: 'school-a', headers: {} }, 'other-class', { content: 'Motion and forces.' });
    assert.equal(failedTextResult.success, false, 'An indexing failure must not be returned as a successful text save');
    assert.equal(failedTextResult.document.extraction_status, 'failed');
    assert.match(failedTextResult.error, /Simulated write failure/);
    const failedTextDoc = fixture();
    failedTextDoc.fail('lesson_documents');
    const filesBeforeTextFailure = fs.readdirSync(path.join(temp, 'local-data', 'uploads', 'curriculum')).sort();
    await assert.rejects(failedTextDoc.service.saveLessonTextAsSchoolAdmin({ schoolId: 'school-a', lessonId: 'other-class', content: 'Content' }), /Simulated write failure/);
    assert.deepEqual(fs.readdirSync(path.join(temp, 'local-data', 'uploads', 'curriculum')).sort(), filesBeforeTextFailure);

    const first = await textbook(1, true);
    const second = await textbook(4);
    const f = fixture();
    const preview = await f.preview(first);
    assert.deepEqual(preview.lessons.map((unit) => [unit.lessonNumber, unit.title, unit.startPage, unit.endPage]), [
      [1, 'The River', 3, 5], [2, 'The Garden', 6, 7], [3, 'The Bridge', 8, 9],
    ]);
    assert.deepEqual(preview.excludedPages, [1, 2, 10]);
    assert.equal(f.writes.length, 0, 'Preview must not create lessons/documents/chunks');
    assert.equal(f.calls.filter((call) => call.pageHeaders).flatMap((call) => call.pageHeaders).length, 10, 'Every source page must be checked for missed units');
    await assert.rejects(f.service.publishMultiLessonPdf({ schoolId: 'school-b', previewId: preview.previewId, confirmed: true }), /not available for your school/);
    await assert.rejects(f.service.publishMultiLessonPdf({ schoolId: 'school-a', previewId: preview.previewId, confirmed: false }), /Review/);
    const published = await f.publish(preview.previewId);
    assert.equal(published.lessonCount, 3);
    assert.deepEqual(await f.publish(preview.previewId), published, 'Repeated publish is idempotent');
    for (let i = 0; i < published.lessons.length; i++) {
      const lesson = published.lessons[i];
      const chunks = f.tables.lesson_chunks.filter((row) => row.lesson_id === lesson.id);
      assert(chunks.length);
      assert(chunks.every((row) => !row.chunk_text.includes('CROSS_UNIT_INDEX')));
      for (let other = 1; other <= 3; other++) if (other !== i + 1) assert(chunks.every((row) => !row.chunk_text.includes(`ONLY_UNIT_${other}`)), 'No neighbouring unit may enter these tutor chunks');
      const doc = f.tables.lesson_documents.find((row) => row.lesson_id === lesson.id);
      const pages = await readMultiLessonPdf(fs.readFileSync(path.join(temp, 'local-data', doc.file_url.slice(1))));
      assert.equal(pages.length, i === 0 ? 3 : 2, 'Physical lesson PDF must contain only its own pages, including blanks');
      assert(pages.every((page) => !page.text.includes('CROSS_UNIT_INDEX')));
    }
    const next = await f.preview(second);
    assert.deepEqual(next.lessons.map((unit) => unit.lessonNumber), [4, 5, 6]);
    await f.publish(next.previewId);
    assert.equal(JSON.stringify(f.tables.lessons.filter((row) => ['other-class', 'other-subject', 'other-school'].includes(row.id))), f.originals);
    const studentLessons = await f.service.listLessons({ className: 'Class 7', subject: 'English' });
    assert.equal(studentLessons.lessons.length, 6);
    const teacherLessons = await f.service.listLessons({ teacherId: 'english', className: 'Class 7', subject: 'English' });
    assert.deepEqual(teacherLessons.lessons.map((lesson) => lesson.title), studentLessons.lessons.map((lesson) => lesson.title));
    assert(studentLessons.lessons.every((lesson) => lesson.documentCount === 1));
    await assert.rejects(f.preview(first), /already exists/);
    const duplicateTitle = fixture();
    duplicateTitle.tables.lessons.push({ id: 'named-manual', teacher_id: 'english', subject: 'English', class_name: 'Class 7', order_index: 1, title: 'Lesson 1: The River' });
    await assert.rejects(duplicateTitle.preview(first), /already exists/);

    for (const teacherId of ['foreign', 'math']) {
      const scoped = fixture();
      await assert.rejects(scoped.service.previewMultiLessonPdf(scoped.input(first, teacherId)), /scope|teach this subject/);
      assert.equal(scoped.calls.length, 0);
    }
    for (const options of [{ gap: true }, { sharedPage: true }, { noHeadings: true }]) {
      const bad = fixture();
      await assert.rejects(bad.preview(await textbook(1, false, options)), /headings|Two units|inside a page/);
      assert.equal(bad.writes.length, 0);
    }
    const hallucinated = fixture();
    hallucinated.model('{"verified":true}');
    await assert.rejects(hallucinated.preview(first), /confirm every unit/);
    assert.equal(hallucinated.writes.length, 0);
    const missed = fixture();
    missed.model('{"error":"Possible undetected unit on page 4"}');
    await assert.rejects(missed.preview(first), /undetected unit/);
    assert.equal(missed.writes.length, 0);
    for (const field of ['page', 'title', 'heading']) {
      const changed = fixture();
      changed.model((input) => {
        if (input.pageHeaders) return null;
        const units = input.starts.map(({ page, title, heading }) => ({ page, title, heading }));
        units[0][field] = field === 'page' ? 1 : 'Invented content';
        return JSON.stringify({ units });
      });
      await assert.rejects(changed.preview(first), /changed a source heading or boundary/);
      assert.equal(changed.writes.length, 0);
    }
    const scan = await PDFDocument.create();
    const pixel = await scan.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64'));
    scan.addPage([600, 780]).drawImage(pixel, { x: 20, y: 20, width: 500, height: 700 });
    const scanBytes = Buffer.from(await scan.save());
    const scanned = fixture();
    await assert.rejects(scanned.preview(scanBytes), /OCR/);
    assert.equal(scanned.writes.length, 0);
    const mixed = await PDFDocument.load(second);
    const imagePage = mixed.insertPage(1, [600, 780]);
    imagePage.drawImage(await mixed.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64')), { x: 20, y: 20, width: 500, height: 700 });
    const unreadable = fixture();
    await assert.rejects(unreadable.preview(Buffer.from(await mixed.save())), /Page 2 is image-only/);
    assert.equal(unreadable.writes.length, 0);

    for (const table of ['lessons', 'lesson_documents', 'lesson_chunks', 'lesson_class_visibility', 'activation']) {
      const failed = fixture();
      const staged = await failed.preview(first);
      const beforeFiles = fs.readdirSync(path.join(temp, 'local-data', 'uploads', 'curriculum')).sort();
      if (table === 'activation') failed.failPublish(); else failed.fail(table);
      await assert.rejects(failed.publish(staged.previewId), /Could not/);
      assert.equal(JSON.stringify(failed.tables.lessons), failed.originals, 'Rollback must not renumber or delete existing lessons');
      assert.equal(failed.tables.lesson_chunks.length, 0);
      assert.equal(failed.tables.lesson_documents.length, 0);
      assert.equal(failed.tables.lesson_class_visibility.length, 0);
      assert.deepEqual(fs.readdirSync(path.join(temp, 'local-data', 'uploads', 'curriculum')).sort(), beforeFiles);
    }
    const stale = fixture();
    const oldPreview = await stale.preview(first);
    stale.tables.lessons.push({ id: 'new-manual', teacher_id: 'english', subject: 'English', class_name: 'Class 7', order_index: 1, title: 'Manual upload' });
    await assert.rejects(stale.publish(oldPreview.previewId), /curriculum changed/);
    assert.equal(stale.writes.length, 0);
    const expired = fixture();
    const old = await expired.preview(first);
    expired.service.pdfImportPreviews.get(old.previewId).expiresAt = 0;
    await assert.rejects(expired.publish(old.previewId), /expired/);

    const concurrent = fixture();
    const pending = await concurrent.preview(first);
    let release;
    concurrent.holdEmbedding(new Promise((resolve) => { release = resolve; }));
    const ongoing = concurrent.publish(pending.previewId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await assert.rejects(concurrent.publish(pending.previewId), /in progress/);
    await assert.rejects(concurrent.service.createLessonAsSchoolAdmin({ schoolId: 'school-a', teacherId: 'english', subject: 'English', className: 'Class 7', title: 'Manual concurrent' }), /being published/);
    release();
    await ongoing;

    const denied = fixture();
    const controller = new CurriculumController(denied.service, denied.db, {});
    for (const role of ['student', 'teacher']) {
      const result = await controller.previewPdfImport({ actorRole: role, user: { schoolId: 'school-a' } }, denied.input(first));
      assert.equal(result.success, false);
      assert.match(result.error, /School admin access/);
    }
    assert.equal(denied.calls.length, 0);
    console.log('Curriculum PDF import fixtures passed: real page splits, blanks, contents/index exclusion, isolated tutor chunks, continuation, app API parity, scope, duplicate/ambiguous/missed units, stale previews, rollback and idempotency.');
  } finally {
    process.chdir(cwd);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
