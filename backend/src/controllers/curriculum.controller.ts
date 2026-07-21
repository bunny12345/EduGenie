import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurriculumService } from '../curriculum/curriculum.service';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase.service';

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
    private readonly supabase: SupabaseService
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
    const res = await this.supabase.client
      .from('students')
      .select('class_name')
      .eq('id', studentId)
      .limit(1);
    const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
    return String(row?.class_name || '').trim();
  }

  private buildPublicUrl(req: any, relativeUrl: string) {
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
    const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').trim();
    const protocol = protoHeader || (req?.protocol || 'http');
    return host ? `${protocol}://${host}${relativeUrl}` : relativeUrl;
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