import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { FlashcardsService } from '../games/flashcards.service';
import { QuizRushService } from '../games/quiz-rush.service';
import { LlmService } from '../llm/llm.service';
import { normalizeGrades } from '../auth/student-auth.service';
import { decodeMultiLessonPdf, readMultiLessonPdf, validatePdfUnits, splitPdfUnits, PdfSourcePage, PdfUnit } from './multi-lesson-pdf';

type VisibilityInput = {
  teacherId: string;
  lessonId: string;
  classNames: string[];
  isVisible?: boolean;
};

type LessonCreateInput = {
  teacherId: string;
  subject: string;
  title: string;
  description?: string;
  className?: string;
  orderIndex?: number;
  isActive?: boolean;
  visibleClassNames?: string[];
};

type AdminLessonCreateInput = Omit<LessonCreateInput, 'teacherId'> & {
  schoolId: string;
  teacherId: string;
};

type UploadInput = {
  teacherId: string;
  lessonId: string;
  fileName: string;
  data: string;
  mimeType?: string;
  schoolId?: string;
};

type AdminUploadInput = Omit<UploadInput, 'teacherId'> & {
  schoolId: string;
};

type PdfImportInput = { schoolId: string; teacherId: string; subject: string; className: string; fileName: string; data: string };
type PdfImportResult = { lessons: Array<{ id: string; title: string; order_index: number }>; lessonCount: number };
type PdfImportPreview = {
  input: Omit<PdfImportInput, 'data'>;
  buffer: Buffer;
  pages: PdfSourcePage[];
  units: PdfUnit[];
  fingerprint: string;
  firstNumber: number;
  expiresAt: number;
  publishing: boolean;
  result?: PdfImportResult;
};

@Injectable()
export class CurriculumService {
  private readonly pdfImportPreviews = new Map<string, PdfImportPreview>();
  private readonly pdfImportScopes = new Set<string>();
  private pdfAnalysisCount = 0;

  constructor(
    private readonly db: SupabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly flashcards: FlashcardsService,
    private readonly quizRush: QuizRushService,
    private readonly llm: LlmService
  ) {}

  private normalizeClassNames(value: any): string[] {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return Array.from(new Set(
      list
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));
  }

  private safeFileName(fileName: string, fallback = 'curriculum-document') {
    const raw = String(fileName || '').trim() || fallback;
    const base = path.basename(raw, path.extname(raw)).replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || fallback;
    const ext = path.extname(raw).replace(/[^.a-z0-9]+/gi, '').toLowerCase() || '.pdf';
    return `${base}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  }

  private savePdfUpload(payload: UploadInput) {
    const fileName = this.safeFileName(payload.fileName, 'lesson-pdf');
    const dataRaw = String(payload.data || '').trim();
    if (!dataRaw) throw new Error('Missing upload data');
    const base64 = dataRaw.replace(/^data:[^;]+;base64,/, '');
    const uploadDir = path.join(process.cwd(), 'local-data', 'uploads', 'curriculum');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const fullPath = path.join(uploadDir, fileName);
    fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
    return { fileName, fullPath, relativeUrl: `/uploads/curriculum/${fileName}` };
  }

  private normalizeExtractedText(text: string) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async extractPdfPages(buffer: Buffer): Promise<{ pages: Array<{ pageNumber: number; text: string }>; pageCount: number }> {
    const pdfParseModule: any = await import('pdf-parse');
    const pdfParse = pdfParseModule?.default || pdfParseModule;
    let pageIndex = 0;
    const pageMarker = '[[[PAGE_BREAK]]]' ;
    const parsed = await pdfParse(buffer, {
      pagerender: async (pageData: any) => {
        pageIndex += 1;
        try {
          const content = await pageData.getTextContent();
          const text = Array.isArray(content?.items)
            ? content.items.map((item: any) => String(item?.str || '')).join(' ')
            : '';
          return `${pageMarker}\n${this.normalizeExtractedText(text)}\n`;
        } catch {
          return `${pageMarker}\n`;
        }
      }
    });

    const rawText = String(parsed?.text || '').trim();
    const parts = rawText.split(pageMarker).map((part) => this.normalizeExtractedText(part)).filter(Boolean);
    const pages = parts.map((text, index) => ({ pageNumber: index + 1, text }));
    return {
      pages,
      pageCount: Number(parsed?.numpages || pages.length || pageIndex || 0)
    };
  }

  private chunkText(text: string, maxWords = 90, overlapWords = 20): string[] {
    const normalized = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!normalized) return [];

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return [normalized];

    const chunks: string[] = [];
    let start = 0;
    while (start < words.length) {
      const end = Math.min(words.length, start + maxWords);
      const chunk = words.slice(start, end).join(' ').trim();
      if (chunk) chunks.push(chunk);
      if (end >= words.length) break;
      start = Math.max(0, end - overlapWords);
    }
    return chunks;
  }

  private async findTeacherById(teacherId: string) {
    const res = await this.db.client.from('teachers').select('*').eq('id', teacherId).limit(1);
    return Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
  }

  private async findLessonById(lessonId: string) {
    const res = await this.db.client.from('lessons').select('*').eq('id', lessonId).limit(1);
    return Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
  }

  private async assertTeacherInSchool(teacherId: string, schoolId: string) {
    const teacher = await this.findTeacherById(teacherId);
    if (!teacher) throw new Error('Teacher not found');
    if (String(teacher.school_id || '') !== String(schoolId || '')) {
      throw new Error('Teacher is outside admin school scope');
    }
    return teacher;
  }

  private async assertLessonInSchool(lessonId: string, schoolId: string) {
    const lesson = await this.findLessonById(lessonId);
    if (!lesson) throw new Error('Lesson not found');
    await this.assertTeacherInSchool(String(lesson.teacher_id || ''), schoolId);
    return lesson;
  }

  /** Every teacher id belonging to a school — the scope for admin operations. */
  private async schoolTeacherIds(schoolId: string): Promise<string[]> {
    const res = await this.db.client.from('teachers').select('id').eq('school_id', String(schoolId || '').trim());
    if (res.error) throw new Error('Could not verify school curriculum scope. Please try again.');
    return (Array.isArray((res as any)?.data) ? (res as any).data : [])
      .map((row: any) => String(row?.id || '').trim())
      .filter(Boolean);
  }

  /**
   * Lessons already filed under a subject + class for this school, ordered the
   * way students see them. This is the list the admin panel numbers 1..N.
   */
  private async lessonsForSubjectClass(schoolId: string, subject: string, className: string) {
    const teacherIds = await this.schoolTeacherIds(schoolId);
    if (!teacherIds.length) return [] as any[];
    const res = await this.db.client.from('lessons').select('*').in('teacher_id', teacherIds);
    if (res.error) throw new Error('Could not read existing lesson numbering. Please try again.');
    const rows: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
    const subj = String(subject || '').trim().toLowerCase();
    const cls = String(className || '').trim().toLowerCase();
    return rows
      .filter((l) => String(l.subject || '').trim().toLowerCase() === subj)
      .filter((l) => String(l.class_name || '').trim().toLowerCase() === cls)
      .sort((a, b) => {
        const byOrder = Number(a.order_index || 0) - Number(b.order_index || 0);
        if (byOrder) return byOrder;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
  }

  /**
   * Every (class, subject) pair that already carries at least one lesson in
   * this school. The admin panel needs these so a subject whose teacher was
   * removed still shows a button — its uploaded PDFs must stay reachable.
   */
  async classSubjectsFromLessons(schoolId: string): Promise<Array<{ className: string; subject: string }>> {
    const teacherIds = await this.schoolTeacherIds(schoolId);
    if (!teacherIds.length) return [];
    const res = await this.db.client.from('lessons').select('*').in('teacher_id', teacherIds);
    const rows: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
    const seen = new Map<string, { className: string; subject: string }>();
    for (const row of rows) {
      const className = String(row?.class_name || '').trim();
      const subject = String(row?.subject || '').trim();
      if (!className || !subject) continue;
      seen.set(`${className.toLowerCase()}::${subject.toLowerCase()}`, { className, subject });
    }
    return Array.from(seen.values());
  }

  /**
   * Lesson numbering is automatic: the first PDF uploaded for a subject + class
   * becomes lesson 1, the next becomes 2, and so on. Admins never type a number.
   */
  async nextOrderIndex(schoolId: string, subject: string, className: string): Promise<number> {
    const existing = await this.lessonsForSubjectClass(schoolId, subject, className);
    return existing.length + 1;
  }

  /** Close gaps after a delete so the list always reads 1, 2, 3, … */
  private async resequenceSubjectClass(schoolId: string, subject: string, className: string) {
    const existing = await this.lessonsForSubjectClass(schoolId, subject, className);
    for (let i = 0; i < existing.length; i += 1) {
      const expected = i + 1;
      if (Number(existing[i].order_index || 0) === expected) continue;
      await this.db.client.from('lessons').update({ order_index: expected }).eq('id', existing[i].id);
    }
  }

  async createLesson(input: LessonCreateInput) {
    const teacherId = String(input.teacherId || '').trim();
    const subject = String(input.subject || '').trim();
    const title = String(input.title || '').trim();
    if (!teacherId) throw new Error('teacherId is required');
    if (!subject) throw new Error('subject is required');
    if (!title) throw new Error('title is required');

    const row = {
      teacher_id: teacherId,
      subject,
      title,
      description: String(input.description || '').trim() || null,
      class_name: String(input.className || '').trim() || null,
      order_index: Number.isFinite(Number(input.orderIndex)) ? Number(input.orderIndex) : 0,
      is_active: input.isActive !== false
    };

    const created = await this.db.client.from('lessons').insert(row).select('*');
    const lesson = Array.isArray((created as any)?.data) ? (created as any).data[0] : null;
    if (!lesson) throw new Error((created as any)?.error?.message || 'Failed to create lesson');

    const visibleClassNames = this.normalizeClassNames([
      ...(Array.isArray(input.visibleClassNames) ? input.visibleClassNames : []),
      input.className
    ]);
    if (visibleClassNames.length) {
      await this.setLessonVisibility({ teacherId, lessonId: lesson.id, classNames: visibleClassNames, isVisible: true });
    }

    return { lesson };
  }

  async createLessonAsSchoolAdmin(input: AdminLessonCreateInput) {
    const schoolId = String(input.schoolId || '').trim();
    const teacherId = String(input.teacherId || '').trim();
    if (!schoolId) throw new Error('schoolId is required');
    if (!teacherId) throw new Error('teacherId is required');
    await this.assertTeacherInSchool(teacherId, schoolId);

    const className = String(input.className || '').trim();
    if (this.pdfImportScopes.has(this.pdfImportScope(schoolId, String(input.subject || ''), className))) {
      throw new Error('A PDF import is being published for this subject and class. Please try adding the lesson once it finishes.');
    }
    // Numbering is derived, not typed: lesson N is simply the Nth lesson filed
    // under this subject + class. An explicit orderIndex still wins so existing
    // callers (and the smoke tests) keep working.
    const orderIndex = Number.isFinite(Number(input.orderIndex)) && Number(input.orderIndex) > 0
      ? Number(input.orderIndex)
      : await this.nextOrderIndex(schoolId, String(input.subject || ''), className);

    return this.createLesson({
      teacherId,
      subject: input.subject,
      title: input.title,
      description: input.description,
      className: input.className,
      orderIndex,
      isActive: input.isActive,
      visibleClassNames: input.visibleClassNames
    });
  }

  private pdfImportScope(schoolId: string, subject: string, className: string) {
    return JSON.stringify([schoolId, subject.trim().toLowerCase(), className.trim().toLowerCase()]);
  }

  private lessonFingerprint(lessons: Array<{ id: string; title: string; order_index: number }>) {
    return JSON.stringify(lessons.map((lesson) => [lesson.id, lesson.title, lesson.order_index]));
  }

  private async assertPdfImportScope(input: Omit<PdfImportInput, 'data'>) {
    if (!input.schoolId || !input.teacherId || !input.subject || !input.className) throw new Error('School, class, subject and assigned teacher are required.');
    const teacher = await this.assertTeacherInSchool(input.teacherId, input.schoolId);
    if (String(teacher.subject || '').trim().toLowerCase() !== input.subject.toLowerCase() ||
        !normalizeGrades(teacher.grades).some((grade) => grade.toLowerCase() === input.className.toLowerCase())) {
      throw new Error('The selected teacher must teach this subject for this class.');
    }
  }

  async previewMultiLessonPdf(raw: PdfImportInput) {
    for (const [id, preview] of this.pdfImportPreviews) {
      if (!preview.publishing && preview.expiresAt < Date.now()) this.pdfImportPreviews.delete(id);
    }
    if ([...this.pdfImportPreviews.values()].filter((preview) => !preview.result).length + this.pdfAnalysisCount >= 8) throw new Error('Too many PDF previews are active. Please try again after they expire.');
    this.pdfAnalysisCount++;
    try {
      const input = {
        schoolId: String(raw.schoolId || '').trim(), teacherId: String(raw.teacherId || '').trim(),
        subject: String(raw.subject || '').trim(), className: String(raw.className || '').trim(),
        fileName: path.basename(String(raw.fileName || 'curriculum.pdf')),
      };
      await this.assertPdfImportScope(input);
      const existing = await this.lessonsForSubjectClass(input.schoolId, input.subject, input.className);
      const buffer = decodeMultiLessonPdf(raw.data);
      const pages = await readMultiLessonPdf(buffer);
      const units = await validatePdfUnits(pages, this.llm);
      const normalizedTitle = (title: string) => title.trim().replace(/^(?:unit|lesson|chapter)\s*(?:\d+|[IVXLCDM]+)\b\s*[:.)-]?\s*/i, '').replace(/\s+/g, ' ').toLowerCase();
      const names = new Set(existing.map((lesson) => normalizedTitle(String(lesson.title || ''))));
      for (const unit of units) {
        const name = normalizedTitle(unit.title);
        if (names.has(name)) throw new Error(`"${unit.title}" already exists in this subject/class or repeats in this PDF. No existing lessons will be replaced.`);
        names.add(name);
      }
      const previewId = randomUUID();
      const firstNumber = existing.length + 1;
      const expiresAt = Date.now() + 15 * 60_000;
      this.pdfImportPreviews.set(previewId, { input, buffer, pages, units, fingerprint: this.lessonFingerprint(existing), firstNumber, expiresAt, publishing: false });
      return {
        previewId, fileName: input.fileName, pageCount: pages.length, expiresAt: new Date(expiresAt).toISOString(),
        lessons: units.map((unit, i) => ({ title: unit.title, startPage: unit.page, endPage: unit.endPage, sourceNumber: unit.number, lessonNumber: firstNumber + i })),
        excludedPages: pages.filter((page) => !units.some((unit) => page.pageNumber >= unit.page && page.pageNumber <= unit.endPage)).map((page) => page.pageNumber),
      };
    } finally {
      this.pdfAnalysisCount--;
    }
  }

  async publishMultiLessonPdf(input: { schoolId: string; previewId: string; confirmed: boolean }) {
    const preview = this.pdfImportPreviews.get(String(input.previewId || ''));
    if (!preview || preview.input.schoolId !== String(input.schoolId || '').trim()) throw new Error('This PDF preview is not available for your school. Analyse the PDF again.');
    if (preview.result) return preview.result;
    if (preview.expiresAt < Date.now()) throw new Error('This PDF preview expired. Analyse the PDF again before publishing.');
    if (input.confirmed !== true) throw new Error('Review the lesson names and page boundaries before publishing.');
    const scope = this.pdfImportScope(preview.input.schoolId, preview.input.subject, preview.input.className);
    if (preview.publishing || this.pdfImportScopes.has(scope)) throw new Error('This subject already has a PDF import in progress.');
    preview.publishing = true;
    this.pdfImportScopes.add(scope);
    const lessonIds: string[] = [];
    const savedPaths: string[] = [];
    let wroteRows = false;
    try {
      await this.assertPdfImportScope(preview.input);
      const existing = await this.lessonsForSubjectClass(preview.input.schoolId, preview.input.subject, preview.input.className);
      if (this.lessonFingerprint(existing) !== preview.fingerprint) throw new Error('The curriculum changed after this preview. Analyse the PDF again to get the correct continuation numbers.');
      const split = await splitPdfUnits(preview.buffer, preview.pages, preview.units);
      const lessonRows = split.map(({ unit }, i) => ({
        id: randomUUID(), teacher_id: preview.input.teacherId, subject: preview.input.subject, class_name: preview.input.className,
        title: unit.title, description: `Imported from ${preview.input.fileName}, source PDF pages ${unit.page}-${unit.endPage}.`,
        order_index: preview.firstNumber + i, is_active: false,
      }));
      const documentRows: Array<Record<string, unknown>> = [];
      const chunkRows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < split.length; i++) {
        const { unit, data } = split[i];
        const lessonId = lessonRows[i].id;
        lessonIds.push(lessonId);
        const docId = randomUUID();
        const saved = this.savePdfUpload({ teacherId: preview.input.teacherId, lessonId, fileName: `${unit.title}.pdf`, data: data.toString('base64') });
        savedPaths.push(saved.fullPath);
        documentRows.push({ id: docId, lesson_id: lessonId, teacher_id: preview.input.teacherId, file_name: saved.fileName, file_url: saved.relativeUrl, file_size_bytes: data.length, mime_type: 'application/pdf', extraction_status: 'completed' });
        let chunkIndex = 0;
        for (const page of preview.pages.slice(unit.page - 1, unit.endPage)) {
          for (const text of this.chunkText(page.text)) {
            const embedding = await this.embeddings.embed(text, { targetDim: 384, preferSemantic: true });
            chunkRows.push({ document_id: docId, lesson_id: lessonId, teacher_id: preview.input.teacherId, chunk_text: text, chunk_index: chunkIndex++, page_number: page.pageNumber - unit.page + 1, embedding });
          }
        }
        if (!chunkIndex) throw new Error(`"${unit.title}" has no readable teaching content.`);
      }
      const current = await this.lessonsForSubjectClass(preview.input.schoolId, preview.input.subject, preview.input.className);
      await this.assertPdfImportScope(preview.input);
      if (this.lessonFingerprint(current) !== preview.fingerprint) throw new Error('The curriculum changed while this PDF was being processed. Analyse it again before publishing.');
      wroteRows = true;
      for (const [table, rows] of [
        ['lessons', lessonRows], ['lesson_documents', documentRows], ['lesson_chunks', chunkRows],
        ['lesson_class_visibility', lessonIds.map((lessonId) => ({ lesson_id: lessonId, teacher_id: preview.input.teacherId, class_name: preview.input.className, is_visible: false }))],
      ] as const) {
        const result = await this.db.client.from(table).insert(rows);
        if (result.error) throw new Error(`Could not save ${table}: ${result.error.message}`);
      }
      if (documentRows.length) {
        const assetResult = await this.db.client.from('school_asset_registry').insert(
          documentRows.map((row) => ({
            school_id: preview.input.schoolId,
            teacher_id: preview.input.teacherId,
            asset_type: 'curriculum',
            file_url: String(row.file_url || '')
          }))
        );
        if ((assetResult as any)?.error) throw new Error(`Could not register imported PDFs for permanent deletion: ${(assetResult as any).error.message}`);
      }
      const allLessons = await this.lessonsForSubjectClass(preview.input.schoolId, preview.input.subject, preview.input.className);
      const importedIds = new Set(lessonIds);
      const originalLessons = allLessons.filter((lesson) => !importedIds.has(String(lesson.id)));
      const numbers = new Set(lessonRows.map((lesson) => lesson.order_index));
      if (allLessons.length !== existing.length + lessonRows.length || this.lessonFingerprint(originalLessons) !== preview.fingerprint ||
          originalLessons.some((lesson) => numbers.has(Number(lesson.order_index)))) {
        throw new Error('Another curriculum change conflicted with this import. No imported lessons will be published.');
      }
      const active = await this.db.client.from('lessons').update({ is_active: true }).in('id', lessonIds);
      if (active.error) throw new Error(`Could not activate imported lessons: ${active.error.message}`);
      const visible = await this.db.client.from('lesson_class_visibility').update({ is_visible: true }).in('lesson_id', lessonIds);
      if (visible.error) throw new Error(`Could not publish imported lessons: ${visible.error.message}`);
      const result: PdfImportResult = { lessonCount: lessonRows.length, lessons: lessonRows.map((lesson) => ({ id: lesson.id, title: lesson.title, order_index: lesson.order_index })) };
      preview.result = result;
      preview.buffer = Buffer.alloc(0);
      preview.pages = [];
      for (const lessonId of lessonIds) {
        this.flashcards.generateForLesson(lessonId, { force: true }).catch((error) => console.warn('Imported lesson flashcards could not be prepared', error));
        this.quizRush.generateForLesson(lessonId, { force: true }).catch((error) => console.warn('Imported lesson quiz could not be prepared', error));
      }
      return result;
    } catch (error) {
      const cleanupErrors: string[] = [];
      if (wroteRows && lessonIds.length) {
        for (const [table, column] of [['lesson_chunks', 'lesson_id'], ['lesson_documents', 'lesson_id'], ['lesson_class_visibility', 'lesson_id'], ['lessons', 'id']]) {
          try {
            const result = await this.db.client.from(table).delete().in(column, lessonIds);
            if (result.error) throw new Error(result.error.message);
          } catch (cleanupError) { cleanupErrors.push(`${table}: ${(cleanupError as Error).message}`); }
        }
      }
      for (const fullPath of savedPaths) {
        try { fs.unlinkSync(fullPath); } catch (cleanupError) { cleanupErrors.push(`PDF file: ${(cleanupError as Error).message}`); }
      }
      if (cleanupErrors.length) {
        this.pdfImportPreviews.delete(input.previewId);
        console.error('PDF import cleanup incomplete', cleanupErrors);
        throw new Error(`${(error as Error).message} Cleanup was incomplete; contact support before retrying. Imported lesson IDs: ${lessonIds.join(', ')}.`);
      }
      throw error;
    } finally {
      preview.publishing = false;
      this.pdfImportScopes.delete(scope);
    }
  }

  /** Rename / re-describe / re-order a lesson. Admin scoped. */
  async updateLessonAsSchoolAdmin(input: {
    schoolId: string;
    lessonId: string;
    title?: string;
    description?: string | null;
    orderIndex?: number;
  }) {
    const schoolId = String(input.schoolId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    if (!schoolId) throw new Error('schoolId is required');
    if (!lessonId) throw new Error('lessonId is required');
    const lesson = await this.assertLessonInSchool(lessonId, schoolId);

    const changes: any = { updated_at: new Date().toISOString() };
    if (this.pdfImportScopes.has(this.pdfImportScope(schoolId, String(lesson.subject || ''), String(lesson.class_name || '')))) {
      throw new Error('A PDF import is being published for this subject and class. Please edit the lesson after it finishes.');
    }
    if (input.title !== undefined) {
      const title = String(input.title || '').trim();
      if (!title) throw new Error('title cannot be empty');
      changes.title = title;
    }
    if (input.description !== undefined) {
      changes.description = String(input.description || '').trim() || null;
    }
    if (input.orderIndex !== undefined && Number.isFinite(Number(input.orderIndex))) {
      changes.order_index = Number(input.orderIndex);
    }

    await this.db.client.from('lessons').update(changes).eq('id', lessonId);

    // The orchard names chapters after the lesson, so a rename must follow
    // through immediately rather than waiting for the next student visit.
    if (changes.title) {
      await this.db.client.from('orchard_chapters').update({ title: changes.title }).eq('lesson_id', lessonId);
      await this.db.client.from('flashcard_decks').update({ chapter_title: changes.title }).eq('lesson_id', lessonId);
    }

    const updated = await this.findLessonById(lessonId);
    return { lesson: updated || { ...lesson, ...changes } };
  }

  /**
   * Delete a lesson and everything derived from it. `lesson_documents`,
   * `lesson_chunks`, `lesson_class_visibility` and `student_lesson_progress`
   * cascade in the DB; `orchard_chapters` and `flashcard_decks` hold soft
   * references, so they are cleaned up here.
   */
  async deleteLessonAsSchoolAdmin(input: { schoolId: string; lessonId: string }) {
    const schoolId = String(input.schoolId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    if (!schoolId) throw new Error('schoolId is required');
    if (!lessonId) throw new Error('lessonId is required');
    const lesson = await this.assertLessonInSchool(lessonId, schoolId);

    const docs = await this.listLessonDocuments(lessonId);
    if (this.pdfImportScopes.has(this.pdfImportScope(schoolId, String(lesson.subject || ''), String(lesson.class_name || '')))) {
      throw new Error('A PDF import is being published for this subject and class. Please delete the lesson after it finishes.');
    }
    for (const doc of docs.documents || []) this.removeStoredFile(doc?.file_url);

    await this.purgeLessonDerivedData(lessonId);

    // Explicit deletes keep this correct even where the cascade is not in place
    // (e.g. the file-backed mock client used by the offline smoke tests).
    await this.db.client.from('lesson_chunks').delete().eq('lesson_id', lessonId);
    await this.db.client.from('lesson_documents').delete().eq('lesson_id', lessonId);
    await this.db.client.from('lesson_class_visibility').delete().eq('lesson_id', lessonId);
    await this.db.client.from('lessons').delete().eq('id', lessonId);

    await this.resequenceSubjectClass(schoolId, String(lesson.subject || ''), String(lesson.class_name || ''));
    return { lessonId, deleted: true };
  }

  /** Drop the orchard chapters and flashcard decks generated from a lesson. */
  private async purgeLessonDerivedData(lessonId: string) {
    const chaptersRes = await this.db.client.from('orchard_chapters').select('id').eq('lesson_id', lessonId);
    const chapterIds = (Array.isArray((chaptersRes as any)?.data) ? (chaptersRes as any).data : [])
      .map((row: any) => String(row?.id || ''))
      .filter(Boolean);
    for (const chapterId of chapterIds) {
      await this.db.client.from('orchard_trees').update({ next_chapter_id: null }).eq('next_chapter_id', chapterId);
      await this.db.client.from('chapter_growth').delete().eq('chapter_id', chapterId);
      await this.db.client.from('orchard_reviews').delete().eq('chapter_id', chapterId);
      await this.db.client.from('orchard_activity').update({ chapter_id: null }).eq('chapter_id', chapterId);
      await this.db.client.from('orchard_chapters').delete().eq('id', chapterId);
    }

    const decksRes = await this.db.client.from('flashcard_decks').select('id').eq('lesson_id', lessonId);
    const deckIds = (Array.isArray((decksRes as any)?.data) ? (decksRes as any).data : [])
      .map((row: any) => String(row?.id || ''))
      .filter(Boolean);
    for (const deckId of deckIds) {
      await this.db.client.from('flashcards').delete().eq('deck_id', deckId);
      await this.db.client.from('flashcard_decks').delete().eq('id', deckId);
    }
  }

  private removeStoredFile(fileUrl: any) {
    const rel = String(fileUrl || '').trim();
    if (!rel.startsWith('/uploads/')) return;
    try {
      const full = path.join(process.cwd(), 'local-data', rel.replace(/^\//, ''));
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      /* the DB row is the source of truth; a stale file is harmless */
    }
  }

  /**
   * Remove one uploaded PDF. Its extracted chunks go with it, and the derived
   * flashcards are rebuilt from whatever content is left so games and the AI
   * tutor never answer from a document the school has taken down.
   */
  async deleteLessonDocumentAsSchoolAdmin(input: { schoolId: string; lessonId: string; documentId: string }) {
    const schoolId = String(input.schoolId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    const documentId = String(input.documentId || '').trim();
    if (!documentId) throw new Error('documentId is required');
    await this.assertLessonInSchool(lessonId, schoolId);

    const docRes = await this.db.client.from('lesson_documents').select('*').eq('id', documentId).limit(1);
    const doc = Array.isArray((docRes as any)?.data) ? (docRes as any).data[0] : null;
    if (!doc) throw new Error('Document not found');
    if (String(doc.lesson_id || '') !== lessonId) throw new Error('Document does not belong to this lesson');

    await this.db.client.from('lesson_chunks').delete().eq('document_id', documentId);
    await this.db.client.from('lesson_documents').delete().eq('id', documentId);
    this.removeStoredFile(doc.file_url);

    // Rebuild the derived content from the remaining chunks (or clear it if the
    // lesson now has none).
    await this.purgeLessonDerivedData(lessonId);
    const remaining = await this.db.client.from('lesson_chunks').select('id').eq('lesson_id', lessonId).limit(1);
    if (Array.isArray((remaining as any)?.data) && (remaining as any).data.length) {
      this.flashcards.generateForLesson(lessonId, { force: true }).catch(() => { /* best-effort */ });
      this.quizRush.generateForLesson(lessonId, { force: true }).catch(() => { /* best-effort */ });
    }

    return { lessonId, documentId, deleted: true };
  }

  async listLessons(params: { teacherId?: string; schoolId?: string; className?: string; subject?: string; lessonId?: string }) {
    const teacherId = String(params.teacherId || '').trim();
    const schoolId = String(params.schoolId || '').trim();
    const className = String(params.className || '').trim();
    let query = this.db.client.from('lessons').select('*');
    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    } else if (schoolId) {
      const teachersRes = await this.db.client.from('teachers').select('id').eq('school_id', schoolId);
      const teacherIds = (Array.isArray((teachersRes as any)?.data) ? (teachersRes as any).data : [])
        .map((row: any) => String(row?.id || '').trim())
        .filter(Boolean);
      if (!teacherIds.length) return { lessons: [] };
      query = query.in('teacher_id', teacherIds);
    }
    if (params.lessonId) query = query.eq('id', String(params.lessonId).trim());
    if (params.subject) query = query.ilike('subject', String(params.subject).trim());

    const res = await query.order('order_index', { ascending: true }).order('created_at', { ascending: true });
    const lessons = Array.isArray((res as any)?.data) ? (res as any).data : [];
    if (!lessons.length) return { lessons: [] };

    const lessonIds = lessons.map((l: any) => String(l.id || '')).filter(Boolean);
    const visRes = lessonIds.length
      ? await this.db.client.from('lesson_class_visibility').select('*').in('lesson_id', lessonIds)
      : { data: [] };
    const docRes = lessonIds.length
      ? await this.db.client.from('lesson_documents').select('*').in('lesson_id', lessonIds)
      : { data: [] };

    const visRows: any[] = Array.isArray((visRes as any)?.data) ? (visRes as any).data : [];
    const docRows: any[] = Array.isArray((docRes as any)?.data) ? (docRes as any).data : [];

    const visByLesson = new Map<string, any[]>();
    for (const row of visRows) {
      const key = String(row.lesson_id || '');
      if (!visByLesson.has(key)) visByLesson.set(key, []);
      visByLesson.get(key)!.push(row);
    }

    const docsByLesson = new Map<string, any[]>();
    for (const row of docRows) {
      const key = String(row.lesson_id || '');
      if (!docsByLesson.has(key)) docsByLesson.set(key, []);
      docsByLesson.get(key)!.push(row);
    }

    const lessonList = lessons.map((lesson: any) => {
      const visibility = visByLesson.get(String(lesson.id || '')) || [];
      const visibleClassNames = visibility.filter((v: any) => v.is_visible !== false).map((v: any) => v.class_name);
      const isVisibleForClass = className
        ? visibility.some((v: any) => String(v.class_name || '') === className && v.is_visible !== false)
        : undefined;

      return {
        ...lesson,
        documentCount: (docsByLesson.get(String(lesson.id || '')) || []).length,
        visibleClassNames,
        isVisibleForClass
      };
    }).filter((lesson: any) => (className ? !!lesson.isVisibleForClass : true));

    return { lessons: lessonList };
  }

  async setLessonVisibility(input: VisibilityInput) {
    const teacherId = String(input.teacherId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    const classNames = this.normalizeClassNames(input.classNames);
    const isVisible = input.isVisible !== false;

    if (!teacherId) throw new Error('teacherId is required');
    if (!lessonId) throw new Error('lessonId is required');
    if (!classNames.length) throw new Error('classNames is required');

    const lessonRes = await this.db.client.from('lessons').select('*').eq('id', lessonId).limit(1);
    const lesson = Array.isArray((lessonRes as any)?.data) ? (lessonRes as any).data[0] : null;
    if (!lesson) throw new Error('Lesson not found');
    if (String(lesson.teacher_id || '') !== teacherId) throw new Error('Teacher does not own this lesson');

    const existingRes = await this.db.client.from('lesson_class_visibility').select('*').eq('lesson_id', lessonId);
    const existingRows: any[] = Array.isArray((existingRes as any)?.data) ? (existingRes as any).data : [];
    const existingByClass = new Map<string, any>();
    existingRows.forEach((row) => existingByClass.set(String(row.class_name || ''), row));

    const payloads = classNames.map((className) => ({
      lesson_id: lessonId,
      teacher_id: teacherId,
      class_name: className,
      is_visible: isVisible
    }));

    const toInsert = payloads.filter((row) => !existingByClass.has(row.class_name));
    const toUpdate = payloads.filter((row) => existingByClass.has(row.class_name));

    if (toUpdate.length) {
      await this.db.client.from('lesson_class_visibility')
        .update({ teacher_id: teacherId, is_visible: isVisible })
        .eq('lesson_id', lessonId)
        .in('class_name', toUpdate.map((row) => row.class_name));
    }

    if (toInsert.length) {
      await this.db.client.from('lesson_class_visibility').insert(toInsert);
    }

    return { lessonId, teacherId, classNames, isVisible };
  }

  async uploadLessonDocument(input: UploadInput) {
    const teacherId = String(input.teacherId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    const fileNameRaw = String(input.fileName || 'lesson.pdf').trim() || 'lesson.pdf';
    const mimeType = String(input.mimeType || 'application/pdf').trim() || 'application/pdf';
    if (!teacherId) throw new Error('teacherId is required');
    if (!lessonId) throw new Error('lessonId is required');
    if (!input.data) throw new Error('data is required');

    const lessonRes = await this.db.client.from('lessons').select('*').eq('id', lessonId).limit(1);
    const lesson = Array.isArray((lessonRes as any)?.data) ? (lessonRes as any).data[0] : null;
    if (!lesson) throw new Error('Lesson not found');
    if (String(lesson.teacher_id || '') !== teacherId) throw new Error('Teacher does not own this lesson');

    const saved = this.savePdfUpload({ ...input, fileName: fileNameRaw, mimeType });
    const fileBuffer = fs.readFileSync(saved.fullPath);

    const insertedDoc = await this.db.client.from('lesson_documents').insert({
      lesson_id: lessonId,
      teacher_id: teacherId,
      file_name: saved.fileName,
      file_url: saved.relativeUrl,
      file_size_bytes: fileBuffer.length,
      mime_type: mimeType,
      extraction_status: 'in_progress'
    }).select('*');

    const doc = Array.isArray((insertedDoc as any)?.data) ? (insertedDoc as any).data[0] : null;
    if (!doc) {
      fs.unlinkSync(saved.fullPath);
      throw new Error((insertedDoc as any)?.error?.message || 'Failed to create lesson document');
    }

    let schoolId = String(input.schoolId || '').trim();
    if (!schoolId) {
      const teacherRow = await this.db.client.from('teachers').select('school_id').eq('id', teacherId).limit(1);
      schoolId = String(Array.isArray((teacherRow as any)?.data) ? (teacherRow as any).data[0]?.school_id || '' : '').trim();
    }
    if (schoolId) {
      const tracked = await this.db.client.from('school_asset_registry').insert([{
        school_id: schoolId,
        teacher_id: teacherId,
        asset_type: 'curriculum',
        file_url: saved.relativeUrl
      }]);
      if ((tracked as any)?.error) {
        await this.db.client.from('lesson_documents').delete().eq('id', doc.id);
        try { fs.unlinkSync(saved.fullPath); } catch (_cleanupError) { /* best-effort cleanup */ }
        throw new Error('Could not register the upload for permanent deletion. Please retry.');
      }
    }

    try {
      const extracted = mimeType === 'text/plain'
        ? { pages: [{ pageNumber: 1, text: this.normalizeExtractedText(fileBuffer.toString('utf8')) }], pageCount: 1 }
        : await this.extractPdfPages(fileBuffer);
      if (mimeType === 'text/plain' && !extracted.pages[0]?.text) throw new Error('Paste readable lesson content before saving.');
      const chunkRows: any[] = [];

      for (const page of extracted.pages) {
        const pageChunks = this.chunkText(page.text);
        for (let i = 0; i < pageChunks.length; i += 1) {
          const chunkText = pageChunks[i];
          const embedding = await this.embeddings.embed(chunkText, { targetDim: 384, preferSemantic: true });
          chunkRows.push({
            document_id: doc.id,
            lesson_id: lessonId,
            teacher_id: teacherId,
            chunk_text: chunkText,
            chunk_index: chunkRows.length,
            page_number: page.pageNumber,
            embedding
          });
        }
      }

      if (chunkRows.length) {
        const chunkInsert = await this.db.client.from('lesson_chunks').insert(chunkRows).select('*');
        if ((chunkInsert as any)?.error) {
          throw new Error((chunkInsert as any)?.error?.message || 'Failed to insert lesson chunks');
        }
      }

      const completed = await this.db.client.from('lesson_documents')
        .update({ extraction_status: 'completed', error_message: null, updated_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (completed.error) throw new Error(`Could not complete lesson indexing: ${completed.error.message}`);

      // Fire-and-forget: pre-build this chapter's flashcards from the freshly
      // extracted content so students never wait on the AI (and we only spend
      // tokens once per chapter). Failures here must not affect the upload.
      this.flashcards.generateForLesson(lessonId, { force: true }).catch(() => { /* best-effort */ });
      this.quizRush.generateForLesson(lessonId, { force: true }).catch(() => { /* best-effort */ });

      return {
        document: { ...doc, extraction_status: 'completed' },
        extractedTextLength: extracted.pages.reduce((sum, page) => sum + page.text.length, 0),
        pageCount: extracted.pageCount,
        chunkCount: chunkRows.length,
        fileUrl: saved.relativeUrl
      };
    } catch (error: any) {
      const message = String(error?.message || error || 'document processing failed');
      await this.db.client.from('lesson_documents')
        .update({ extraction_status: 'failed', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', doc.id);
      return {
        document: { ...doc, extraction_status: 'failed', error_message: message },
        error: message,
        fileUrl: saved.relativeUrl
      };
    }
  }

  async uploadLessonDocumentAsSchoolAdmin(input: AdminUploadInput) {
    const schoolId = String(input.schoolId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    if (!schoolId) throw new Error('schoolId is required');
    if (!lessonId) throw new Error('lessonId is required');

    const lesson = await this.assertLessonInSchool(lessonId, schoolId);
    return this.uploadLessonDocument({
      teacherId: String(lesson.teacher_id || '').trim(),
      lessonId,
      schoolId,
      fileName: input.fileName,
      data: input.data,
      mimeType: input.mimeType
    });
  }

  async saveLessonTextAsSchoolAdmin(input: { schoolId: string; lessonId: string; content: string }) {
    if (typeof input.content !== 'string' || !input.content.trim()) throw new Error('Paste the lesson content before saving.');
    if (input.content.length > 200_000) throw new Error('Pasted lesson content must be at most 200,000 characters. Split longer content into separate lessons.');
    const schoolId = String(input.schoolId || '').trim();
    const lessonId = String(input.lessonId || '').trim();
    if (!schoolId || !lessonId) throw new Error('School and lesson are required.');
    const lesson = await this.assertLessonInSchool(lessonId, schoolId);
    return this.uploadLessonDocument({
      teacherId: String(lesson.teacher_id || '').trim(), lessonId,
      schoolId,
      fileName: `${lesson.title || 'lesson-content'}.txt`, mimeType: 'text/plain',
      data: Buffer.from(input.content.trim(), 'utf8').toString('base64'),
    });
  }

  async listLessonDocuments(lessonId: string) {
    const id = String(lessonId || '').trim();
    if (!id) throw new Error('lessonId is required');
    const res = await this.db.client.from('lesson_documents').select('*').eq('lesson_id', id).order('created_at', { ascending: false });
    return { documents: Array.isArray((res as any)?.data) ? (res as any).data : [] };
  }

  async listLessonDocumentsScoped(params: { lessonId: string; role: string; actorId: string; schoolId?: string; studentClassName?: string }) {
    const lessonId = String(params.lessonId || '').trim();
    const role = String(params.role || '').toLowerCase();
    const actorId = String(params.actorId || '').trim();
    const schoolId = String(params.schoolId || '').trim();
    const studentClassName = String(params.studentClassName || '').trim();
    if (!lessonId) throw new Error('lessonId is required');

    const lesson = await this.findLessonById(lessonId);
    if (!lesson) throw new Error('Lesson not found');

    if (role.includes('teacher')) {
      if (String(lesson.teacher_id || '') !== actorId) {
        throw new Error('Teacher does not own this lesson');
      }
      return this.listLessonDocuments(lessonId);
    }

    if (role.includes('school_admin')) {
      await this.assertLessonInSchool(lessonId, schoolId);
      return this.listLessonDocuments(lessonId);
    }

    if (role.includes('student')) {
      if (!studentClassName) throw new Error('Student class not found');
      const vis = await this.db.client
        .from('lesson_class_visibility')
        .select('*')
        .eq('lesson_id', lessonId)
        .eq('class_name', studentClassName)
        .eq('is_visible', true)
        .limit(1);
      const visible = Array.isArray((vis as any)?.data) && (vis as any).data.length > 0;
      if (!visible) throw new Error('Lesson not visible for this student class');
      return this.listLessonDocuments(lessonId);
    }

    throw new Error('Curriculum access not allowed for this role');
  }
}