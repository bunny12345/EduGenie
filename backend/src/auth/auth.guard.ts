import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = typeof authHeader === 'string' ? authHeader : Array.isArray(authHeader) ? authHeader[0] : undefined;
    if (!token) throw new UnauthorizedException('Missing Authorization header');

    const payload = await this.supabase.verifyJwt(token as string);
    if (!payload) throw new UnauthorizedException('Invalid or expired token');

    // Attach user info and studentId to request for downstream handlers
    req.user = payload;
    req.actorId = payload.sub || payload.user_id || payload.id || null;
    req.actorRole = payload.role || null;
    req.studentId = payload.sub || payload.user_id || payload.id || null;
    return true;
  }
}
