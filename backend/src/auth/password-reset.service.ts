import { BadRequestException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { EmailService } from './email.service';
import { jwtSecret } from './jwt-secret';
import { RegistrationPhoneService } from './registration-phone.service';
import { PasswordResetAccount, StudentAuthService, passwordPolicyError } from './student-auth.service';

type Role = 'teacher' | 'student' | 'school';
type Channel = 'email' | 'phone';
type Challenge = {
  id: string; role: Role; loginId: string; accountId: string; channel: Channel;
  destination: string; codeHash?: string; expiresAt: number; attempts: number;
};

const TTL = 10 * 60000;
const MAX_ATTEMPTS = 5;
const EMAIL_CHALLENGE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SMS_CHALLENGE = /^VE[a-f0-9]{32}$/i;

function mask(channel: Channel, value: string) {
  if (channel === 'phone') return `${value.slice(0, Math.min(4, value.length - 4))}${'•'.repeat(Math.max(value.length - 6, 2))}${value.slice(-2)}`;
  const [name, domain] = value.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

/**
 * Self-service "forgot password" for teachers and students. The user proves
 * control of the email or mobile number registered on their account with a
 * one-time code, then sets a new password that meets the policy and differs
 * from the current one. Challenges live in memory for 10 minutes.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly challenges = new Map<string, Challenge>();
  private readonly limits = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly accounts: StudentAuthService,
    private readonly sms: RegistrationPhoneService,
    private readonly email: EmailService
  ) {}

  private limit(key: string, maximum: number, duration: number) {
    const now = Date.now();
    for (const [id, entry] of this.limits) if (entry.until <= now) this.limits.delete(id);
    const entry = this.limits.get(key) || { count: 0, until: now + duration };
    if (entry.count >= maximum) throw new HttpException('Too many attempts. Please wait a few minutes and try again.', 429);
    entry.count += 1;
    this.limits.set(key, entry);
  }

  private prune() {
    const now = Date.now();
    for (const [id, challenge] of this.challenges) if (challenge.expiresAt <= now) this.challenges.delete(id);
  }

  private hash(id: string, code: string) {
    return createHmac('sha256', jwtSecret()).update(`password-reset:${id}:${code}`).digest('hex');
  }

  private role(value: unknown): Role {
    if (value !== 'teacher' && value !== 'student' && value !== 'school') throw new BadRequestException('Select school, teacher or student.');
    return value;
  }

  private async account(role: Role, loginId: unknown) {
    const account = await this.accounts.findPasswordResetAccount(role, loginId);
    if (!account) {
      throw new NotFoundException(role === 'school'
        ? 'No school account was found with that email address.'
        : `No ${role} account was found with that login ID.`);
    }
    return account;
  }

  private contact(account: PasswordResetAccount, body: any): { channel: Channel; destination: string } {
    const hasEmail = account.emails.length > 0;
    const hasPhone = account.phones.length > 0;
    if (!hasEmail && !hasPhone) {
      throw new BadRequestException(account.role === 'school'
        ? 'No email or mobile number is registered for this school. Please contact AcademiX support to reset your password.'
        : 'No email or mobile number is registered for this account. Please contact your school admin to reset your password.');
    }
    if (body?.channel === 'email') {
      const entered = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!hasEmail) {
        throw new BadRequestException(hasPhone
          ? 'No valid email address is registered for this account. Please verify with your registered mobile number instead.'
          : 'No valid email address is registered for this account. Please contact your school admin.');
      }
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(entered) || !account.emails.includes(entered)) {
        throw new BadRequestException(hasPhone
          ? 'This email address is not valid for this account. You can verify with your registered mobile number instead.'
          : 'This email address does not match the one registered for this account.');
      }
      return { channel: 'email', destination: entered };
    }
    if (body?.channel === 'phone') {
      if (!hasPhone) {
        throw new BadRequestException(hasEmail
          ? 'No mobile number is registered for this account. Please verify with your registered email address instead.'
          : 'No mobile number is registered for this account. Please contact your school admin.');
      }
      const country = getCountries().find((item) => item === (body.country ?? 'IN'));
      const phone = country && typeof body.phone === 'string' && body.phone.length <= 32
        ? parsePhoneNumberFromString(body.phone, { defaultCountry: country, extract: false }) : undefined;
      if (!phone?.isValid() || !account.phones.includes(phone.number)) {
        throw new BadRequestException(hasEmail
          ? 'This mobile number does not match the one registered for this account. You can verify with your registered email address instead.'
          : 'This mobile number does not match the one registered for this account.');
      }
      return { channel: 'phone', destination: phone.number };
    }
    throw new BadRequestException('Choose email or mobile number verification.');
  }

  async request(body: any, ip = 'unknown') {
    const role = this.role(body?.role);
    this.limit(`ip:${ip}`, 20, TTL);
    const account = await this.account(role, body?.loginId);
    this.limit(`account:${role}:${account.accountId}`, 6, TTL);
    const { channel, destination } = this.contact(account, body);
    this.limit(`cooldown:${role}:${account.accountId}:${destination}`, 1, 60000);
    this.limit(`destination:${destination}`, 4, TTL);
    this.prune();

    let id: string;
    let codeHash: string | undefined;
    if (channel === 'phone') {
      id = await this.sms.sendCode(destination);
      const existing = this.challenges.get(id);
      // Twilio reuses a pending verification SID for the same number (for
      // example siblings sharing a parent's phone); never hand it to another account.
      if (existing && (existing.role !== role || existing.accountId !== account.accountId)) {
        throw new BadRequestException('Another password reset is in progress for this mobile number. Please try again in 10 minutes.');
      }
    } else {
      if (!this.email.isConfigured()) {
        this.logger.error('Password reset email delivery is not configured.');
        throw new ServiceUnavailableException('Email verification is not available right now. Please verify with your mobile number instead.');
      }
      id = randomUUID();
      const code = String(randomInt(100000, 1000000));
      codeHash = this.hash(id, code);
      const text = `Your AcademiX password reset code is ${code}. It expires in 10 minutes. If you did not request a password reset, ignore this email — your password will not change.`;
      let delivery: { ok: boolean; error?: string };
      try {
        delivery = await this.email.sendMail(destination, 'Your AcademiX password reset code', `<p>${text}</p>`, text);
      } catch {
        delivery = { ok: false };
      }
      if (!delivery.ok) {
        this.logger.error('Password reset email delivery failed.');
        throw new ServiceUnavailableException('Could not send the verification email. Please try again or verify with your mobile number.');
      }
    }
    const expiresAt = Date.now() + TTL;
    this.challenges.set(id, {
      id, role, loginId: account.loginId.toLowerCase(), accountId: account.accountId, channel, destination, codeHash, expiresAt, attempts: 0
    });
    return {
      success: true, challengeId: id, channel, destination: mask(channel, destination),
      expiresAt: new Date(expiresAt).toISOString(), resendAfter: 60
    };
  }

  async reset(body: any, ip = 'unknown') {
    const role = this.role(body?.role);
    this.limit(`reset-ip:${ip}`, 40, TTL);
    const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!(EMAIL_CHALLENGE.test(challengeId) || SMS_CHALLENGE.test(challengeId)) || !/^\d{6}$/.test(code)) {
      throw new BadRequestException('Enter the six-digit verification code.');
    }
    const password = body?.newPassword;
    const policy = passwordPolicyError(password);
    if (policy) throw new BadRequestException(policy);
    if (password !== body?.confirmPassword) throw new BadRequestException('The new password and confirmation do not match.');

    this.prune();
    const loginId = String(body?.loginId || '').trim().toLowerCase();
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.role !== role || challenge.loginId !== loginId || challenge.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('This verification code has expired or has too many attempts. Please request a new code.');
    }
    const account = await this.account(role, loginId);
    const stillRegistered = challenge.channel === 'email' ? account.emails : account.phones;
    if (account.accountId !== challenge.accountId || !stillRegistered.includes(challenge.destination)) {
      this.challenges.delete(challengeId);
      throw new BadRequestException('The account contact details changed. Please request a new code.');
    }
    // Checked before the code so a rejected password does not burn the code.
    if (this.accounts.isCurrentPassword(account, password)) {
      throw new BadRequestException('The new password must be different from your current password.');
    }

    challenge.attempts += 1;
    let valid: boolean;
    if (challenge.channel === 'email') {
      const expected = this.hash(challenge.id, code);
      valid = !!challenge.codeHash && challenge.codeHash.length === expected.length
        && timingSafeEqual(Buffer.from(challenge.codeHash), Buffer.from(expected));
    } else {
      valid = await this.sms.checkCode(challenge.id, code);
    }
    if (!valid) {
      const left = MAX_ATTEMPTS - challenge.attempts;
      if (left <= 0) this.challenges.delete(challengeId);
      throw new BadRequestException(left > 0
        ? `Incorrect verification code. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Incorrect verification code. Please request a new code.');
    }
    this.challenges.delete(challengeId);
    const result = await this.accounts.applyPasswordReset(account, password);
    if (!result.ok) throw new BadRequestException(result.error || 'Could not reset the password. Please try again.');
    return { success: true, message: 'Your password has been changed. You can now log in with your new password.' };
  }
}
