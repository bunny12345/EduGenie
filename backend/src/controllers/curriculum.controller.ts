import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurriculumService } from '../curriculum/curriculum.service';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';

function isTeacher(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'teacher' || raw.includes('teacher');
}

function isSchoolAdmin(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'school_admin' || raw.includes('school_admin');
}

function isStudent(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'student' || raw.includes('student');
}

@Controller('curriculum')
@UseGuards(AuthGuard)
export class CurriculumController {
  constructor(
    private readonly curriculum: CurriculumService,
    private readonly supabase: SupabaseService,
    private readonly studentAuth: StudentAuthService
  ) {}

  private ensureTeacher(req: any) {
    const role = req?.actorRole || req?.user?.role;
    if (!isTeacher(role)) {
      throw new ForbiddenException('Teacher access required');
    }
  }

  private teacherIdFromReq(req: any) {
    return String(req?.actorId || req?.user?.sub || req?.user?.id || '').trim();
  }

  private schoolIdFromReq(req: any) {
    return String(req?.user?.schoolId || req?.user?.school_id || req?.actorId || req?.user?.sub || '').trim();
  }

  private ensureSchoolAdmin(req: any) {
    const role = req?.actorRole || req?.user?.role;
    if (!isSchoolAdmin(role)) {
      throw new ForbiddenException('School admin access required');
    }
  }

  private async studentClassNameFromReq(req: any) {
    const studentId = String(req?.actorId || req?.studentId || req?.user?.sub || '').trim();
    if (!studentId) return '';
    // Shared resolver: DB `students` row with a local-account fallback, so a
    // newly-registered student still resolves to their real class and can see
    // the chapters the school uploaded for that grade.
    const profile = await this.studentAuth.resolveStudentProfile(studentId);
    return String(profile.className || '').trim();
  }

  private buildPublicUrl(req: any, relativeUrl: string) {
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
    const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').trim();
    const protocol = protoHeader || (req?.protocol || 'http');
    return host ? `${protocol}://${host}${relativeUrl}` : relativeUrl;
  }

  /**
   * The subject/teacher map the admin curriculum panel is built on.
   *
   * The list must match exactly what a student of that class sees in their own
   * portal, so it is assembled from the same sources the student subject nav
   * uses:
   *   1. the subjects of the teachers registered for that class;
   *   2. any subject that already has lessons filed for that class.
   *
   * There is no default baseline — a class with no registered teacher has no
   * subjects at all, in the panel and in the student portal alike.
   *
   * A lesson still has to be filed under a real teacher, so each entry carries
   * the teacher (when there is one) and a `canUpload` flag the panel uses to
   * explain what is missing instead of hiding the subject.
   */
  @Get('subjects')
  async listSubjectsForClass(@Req() req: any, @Query('className') className?: string) {
    try {
      this.ensureSchoolAdmin(req);
      const schoolId = this.schoolIdFromReq(req);
      const [{ teachers }, studentsRes, lessonPairs] = await Promise.all([
        this.studentAuth.listTeachersBySchool(schoolId),
        this.studentAuth.listStudentsByScope({ schoolId }),
        this.curriculum.classSubjectsFromLessons(schoolId)
      ]);

      type SubjectEntry = {
        subject: string;
        teacherId: string;
        teacherName: string;
        source: 'teacher' | 'lesson';
        canUpload: boolean;
      };
      const byClass = new Map<string, Map<string, SubjectEntry>>();
      const classFor = (raw: any) => {
        const cls = String(raw || '').trim();
        if (!cls) return null;
        if (!byClass.has(cls)) byClass.set(cls, new Map());
        return byClass.get(cls)!;
      };

      // (1) Every class the school knows about — from teacher assignments, from
      // enrolled students and from already-uploaded lessons. A class starts out
      // empty; only a registered teacher gives it a subject.
      const knownClasses = new Set<string>();
      for (const t of teachers || []) {
        for (const g of (t as any).grades || []) {
          const cls = String(g || '').trim();
          if (cls) knownClasses.add(cls);
        }
      }
      for (const s of (studentsRes as any)?.students || []) {
        const cls = String((s as any).className || (s as any).class_name || '').trim();
        if (cls) knownClasses.add(cls);
      }
      for (const pair of lessonPairs) knownClasses.add(pair.className);

      for (const cls of knownClasses) classFor(cls);

      // (2) Teacher-registered subjects — the only thing that makes a subject
      // exist for a class, and the only thing that makes it uploadable.
      const allSubjects: Array<{ subject: string; teacherId: string; teacherName: string; classes: string[] }> = [];
      for (const t of teachers || []) {
        const subject = String((t as any).subject || '').trim();
        if (!subject || subject.toLowerCase() === 'general') continue;
        const teacherId = String((t as any).id || '');
        const teacherName = String((t as any).name || 'Teacher');
        const classes = ((t as any).grades || []).map((g: any) => String(g || '').trim()).filter(Boolean);
        allSubjects.push({ subject, teacherId, teacherName, classes });
        for (const cls of classes) {
          const bucket = classFor(cls)!;
          const key = subject.toLowerCase();
          const existing = bucket.get(key);
          if (existing?.canUpload) continue; // first registered teacher wins
          bucket.set(key, {
            subject: existing?.subject || subject,
            teacherId,
            teacherName,
            source: 'teacher',
            canUpload: true
          });
        }
      }

      // (3) Subjects that only exist because lessons were uploaded for them
      // (e.g. the teacher was later removed) — kept so those PDFs stay reachable.
      for (const pair of lessonPairs) {
        const bucket = classFor(pair.className)!;
        const key = pair.subject.toLowerCase();
        if (bucket.has(key)) continue;
        bucket.set(key, {
          subject: pair.subject,
          teacherId: '',
          teacherName: '',
          source: 'lesson',
          canUpload: false
        });
      }

      const classes = Array.from(byClass.entries())
        .map(([cls, subjects]) => ({
          className: cls,
          subjects: Array.from(subjects.values()).sort((a, b) => a.subject.localeCompare(b.subject))
        }))
        .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

      const wanted = String(className || '').trim();
      return {
        success: true,
        classes,
        allSubjects: allSubjects.sort((a, b) => a.subject.localeCompare(b.subject)),
        className: wanted,
        subjects: wanted
          ? (classes.find((c) => c.className.toLowerCase() === wanted.toLowerCase())?.subjects || [])
          : []
      };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to list subjects') };
    }
  }

  @Post('lessons')
  async createLesson(@Req() req: any, @Body() body: any) {
    try {
      this.ensureSchoolAdmin(req);
      const result = await this.curriculum.createLessonAsSchoolAdmin({
        schoolId: this.schoolIdFromReq(req),
        teacherId: body?.teacherId,
        subject: body?.subject,
        title: body?.title,
        description: body?.description,
        className: body?.className,
        orderIndex: body?.orderIndex,
        isActive: body?.isActive,
        visibleClassNames: body?.visibleClassNames
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to create lesson') };
    }
  }

  @Patch('lessons/:lessonId')
  async updateLesson(@Req() req: any, @Param('lessonId') lessonId: string, @Body() body: any) {
    try {
      this.ensureSchoolAdmin(req);
      const result = await this.curriculum.updateLessonAsSchoolAdmin({
        schoolId: this.schoolIdFromReq(req),
        lessonId,
        title: body?.title,
        description: body?.description,
        orderIndex: body?.orderIndex
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to update lesson') };
    }
  }

  @Delete('lessons/:lessonId')
  async deleteLesson(@Req() req: any, @Param('lessonId') lessonId: string) {
    try {
      this.ensureSchoolAdmin(req);
      const result = await this.curriculum.deleteLessonAsSchoolAdmin({
        schoolId: this.schoolIdFromReq(req),
        lessonId
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to delete lesson') };
    }
  }

  @Delete('lessons/:lessonId/documents/:documentId')
  async deleteDocument(@Req() req: any, @Param('lessonId') lessonId: string, @Param('documentId') documentId: string) {
    try {
      this.ensureSchoolAdmin(req);
      const result = await this.curriculum.deleteLessonDocumentAsSchoolAdmin({
        schoolId: this.schoolIdFromReq(req),
        lessonId,
        documentId
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to delete document') };
    }
  }

  @Get('lessons')
  async listLessons(@Req() req: any, @Query('className') className?: string, @Query('subject') subject?: string, @Query('lessonId') lessonId?: string) {
    try {
      const role = String(req?.actorRole || req?.user?.role || '').toLowerCase();

      if (isSchoolAdmin(role)) {
        const result = await this.curriculum.listLessons({
          schoolId: this.schoolIdFromReq(req),
          className,
          subject,
          lessonId
        });
        return { success: true, ...result };
      }

      if (isTeacher(role)) {
        const result = await this.curriculum.listLessons({
          teacherId: this.teacherIdFromReq(req),
          className,
          subject,
          lessonId
        });
        return { success: true, ...result };
      }

      if (isStudent(role)) {
        const studentClassName = await this.studentClassNameFromReq(req);
        if (!studentClassName) {
          throw new ForbiddenException('Student class not found');
        }
        const result = await this.curriculum.listLessons({
          teacherId: undefined,
          className: studentClassName,
          subject,
          lessonId
        });
        return { success: true, ...result };
      }

      throw new ForbiddenException('Curriculum access not allowed for this role');
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to list lessons') };
    }
  }

  @Post('lessons/:lessonId/visibility')
  async setVisibility(@Req() req: any, @Param('lessonId') lessonId: string, @Body() body: any) {
    try {
      this.ensureTeacher(req);
      const result = await this.curriculum.setLessonVisibility({
        teacherId: this.teacherIdFromReq(req),
        lessonId,
        classNames: body?.classNames || body?.className || [],
        isVisible: body?.isVisible
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to update visibility') };
    }
  }

  @Post('lessons/:lessonId/documents/upload')
  async uploadDocument(@Param('lessonId') lessonId: string, @Req() req: any, @Body() body: any) {
    try {
      this.ensureSchoolAdmin(req);
      const result = await this.curriculum.uploadLessonDocumentAsSchoolAdmin({
        schoolId: this.schoolIdFromReq(req),
        lessonId,
        fileName: body?.fileName,
        data: body?.data,
        mimeType: body?.mimeType
      });
      return {
        success: true,
        ...result,
        publicFileUrl: this.buildPublicUrl(req, result.fileUrl)
      };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to upload document') };
    }
  }

  @Get('lessons/:lessonId/documents')
  async listDocuments(@Req() req: any, @Param('lessonId') lessonId: string) {
    try {
      const role = String(req?.actorRole || req?.user?.role || '').toLowerCase();
      const result = await this.curriculum.listLessonDocumentsScoped({
        lessonId,
        role,
        actorId: this.teacherIdFromReq(req),
        schoolId: this.schoolIdFromReq(req),
        studentClassName: isStudent(role) ? await this.studentClassNameFromReq(req) : undefined
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error || 'Failed to list documents') };
    }
  }
}