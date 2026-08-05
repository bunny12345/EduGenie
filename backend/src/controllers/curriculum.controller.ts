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
   * A lesson may only be filed under a subject that already has a teacher for
   * the chosen class, so the panel needs to know (a) which classes exist,
   * (b) which subjects are taught in each, and (c) who teaches them — the
   * teacher is shown back to the admin for confirmation before uploading.
   */
  @Get('subjects')
  async listSubjectsForClass(@Req() req: any, @Query('className') className?: string) {
    try {
      this.ensureSchoolAdmin(req);
      const schoolId = this.schoolIdFromReq(req);
      const { teachers } = await this.studentAuth.listTeachersBySchool(schoolId);

      const byClass = new Map<string, Array<{ subject: string; teacherId: string; teacherName: string }>>();
      for (const t of teachers || []) {
        const subject = String((t as any).subject || '').trim();
        if (!subject || subject.toLowerCase() === 'general') continue;
        for (const grade of (t as any).grades || []) {
          const cls = String(grade || '').trim();
          if (!cls) continue;
          if (!byClass.has(cls)) byClass.set(cls, []);
          const list = byClass.get(cls)!;
          if (list.some((s) => s.subject.toLowerCase() === subject.toLowerCase())) continue;
          list.push({ subject, teacherId: String((t as any).id || ''), teacherName: String((t as any).name || 'Teacher') });
        }
      }

      const classes = Array.from(byClass.entries())
        .map(([cls, subjects]) => ({
          className: cls,
          subjects: subjects.sort((a, b) => a.subject.localeCompare(b.subject))
        }))
        .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

      const wanted = String(className || '').trim();
      return {
        success: true,
        classes,
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
  async listLessons(@Req() req: any, @Query('className') className?: string, @Query('subject') subject?: string) {
    try {
      const role = String(req?.actorRole || req?.user?.role || '').toLowerCase();

      if (isSchoolAdmin(role)) {
        const result = await this.curriculum.listLessons({
          schoolId: this.schoolIdFromReq(req),
          className,
          subject
        });
        return { success: true, ...result };
      }

      if (isTeacher(role)) {
        const result = await this.curriculum.listLessons({
          teacherId: this.teacherIdFromReq(req),
          className,
          subject
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
          subject
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