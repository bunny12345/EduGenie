import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { ExamControlService } from '../exams/exam-control.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService, private readonly exams: ExamControlService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = typeof authHeader === 'string' ? authHeader : Array.isArray(authHeader) ? authHeader[0] : undefined;
    if (!token) throw new UnauthorizedException('Missing Authorization header');

    const payload = await this.supabase.verifyJwt(token as string);
    if (!payload || typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!(this.supabase.client as any)?.isMock) {
      const role = String(payload.role || '');
      const schoolId = String((payload as any).schoolId || '');
      if (role === 'school_admin') {
        const id = schoolId || String(payload.sub || '');
        const result: any = await this.supabase.client.from('schools').select('id').eq('id', id).limit(1);
        if (result?.error || !Array.isArray(result?.data) || !result.data.length) {
          throw new UnauthorizedException('This school account is no longer active.');
        }
      } else if (role === 'teacher') {
        const teacherId = String(payload.sub || '');
        const result: any = await this.supabase.client.from('teachers').select('id').eq('id', teacherId).limit(1);
        if (result?.error || !Array.isArray(result?.data) || !result.data.length) {
          throw new UnauthorizedException('This teacher account is no longer active.');
        }
        if (schoolId) {
          const row = result.data[0];
          void row;
          const scoped: any = await this.supabase.client.from('teachers').select('id').eq('id', teacherId).eq('school_id', schoolId).limit(1);
          if (scoped?.error || !Array.isArray(scoped?.data) || !scoped.data.length) {
            throw new UnauthorizedException('This teacher account is no longer active for this school.');
          }
        }
      } else if (role === 'student') {
        const studentId = String(payload.sub || '');
        const result: any = await this.supabase.client.from('students').select('id').eq('id', studentId).limit(1);
        if (result?.error || !Array.isArray(result?.data) || !result.data.length) {
          throw new UnauthorizedException('This student account is no longer active.');
        }
      }
    }

    // Attach user info and studentId to request for downstream handlers
    req.user = payload;
    req.actorId = payload.sub || payload.user_id || payload.id || null;
    req.actorRole = payload.role || null;
    req.studentId = payload.sub || payload.user_id || payload.id || null;
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (payload.role === 'student' && /^\/(?:chat|games)(?:\/|$)/.test(path) && !/^\/chat\/student\/?$/.test(path)) {
      await this.exams.assertTutorAccess(payload.sub);
    }
    return true;
  }
}
