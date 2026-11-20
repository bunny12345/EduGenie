import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { SupabaseService } from '../supabase.service';
import { EmailService } from './email.service';
import { jwtSecret } from './jwt-secret';

type Scope = { schoolId: string; actorId: string; rateLimitActorId?: string };
type Role = 'teacher' | 'student';
type EmailInput = { role?: unknown; email?: unknown; accountId?: unknown };
type Verification = {
  id: string; school_id: string; actor_id: string; role: Role; email: string;
  status: string; code_hash: string; attempts: number; expires_at: string;
};
const VERIFICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RegistrationEmailService {
  private readonly logger = new Logger(RegistrationEmailService.name);
  private readonly limits = new Map<string, { count: number; until: number }>();

  constructor(private readonly db: SupabaseService, private readonly email: EmailService) {}

  normalizeEmail(value: unknown, required?: true): string;
  normalizeEmail(value: unknown, required: boolean): string | null;
  normalizeEmail(value: unknown, required = true): string | null {
    if (!required && (value === undefined || value === null || (typeof value === 'string' && !value.trim()))) return null;
    if (typeof value !== 'string' || value.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim())) {
      throw new BadRequestException('Enter a valid email address.');
    }
    return value.trim().toLowerCase();
  }

  private input(scope: Scope, body: EmailInput) {
    if (!scope.schoolId || !scope.actorId) throw new ForbiddenException('School admin identity is required.');
    if (!body || (body.role !== 'teacher' && body.role !== 'student')) {
      throw new BadRequestException('Select teacher or student registration.');
    }
    return { role: body.role, email: this.normalizeEmail(body.email) };
  }

  private limit(key: string, maximum: number, duration: number) {
    const now = Date.now();
    for (const [id, entry] of this.limits) if (entry.until <= now) this.limits.delete(id);
    const entry = this.limits.get(key) || { count: 0, until: now + duration };
    if (entry.count >= maximum) throw new HttpException('Please wait before requesting another email verification code.', 429);
    entry.count += 1;
    this.limits.set(key, entry);
  }

  private hash(id: string, code: string) {
    return createHmac('sha256', jwtSecret()).update(`registration-email:${id}:${code}`).digest('hex');
  }

  private async database<T>(operation: PromiseLike<{ data: T; error?: unknown }>): Promise<T> {
    try {
      const result = await operation;
      if (result.error) throw new Error('Verification storage rejected the operation');
      return result.data;
    } catch {
      this.logger.error('Registration email verification storage is unavailable.');
      throw new ServiceUnavailableException('Unable to save or verify email verification. Please try again later.');
    }
  }

  async request(scope: Scope, body: EmailInput) {
    const input = this.input(scope, body);
    if (!this.email.isConfigured()) {
      this.logger.error('Registration email delivery is not configured.');
      throw new ServiceUnavailableException('Email verification is not configured. Please contact your administrator.');
    }
    this.limit(`actor:${scope.schoolId}:${scope.rateLimitActorId || scope.actorId}`, 10, 10 * 60000);
    this.limit(`email:${input.email}`, 3, 10 * 60000);
    this.limit(`cooldown:${scope.schoolId}:${scope.actorId}:${input.email}`, 1, 60000);
    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    await this.database(this.db.client.from('registration_email_verifications').insert([{
      id, school_id: scope.schoolId, actor_id: scope.actorId, ...input,
      code_hash: this.hash(id, code), expires_at: expiresAt, status: 'sending', attempts: 0,
    }]).select('id'));
    const purpose = body.accountId ? 'contact update' : 'registration';
    const text = `Your AcademiX ${input.role} ${purpose} verification code is ${code}. It expires in 10 minutes. Share it only with your school's administrator if you requested this ${purpose}. Otherwise, ignore this email.`;
    let delivery: { ok: boolean; error?: string };
    try {
      delivery = await this.email.sendMail(input.email, 'Your AcademiX registration verification code', `<p>${text}</p>`, text);
    } catch {
      this.logger.error('Registration verification email delivery failed.');
      throw new ServiceUnavailableException('Could not send the verification email. Please try again later.');
    }
    if (!delivery.ok) {
      this.logger.error('Registration verification email delivery failed.');
      await this.database(this.db.client.from('registration_email_verifications').update({ status: 'failed' }).eq('id', id).select('id'));
      throw new ServiceUnavailableException(delivery.error || 'Could not send the verification email. Please try again later.');
    }
    const rows = await this.database<Verification[]>(this.db.client.from('registration_email_verifications')
      .update({ status: 'pending' }).eq('id', id).eq('status', 'sending').select('*'));
    if (!rows.length) throw new ServiceUnavailableException('Unable to confirm the verification email. Please request a new code.');
    return { success: true, challengeId: id, expiresAt, resendAfter: 60 };
  }

  async verify(scope: Scope, body: EmailInput & { challengeId?: unknown; code?: unknown }) {
    const input = this.input(scope, body);
    if (typeof body.challengeId !== 'string' || !VERIFICATION_ID.test(body.challengeId)
      || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      throw new BadRequestException('Enter the six-digit email verification code.');
    }
    this.limit(`verify:${scope.schoolId}:${scope.rateLimitActorId || scope.actorId}`, 30, 10 * 60000);
    const rows = await this.database<Verification[]>(this.db.client.from('registration_email_verifications')
      .select('*').eq('id', body.challengeId).eq('school_id', scope.schoolId).eq('actor_id', scope.actorId)
      .eq('role', input.role).eq('email', input.email).limit(1));
    const row = rows[0];
    if (!row || row.status !== 'pending' || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5) {
      throw new BadRequestException('This email verification has expired, is used or has too many attempts. Please request a new code.');
    }
    const claimed = await this.database<Verification[]>(this.db.client.from('registration_email_verifications')
      .update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('status', 'pending').eq('attempts', row.attempts)
      .gte('expires_at', new Date(Date.now() + 1).toISOString()).select('*'));
    if (!claimed.length) throw new BadRequestException('Another verification request is in progress. Please try again.');
    const hash = this.hash(row.id, body.code);
    if (row.code_hash.length !== hash.length || !timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash))) {
      throw new BadRequestException('Incorrect email verification code. Please try again.');
    }
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    const verified = await this.database<Verification[]>(this.db.client.from('registration_email_verifications')
      .update({ status: 'verified', expires_at: expiresAt }).eq('id', row.id).eq('status', 'pending')
      .eq('attempts', row.attempts + 1).gte('expires_at', new Date(Date.now() + 1).toISOString()).select('*'));
    if (!verified.length) throw new BadRequestException('This verification changed. Please try verifying again.');
    return { success: true, verificationId: row.id, email: input.email, expiresAt };
  }

  async consume(scope: Scope, role: Role, body: EmailInput & { emailVerificationId?: unknown }) {
    const input = this.input(scope, { ...body, role });
    if (typeof body.emailVerificationId !== 'string' || !VERIFICATION_ID.test(body.emailVerificationId)) {
      throw new BadRequestException('Verify the email address before registering.');
    }
    const rows = await this.database<Verification[]>(this.db.client.from('registration_email_verifications')
      .update({ status: 'used' }).eq('id', body.emailVerificationId).eq('school_id', scope.schoolId)
      .eq('actor_id', scope.actorId).eq('role', role).eq('email', input.email).eq('status', 'verified')
      .gte('expires_at', new Date(Date.now() + 1).toISOString()).select('*'));
    if (!rows.length) throw new BadRequestException('Email verification is missing, expired or used. Please verify this address again.');
    return input.email;
  }

  async restoreAfterConflict(scope: Scope, role: Role, body: EmailInput & { emailVerificationId?: unknown }) {
    const input = this.input(scope, { ...body, role });
    const rows = await this.database<Verification[]>(this.db.client.from('registration_email_verifications')
      .update({ status: 'verified' }).eq('id', body.emailVerificationId).eq('school_id', scope.schoolId)
      .eq('actor_id', scope.actorId).eq('role', role).eq('email', input.email).eq('status', 'used')
      .gte('expires_at', new Date(Date.now() + 1).toISOString()).select('*'));
    return rows.length > 0;
  }
}
