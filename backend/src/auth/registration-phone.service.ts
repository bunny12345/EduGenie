import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { SupabaseService } from '../supabase.service';

type RegistrationRole = 'teacher' | 'student' | 'school';
type Scope = { schoolId: string; actorId: string; rateLimitActorId?: string };
type PhoneInput = { role?: unknown; country?: unknown; phone?: unknown };
type Verification = {
  id: string; school_id: string; actor_id: string; role: RegistrationRole;
  phone: string; country: string; status: 'pending' | 'verified' | 'used';
  expires_at: string; attempts: number;
};

@Injectable()
export class RegistrationPhoneService {
  private readonly logger = new Logger(RegistrationPhoneService.name);
  private readonly limits = new Map<string, { count: number; until: number }>();

  constructor(private readonly db: SupabaseService) {}

  private limit(key: string, maximum: number, duration: number) {
    const now = Date.now();
    for (const [id, entry] of this.limits) if (entry.until <= now) this.limits.delete(id);
    const entry = this.limits.get(key) || { count: 0, until: now + duration };
    if (entry.count >= maximum) throw new HttpException('Please wait before requesting another verification code.', 429);
    entry.count += 1;
    this.limits.set(key, entry);
  }

  private table(role: RegistrationRole) {
    return role === 'school' ? 'school_registration_phone_verifications' : 'registration_phone_verifications';
  }

  normalize(scope: Scope, role: RegistrationRole, body: PhoneInput) {
    return this.input(scope, { ...body, role }).phone;
  }

  private input(scope: Scope, body: PhoneInput): { role: RegistrationRole; country: string; phone: string } {
    if (!scope.schoolId || !scope.actorId) throw new ForbiddenException('School admin identity is required.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Select a country and enter a valid mobile number.');
    }
    const role = body.role;
    if (role !== 'teacher' && role !== 'student' && role !== 'school') throw new BadRequestException('Select a valid registration role.');
    const country = getCountries().find((item) => item === (body.country ?? 'IN'));
    if (!country || typeof body.phone !== 'string' || body.phone.length > 32) {
      throw new BadRequestException('Select a country and enter a valid mobile number.');
    }
    const phone = parsePhoneNumberFromString(body.phone, { defaultCountry: country, extract: false });
    const type = phone?.getType();
    if (!phone?.isValid() || phone.country !== country || (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE')) {
      throw new BadRequestException('Enter a valid mobile number for the selected country.');
    }
    return { role, country, phone: phone.number };
  }

  private async twilio(action: 'Verifications' | 'VerificationCheck', fields: Record<string, string>) {
    const account = process.env.TWILIO_ACCOUNT_SID;
    const secret = process.env.TWILIO_AUTH_TOKEN;
    const service = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!account || !secret || !service || !/^AC[a-f0-9]{32}$/i.test(account) || !/^VA[a-f0-9]{32}$/i.test(service)) {
      this.logger.error('Registration SMS verification is not configured.');
      throw new ServiceUnavailableException('SMS verification is not configured. Please contact your administrator.');
    }
    let response: Response;
    try {
      response = await fetch(`https://verify.twilio.com/v2/Services/${service}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${account}:${secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      this.logger.error(`SMS provider connection failed (${error instanceof Error ? error.name : 'unknown error'}).`);
      throw new ServiceUnavailableException('SMS verification is temporarily unavailable. Please try again.');
    }
    if (!response.ok) {
      this.logger.warn(`SMS provider returned HTTP ${response.status} for ${action}.`);
      if (response.status === 429) throw new HttpException('Too many SMS attempts. Please wait before trying again.', 429);
      if (action === 'VerificationCheck' && (response.status === 404 || response.status === 400)) {
        throw new BadRequestException('The code is incorrect, expired or used. Please request a new code.');
      }
      throw new ServiceUnavailableException('The SMS provider could not complete verification. Please try again later.');
    }
    let result: unknown;
    try { result = await response.json(); } catch {
      this.logger.error('SMS provider returned invalid JSON.');
      throw new ServiceUnavailableException('The SMS provider returned an invalid response. Please try again.');
    }
    if (!result || typeof result !== 'object' || !('sid' in result) || typeof result.sid !== 'string'
      || !/^VE[a-f0-9]{32}$/i.test(result.sid) || !('status' in result) || typeof result.status !== 'string') {
      this.logger.error('SMS provider returned an invalid verification response.');
      throw new ServiceUnavailableException('The SMS provider returned an invalid response. Please try again.');
    }
    return { sid: result.sid, status: result.status };
  }

  private async database<T>(operation: PromiseLike<{ data: T; error?: unknown }>): Promise<T> {
    try {
      const result = await operation;
      if (result.error) throw new Error('Verification storage rejected the operation');
      return result.data;
    } catch {
      this.logger.error('Registration phone verification storage is unavailable.');
      throw new ServiceUnavailableException('Unable to save or verify phone verification. Please try again later.');
    }
  }

  async request(scope: Scope, body: PhoneInput) {
    const input = this.input(scope, body);
    this.limit(`actor:${scope.schoolId}:${scope.rateLimitActorId || scope.actorId}`, 10, 10 * 60000);
    this.limit(`phone:${input.phone}`, 3, 10 * 60000);
    this.limit(`cooldown:${scope.schoolId}:${scope.actorId}:${input.phone}`, 1, 60000);
    const result = await this.twilio('Verifications', { To: input.phone, Channel: 'sms' });
    if (result.status !== 'pending') throw new ServiceUnavailableException('Could not send a new verification code. Please try again later.');
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    // Twilio reuses its SID when resending a pending code. Never transfer an
    // existing verification to another school, admin, phone or registration role.
    const existing = await this.database<Verification[]>(this.db.client.from(this.table(input.role))
      .select('*').eq('id', result.sid).limit(1));
    if (existing.length) {
      const row = existing[0];
      if (row.school_id !== scope.schoolId || row.actor_id !== scope.actorId || row.role !== input.role
        || row.phone !== input.phone || row.country !== input.country || row.status !== 'pending'
        || Date.parse(row.expires_at) <= Date.now()) {
        throw new BadRequestException('This number has another verification in progress. Please wait for that code to expire.');
      }
      return { success: true, challengeId: row.id, expiresAt: row.expires_at, resendAfter: 60 };
    }
    await this.database(this.db.client.from(this.table(input.role)).insert([{
      id: result.sid, school_id: scope.schoolId, actor_id: scope.actorId, ...input,
      expires_at: expiresAt, status: 'pending', attempts: 0,
    }]).select('id'));
    return { success: true, challengeId: result.sid, expiresAt, resendAfter: 60 };
  }

  async verify(scope: Scope, body: PhoneInput & { challengeId?: unknown; code?: unknown }) {
    const input = this.input(scope, body);
    if (typeof body.challengeId !== 'string' || !/^VE[a-f0-9]{32}$/i.test(body.challengeId)
      || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      throw new BadRequestException('Enter the six-digit SMS verification code.');
    }
    this.limit(`verify:${scope.schoolId}:${scope.rateLimitActorId || scope.actorId}`, 30, 10 * 60000);
    const rows = await this.database<Verification[]>(this.db.client.from(this.table(input.role))
      .select('*').eq('id', body.challengeId).eq('school_id', scope.schoolId).eq('actor_id', scope.actorId)
      .eq('role', input.role).eq('phone', input.phone).eq('country', input.country).limit(1));
    const row = rows[0];
    if (!row || row.status !== 'pending' || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5) {
      throw new BadRequestException('This verification has expired, is used or has too many attempts. Please request a new code.');
    }
    const claimed = await this.database<Verification[]>(this.db.client.from(this.table(input.role))
      .update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('status', 'pending').eq('attempts', row.attempts).select('*'));
    if (!claimed.length) throw new BadRequestException('Another verification request is in progress. Please try again.');
    const result = await this.twilio('VerificationCheck', { VerificationSid: row.id, Code: body.code });
    if (result.sid !== row.id || result.status !== 'approved') throw new BadRequestException('Incorrect verification code. Please try again.');
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    const verified = await this.database<Verification[]>(this.db.client.from(this.table(input.role))
      .update({ status: 'verified', expires_at: expiresAt }).eq('id', row.id).eq('status', 'pending').select('*'));
    if (!verified.length) throw new BadRequestException('This verification is no longer available. Please request a new code.');
    return { success: true, verificationId: row.id, phone: input.phone, expiresAt };
  }

  async consume(scope: Scope, role: RegistrationRole, body: PhoneInput & { phoneVerificationId?: unknown }) {
    const input = this.input(scope, { ...body, role });
    if (typeof body.phoneVerificationId !== 'string' || !/^VE[a-f0-9]{32}$/i.test(body.phoneVerificationId)) {
      throw new BadRequestException('Verify the mobile number by SMS before registering.');
    }
    const rows = await this.database<Verification[]>(this.db.client.from(this.table(role))
      .update({ status: 'used' }).eq('id', body.phoneVerificationId)
      .eq('school_id', scope.schoolId).eq('actor_id', scope.actorId).eq('role', role)
      .eq('phone', input.phone).eq('country', input.country).eq('status', 'verified')
      .gte('expires_at', new Date(Date.now() + 1).toISOString()).select('*'));
    if (!rows.length) throw new BadRequestException('Mobile verification is missing, expired or used. Please verify this number again.');
    return input.phone;
  }
}
