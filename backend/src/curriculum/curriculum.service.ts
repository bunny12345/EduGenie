import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

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
};

type AdminUploadInput = Omit<UploadInput, 'teacherId'> & {
  schoolId: string;
};

@Injectable()
export class CurriculumService {
  constructor(
    private readonly db: SupabaseService,
    private readonly embeddings: EmbeddingsService
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

    const visibleClassNames = this.normalizeClassNames(input.visibleClassNames || input.className ? [input.className] : []);
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
    return this.createLesson({
      teacherId,
      subject: input.subject,
      title: input.title,
      description: input.description,
      className: input.className,
      orderIndex: input.orderIndex,
      isActive: input.isActive,
      visibleClassNames: input.visibleClassNames
    });
  }

  async listLessons(params: { teacherId?: string; schoolId?: string; className?: string; subject?: string }) {
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
    if (params.subject) query = query.eq('subject', String(params.subject).trim());

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
    if (!doc) throw new Error((insertedDoc as any)?.error?.message || 'Failed to create lesson document');

    try {
      const extracted = await this.extractPdfPages(fileBuffer);
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

      await this.db.client.from('lesson_documents')
        .update({ extraction_status: 'completed', error_message: null, updated_at: new Date().toISOString() })
        .eq('id', doc.id);

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
      fileName: input.fileName,
      data: input.data,
      mimeType: input.mimeType
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