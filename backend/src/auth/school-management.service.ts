import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { EmailService } from './email.service';
import { RegistrationPhoneService } from './registration-phone.service';
import { StudentAuthService } from './student-auth.service';
import { LocalFeedService } from '../shared/local-feed.service';
import { ChatService } from '../chat/chat.service';
import { jwtSecret } from './jwt-secret';

type SchoolProfile = {
  id: string;
  email: string;
  schoolName: string;
  branch: string;
  location: string;
  phone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type EmailVerification = {
  id: string;
  school_id: string;
  actor_id: string;
  email: string;
  code_hash: string;
  status: 'sending' | 'pending' | 'verified' | 'used' | 'failed';
  expires_at: string;
  attempts: number;
};

@Injectable()
export class SchoolManagementService {
  private readonly emailLimits = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly db: SupabaseService,
    private readonly email: EmailService,
    private readonly registrationPhone: RegistrationPhoneService,
    private readonly studentAuth: StudentAuthService,
    private readonly localFeed: LocalFeedService,
    private readonly chat: ChatService
  ) {}

  private limit(key: string, maximum: number, duration: number) {
    const now = Date.now();
    for (const [id, entry] of this.emailLimits) {
      if (entry.until <= now) this.emailLimits.delete(id);
    }
    const entry = this.emailLimits.get(key) || { count: 0, until: now + duration };
    if (entry.count >= maximum) {
      throw new ServiceUnavailableException('Please wait before requesting another email verification code.');
    }
    entry.count += 1;
    this.emailLimits.set(key, entry);
  }

  private normalizeEmail(value: unknown) {
    if (typeof value !== 'string') throw new BadRequestException('Enter a valid email address.');
    const email = value.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address.');
    }
    return email;
  }

  private hashEmailCode(id: string, code: string) {
    return createHmac('sha256', jwtSecret()).update(`school-profile-email:${id}:${code}`).digest('hex');
  }

  private normalizeProfileName(value: unknown) {
    const result = String(value || '').trim();
    if (!result) throw new BadRequestException('School name is required.');
    if (result.length > 160) throw new BadRequestException('School name is too long.');
    return result;
  }

  private normalizeOptionalProfile(value: unknown, label: string, maximum = 160) {
    const result = String(value ?? '').trim();
    if (result.length > maximum) throw new BadRequestException(`${label} is too long.`);
    return result;
  }

  private async querySchoolById(schoolId: string) {
    if (!schoolId) return null;
    try {
      const result: any = await this.db.client.from('schools').select('*').eq('id', schoolId).limit(1);
      if (result?.error) throw new Error(result.error.message || 'School lookup failed');
      return Array.isArray(result?.data) ? result.data[0] || null : null;
    } catch (error) {
      if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
        throw new ServiceUnavailableException('Could not verify the school. Please retry.');
      }
      return null;
    }
  }

  async assertSchoolExists(schoolIdRaw: string) {
    const schoolId = String(schoolIdRaw || '').trim();
    if (!schoolId) throw new BadRequestException('School id is required.');
    const row = await this.querySchoolById(schoolId);
    const local = this.studentAuth.listLocalSchools().find((school: any) => String(school.id) === schoolId);
    if (!row && !local) throw new BadRequestException('School not found.');
    return { row, local };
  }

  private mapSchool(row: any): SchoolProfile {
    return {
      id: String(row.id),
      email: String(row.email || ''),
      schoolName: String(row.school_name || row.schoolName || ''),
      branch: String(row.branch || ''),
      location: String(row.location || ''),
      phone: row.phone === undefined || row.phone === null ? null : String(row.phone),
      createdAt: row.created_at || row.createdAt || null,
      updatedAt: row.updated_at || row.updatedAt || null
    };
  }

  async listSchools() {
    let rows: any[] = [];
    try {
      const result: any = await this.db.client.from('schools').select('*').order('created_at', { ascending: false });
      if (result?.error) throw new Error(result.error.message || 'Could not list schools');
      rows = Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
      if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
        throw new ServiceUnavailableException('Could not list registered schools. Please retry.');
      }
    }

    const byId = new Map<string, SchoolProfile>();
    for (const row of rows) byId.set(String(row.id), this.mapSchool(row));
    for (const local of this.studentAuth.listLocalSchools()) {
      if (!byId.has(String(local.id))) {
        byId.set(String(local.id), {
          id: String(local.id),
          email: String(local.email || ''),
          schoolName: String(local.schoolName || ''),
          branch: String(local.branch || ''),
          location: String(local.location || ''),
          phone: local.phone ? String(local.phone) : null,
          createdAt: local.createdAt,
          updatedAt: local.updatedAt
        });
      }
    }

    const schools = Array.from(byId.values()).sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0;
      const right = b.createdAt ? Date.parse(b.createdAt) : 0;
      return right - left;
    });

    const enriched = await Promise.all(schools.map(async (school) => {
      let teacherCount = 0;
      let studentCount = 0;
      try {
        const teacherResult: any = await this.db.client
          .from('teachers')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', school.id);
        if (!teacherResult?.error) teacherCount = Number(teacherResult?.count || 0);
        const studentResult: any = await this.db.client
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', school.id);
        if (!studentResult?.error) studentCount = Number(studentResult?.count || 0);
      } catch (_error) {
        // Counts are informational; profile listing must remain usable.
      }
      return { ...school, teacherCount, studentCount };
    }));

    return { success: true, schools: enriched };
  }

  async requestEmailVerification(schoolIdRaw: string, ownerId: string, emailRaw: unknown) {
    const schoolId = String(schoolIdRaw || '').trim();
    await this.assertSchoolExists(schoolId);
    const email = this.normalizeEmail(emailRaw);

    const current = await this.querySchoolById(schoolId);
    if (current && String(current.email || '').trim().toLowerCase() === email) {
      throw new BadRequestException('This email is already the school email.');
    }

    try {
      const duplicate: any = await this.db.client.from('schools').select('id').eq('email', email).limit(1);
      if (duplicate?.error) throw new Error(duplicate.error.message || 'Duplicate check failed');
      const found = Array.isArray(duplicate?.data) ? duplicate.data.find((row: any) => String(row.id) !== schoolId) : null;
      if (found) throw new BadRequestException('This email is already registered to another school.');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
        throw new ServiceUnavailableException('Could not verify that the email is available.');
      }
    }

    if (!this.email.isConfigured()) {
      throw new ServiceUnavailableException('Email verification is not configured. Please contact the site operator.');
    }

    this.limit(`school:${schoolId}:owner:${ownerId}`, 10, 10 * 60000);
    this.limit(`school-email:${email}`, 3, 10 * 60000);

    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    try {
      const insert: any = await this.db.client.from('school_profile_email_verifications').insert([{
        id,
        school_id: schoolId,
        actor_id: ownerId,
        email,
        code_hash: this.hashEmailCode(id, code),
        status: 'sending',
        expires_at: expiresAt,
        attempts: 0
      }]).select('id');
      if (insert?.error) throw new Error(insert.error.message || 'Verification storage failed');
    } catch (_error) {
      throw new ServiceUnavailableException('Unable to save the email verification. Please try again.');
    }

    const text = `Your AcademiX school profile email update code is ${code}. It expires in 10 minutes.`;
    let delivery: { ok: boolean; error?: string };
    try {
      delivery = await this.email.sendMail(
        email,
        'Your AcademiX school profile verification code',
        `<p>${text}</p>`,
        text
      );
    } catch (_error) {
      await this.db.client.from('school_profile_email_verifications').update({ status: 'failed' }).eq('id', id);
      throw new ServiceUnavailableException('Could not send the verification email. Please try again.');
    }
    if (!delivery.ok) {
      await this.db.client.from('school_profile_email_verifications').update({ status: 'failed' }).eq('id', id);
      throw new ServiceUnavailableException(delivery.error || 'Could not send the verification email. Please try again.');
    }
    const pending: any = await this.db.client
      .from('school_profile_email_verifications')
      .update({ status: 'pending' })
      .eq('id', id)
      .eq('status', 'sending')
      .select('*');
    if (pending?.error || !Array.isArray(pending?.data) || !pending.data.length) {
      throw new ServiceUnavailableException('Unable to confirm the verification email. Please request a new code.');
    }
    return { success: true, challengeId: id, expiresAt, resendAfter: 60 };
  }

  async verifyEmailVerification(
    schoolIdRaw: string,
    ownerId: string,
    emailRaw: unknown,
    challengeIdRaw: unknown,
    codeRaw: unknown
  ) {
    const schoolId = String(schoolIdRaw || '').trim();
    const email = this.normalizeEmail(emailRaw);
    const challengeId = String(challengeIdRaw || '').trim();
    const code = String(codeRaw || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)
      || !/^\d{6}$/.test(code)) {
      throw new BadRequestException('Enter the six-digit email verification code.');
    }

    this.limit(`school-verify:${schoolId}:${ownerId}`, 30, 10 * 60000);
    let rows: EmailVerification[] = [];
    try {
      const result: any = await this.db.client
        .from('school_profile_email_verifications')
        .select('*')
        .eq('id', challengeId)
        .eq('school_id', schoolId)
        .eq('actor_id', ownerId)
        .eq('email', email)
        .limit(1);
      if (result?.error) throw new Error(result.error.message || 'Verification lookup failed');
      rows = Array.isArray(result?.data) ? result.data : [];
    } catch (_error) {
      throw new ServiceUnavailableException('Unable to verify the email code. Please try again.');
    }
    const row = rows[0];
    if (!row || row.status !== 'pending'
      || Date.parse(row.expires_at) <= Date.now()
      || row.attempts >= 5) {
      throw new BadRequestException('This verification has expired, is used or has too many attempts.');
    }

    const claimed: any = await this.db.client
      .from('school_profile_email_verifications')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('attempts', row.attempts)
      .select('*');
    if (claimed?.error || !Array.isArray(claimed?.data) || !claimed.data.length) {
      throw new BadRequestException('Another verification request is in progress. Please try again.');
    }
    const hash = this.hashEmailCode(row.id, code);
    if (row.code_hash.length !== hash.length
      || !timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash))) {
      throw new BadRequestException('Incorrect email verification code.');
    }
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    const verified: any = await this.db.client
      .from('school_profile_email_verifications')
      .update({ status: 'verified', expires_at: expiresAt })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('attempts', row.attempts + 1)
      .select('*');
    if (verified?.error || !Array.isArray(verified?.data) || !verified.data.length) {
      throw new BadRequestException('This verification changed. Please verify again.');
    }
    return { success: true, verificationId: row.id, email, expiresAt };
  }

  private async consumeEmailVerification(
    schoolId: string,
    ownerId: string,
    email: string,
    verificationIdRaw: unknown
  ) {
    const verificationId = String(verificationIdRaw || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(verificationId)) {
      throw new BadRequestException('Verify the new email address before saving.');
    }
    const result: any = await this.db.client
      .from('school_profile_email_verifications')
      .update({ status: 'used' })
      .eq('id', verificationId)
      .eq('school_id', schoolId)
      .eq('actor_id', ownerId)
      .eq('email', email)
      .eq('status', 'verified')
      .gte('expires_at', new Date(Date.now() + 1).toISOString())
      .select('*');
    if (result?.error || !Array.isArray(result?.data) || !result.data.length) {
      throw new BadRequestException('Email verification is missing, expired or used. Verify this address again.');
    }
  }

  private async restoreEmailVerification(
    schoolId: string,
    ownerId: string,
    email: string,
    verificationIdRaw: unknown
  ) {
    const verificationId = String(verificationIdRaw || '').trim();
    await this.db.client
      .from('school_profile_email_verifications')
      .update({ status: 'verified' })
      .eq('id', verificationId)
      .eq('school_id', schoolId)
      .eq('actor_id', ownerId)
      .eq('email', email)
      .eq('status', 'used')
      .gte('expires_at', new Date(Date.now() + 1).toISOString())
      .select('*');
  }

  async updateSchool(
    schoolIdRaw: string,
    ownerId: string,
    body: {
      schoolName?: unknown;
      branch?: unknown;
      location?: unknown;
      email?: unknown;
      phone?: unknown;
      country?: unknown;
      emailVerificationId?: unknown;
      phoneVerificationId?: unknown;
    }
  ) {
    const schoolId = String(schoolIdRaw || '').trim();
    const { row, local } = await this.assertSchoolExists(schoolId);
    const existing = row ? this.mapSchool(row) : local ? {
      id: String(local.id),
      email: String(local.email || ''),
      schoolName: String(local.schoolName || ''),
      branch: String(local.branch || ''),
      location: String(local.location || ''),
      phone: local.phone ? String(local.phone) : null,
      createdAt: null,
      updatedAt: null
    } : null;
    if (!existing) throw new BadRequestException('School not found.');

    const schoolName = body.schoolName === undefined
      ? existing.schoolName
      : this.normalizeProfileName(body.schoolName);
    const branch = body.branch === undefined
      ? existing.branch
      : this.normalizeOptionalProfile(body.branch, 'Branch');
    const location = body.location === undefined
      ? existing.location
      : this.normalizeOptionalProfile(body.location, 'Location');
    if (!branch) throw new BadRequestException('Branch is required.');
    if (!location) throw new BadRequestException('Location is required.');

    const emailChanged = body.email !== undefined
      && this.normalizeEmail(body.email) !== String(existing.email || '').trim().toLowerCase();
    const email = emailChanged ? this.normalizeEmail(body.email) : existing.email;

    let phoneChanged = false;
    let normalizedPhone: string | null = existing.phone;
    let consumedPhone = false;
    let consumedEmail = false;
    const scope = { schoolId, actorId: ownerId };

    if (body.phone !== undefined) {
      if (body.phone === null || (typeof body.phone === 'string' && !body.phone.trim())) {
        phoneChanged = !!String(existing.phone || '').trim();
        normalizedPhone = null;
      } else {
        const phoneInput = this.registrationPhone.normalize(scope, 'school', {
          role: 'school',
          country: body.country || 'IN',
          phone: body.phone
        });
        phoneChanged = phoneInput !== String(existing.phone || '').trim();
        normalizedPhone = phoneChanged ? phoneInput : existing.phone;
      }
    }

    if (emailChanged) {
      await this.consumeEmailVerification(schoolId, ownerId, email, body.emailVerificationId);
      consumedEmail = true;
    }

    if (phoneChanged) {
      await this.registrationPhone.consume(scope, 'school', {
        role: 'school',
        country: String(body.country || 'IN'),
        phone: normalizedPhone,
        phoneVerificationId: body.phoneVerificationId
      });
      consumedPhone = true;
    }

    try {
      const result = await this.studentAuth.updateSchoolProfileByOwner(schoolId, {
        email,
        schoolName,
        branch,
        location,
        phone: normalizedPhone
      });
      if (!result.ok) throw new BadRequestException((result as { ok: false; error: string }).error);
    } catch (error) {
      if (consumedPhone) {
        await this.registrationPhone.restoreAfterConflict(scope, 'school', {
          role: 'school',
          country: String(body.country || 'IN'),
          phone: normalizedPhone,
          phoneVerificationId: body.phoneVerificationId
        });
      }
      if (consumedEmail) {
        await this.restoreEmailVerification(schoolId, ownerId, email, body.emailVerificationId);
      }
      throw error;
    }

    const updated = await this.querySchoolById(schoolId);
    const localUpdated = this.studentAuth.listLocalSchools().find((school: any) => String(school.id) === schoolId);
    return {
      success: true,
      school: updated
        ? this.mapSchool(updated)
        : localUpdated
          ? this.mapSchool({
            id: localUpdated.id,
            email: localUpdated.email,
            school_name: localUpdated.schoolName,
            branch: localUpdated.branch,
            location: localUpdated.location,
            phone: localUpdated.phone
          })
          : { id: schoolId, email, schoolName, branch, location, phone: normalizedPhone }
    };
  }

  private extractFileUrls(value: unknown, found: Set<string>) {
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return;
      const candidates = text.match(/(?:https?:\/\/[^\s"'<>]+|\/uploads\/[^\s"'<>]+)/gi) || [text];
      for (const candidate of candidates) {
        if (candidate.includes('/uploads/')) found.add(candidate);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) this.extractFileUrls(item, found);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) this.extractFileUrls(item, found);
    }
  }

  private collectRowFileUrls(rows: any[]) {
    const urls = new Set<string>();
    for (const row of rows) this.extractFileUrls(row, urls);
    return urls;
  }

  private async selectRows(table: string, schoolId: string, studentIds: string[], teacherIds: string[]) {
    const all: any[] = [];
    try {
      if (studentIds.length) {
        const studentResult: any = await this.db.client.from(table).select('*').in('student_id', studentIds);
        if (!studentResult?.error && Array.isArray(studentResult?.data)) all.push(...studentResult.data);
      }
      if (teacherIds.length) {
        const teacherResult: any = await this.db.client.from(table).select('*').in('teacher_id', teacherIds);
        if (!teacherResult?.error && Array.isArray(teacherResult?.data)) all.push(...teacherResult.data);
      }
      const schoolResult: any = await this.db.client.from(table).select('*').eq('school_id', schoolId);
      if (!schoolResult?.error && Array.isArray(schoolResult?.data)) all.push(...schoolResult.data);
    } catch (_error) {
      // Some optional tables may not exist in an older deployment.
    }
    return all;
  }

  private removeLocalFile(url: string) {
    let pathname = url;
    try {
      if (/^https?:\/\//i.test(url)) pathname = new URL(url).pathname;
    } catch (_error) {
      return;
    }
    const index = pathname.indexOf('/uploads/');
    if (index < 0) return;
    const relative = pathname.slice(index + '/uploads/'.length);
    const uploadsRoot = path.resolve(process.cwd(), 'local-data', 'uploads');
    const fullPath = path.resolve(uploadsRoot, relative);
    if (fullPath !== uploadsRoot && !fullPath.startsWith(`${uploadsRoot}${path.sep}`)) return;
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (error) {
      throw new ServiceUnavailableException(`Could not remove local upload ${relative}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private async deleteInMock(schoolId: string, studentIds: string[], teacherIds: string[], testIds: string[], examIds: string[]) {
    const directTables = [
      'school_asset_registry', 'school_profile_email_verifications',
      'school_registration_phone_verifications', 'registration_email_verifications',
      'registration_phone_verifications', 'registration_invites',
      'school_progress_periods', 'orchard_school_tree_assignments',
      'support_tickets', 'tests', 'report_exams',
      'strict_exam_sessions', 'student_push_devices', 'class_attendance',
      'announcements'
    ];
    for (const table of directTables) {
      try { await this.db.client.from(table).delete().eq('school_id', schoolId); } catch (_error) { /* optional table */ }
    }

    const studentTables = [
      'orchard_reviews', 'chapter_growth', 'orchard_activity', 'orchard_trees', 'orchard_profile',
      'student_lesson_progress', 'lesson_story_progress', 'messages', 'conversation_snapshots', 'memories',
      'homework_attempts', 'homework', 'test_attempts', 'progress_metrics', 'student_rewards',
      'redemptions', 'settings', 'flashcard_progress', 'flashcard_chapter_completions',
      'game_sessions', 'events', 'student_accounts', 'report_exam_marks', 'report_exam_celebrations'
    ];
    for (const table of studentTables) {
      for (const studentId of studentIds) {
        try { await this.db.client.from(table).delete().eq('student_id', studentId); } catch (_error) { /* optional table */ }
      }
    }
    for (const table of ['lesson_chunks', 'lesson_documents', 'lesson_class_visibility', 'lessons']) {
      for (const teacherId of teacherIds) {
        try { await this.db.client.from(table).delete().eq('teacher_id', teacherId); } catch (_error) { /* optional table */ }
      }
    }
    for (const testId of testIds) {
      for (const table of ['strict_test_settings', 'test_questions', 'test_attempts']) {
        try { await this.db.client.from(table).delete().eq('test_id', testId); } catch (_error) { /* optional table */ }
      }
    }
    for (const examId of examIds) {
      for (const table of ['report_exam_marks', 'report_exam_celebrations']) {
        try { await this.db.client.from(table).delete().eq('exam_id', examId); } catch (_error) { /* optional table */ }
      }
    }
    for (const studentId of studentIds) {
      try { await this.db.client.from('students').delete().eq('id', studentId); } catch (_error) { /* optional table */ }
      try { await this.db.client.from('student_push_devices').delete().eq('student_id', studentId); } catch (_error) { /* optional table */ }
      try { await this.db.client.from('class_attendance').delete().eq('student_id', studentId); } catch (_error) { /* optional table */ }
    }
    for (const teacherId of teacherIds) {
      try { await this.db.client.from('teachers').delete().eq('id', teacherId); } catch (_error) { /* optional table */ }
    }
    try { await this.db.client.from('schools').delete().eq('id', schoolId); } catch (_error) { /* mock fallback */ }
  }

  async deleteSchool(schoolIdRaw: string, ownerId: string, confirmationRaw: unknown) {
    const schoolId = String(schoolIdRaw || '').trim();
    const confirmation = String(confirmationRaw || '').trim();
    await this.assertSchoolExists(schoolId);
    const schoolRow = await this.querySchoolById(schoolId);
    const localSchool = this.studentAuth.listLocalSchools().find((school: any) => String(school.id) === schoolId);
    const schoolName = String(schoolRow?.school_name || localSchool?.schoolName || '').trim();
    const requiredPhrase = `delete ${schoolName} permanently`;
    if (!schoolName || confirmation !== requiredPhrase) {
      throw new BadRequestException(`Type "${requiredPhrase}" exactly to confirm.`);
    }

    const studentResult: any = await this.db.client.from('students').select('id').eq('school_id', schoolId);
    const studentIds = Array.isArray(studentResult?.data)
      ? studentResult.data.map((row: any) => String(row.id)).filter(Boolean)
      : [];
    const teacherResult: any = await this.db.client.from('teachers').select('id').eq('school_id', schoolId);
    const teacherIds = Array.isArray(teacherResult?.data)
      ? teacherResult.data.map((row: any) => String(row.id)).filter(Boolean)
      : [];
    const testResult: any = await this.db.client.from('tests').select('id').eq('school_id', schoolId);
    const testIds = Array.isArray(testResult?.data)
      ? testResult.data.map((row: any) => String(row.id)).filter(Boolean)
      : [];
    const examResult: any = await this.db.client.from('report_exams').select('id').eq('school_id', schoolId);
    const examIds = Array.isArray(examResult?.data)
      ? examResult.data.map((row: any) => String(row.id)).filter(Boolean)
      : [];

    const localOnly = this.studentAuth.listLocalSchools().find((school: any) => String(school.id) === schoolId);
    void ownerId;
    void localOnly;

    const fileRows: any[] = [];
    for (const table of ['school_asset_registry', 'homework', 'homework_attempts', 'lesson_documents']) {
      fileRows.push(...await this.selectRows(table, schoolId, studentIds, teacherIds));
    }
    const fileUrls = this.collectRowFileUrls(fileRows);
    const removedFiles: string[] = [];
    for (const url of fileUrls) {
      try {
        this.removeLocalFile(url);
        removedFiles.push(url);
      } catch (error) {
        throw new ServiceUnavailableException(`Local file cleanup failed before school deletion: ${error instanceof Error ? error.message : 'unknown error'}. No database data was deleted.`);
      }
    }

    if ((this.db.client as any)?.isMock) {
      await this.deleteInMock(schoolId, studentIds, teacherIds, testIds, examIds);
    } else {
      const result: any = await this.db.client.rpc('owner_delete_school', {
        p_school_id: schoolId,
        p_confirmation: confirmation,
        p_student_ids: studentIds,
        p_teacher_ids: teacherIds
      });
      if (result?.error) {
        if (/not found|schema cache|function/i.test(String(result.error.message || ''))) {
          throw new ServiceUnavailableException('The permanent school-delete function is not deployed. No data was deleted.');
        }
        throw new ServiceUnavailableException(`School deletion could not be completed: ${result.error.message || 'unknown database error'}`);
      }
      if (!result?.data) throw new ServiceUnavailableException('The database did not confirm the school deletion.');
    }

    const verify: any = await this.db.client.from('schools').select('id').eq('id', schoolId).limit(1);
    if (verify?.error) throw new ServiceUnavailableException('Deletion succeeded, but the school could not be verified. Do not retry without reviewing Supabase.');
    if (Array.isArray(verify?.data) && verify.data.length) {
      throw new ServiceUnavailableException('Deletion verification failed: the school record is still present.');
    }

    const localCleanup = this.studentAuth.purgeSchoolLocalAccounts(schoolId);
    const mergedStudentIds = Array.from(new Set([...studentIds, ...localCleanup.studentIds]));
    const mergedTeacherIds = Array.from(new Set([...teacherIds, ...localCleanup.teacherIds]));
    const localFeedCleanup = this.localFeed.purgeSchoolData(schoolId, mergedStudentIds, mergedTeacherIds);
    const chatCleanup = this.chat.purgeSchoolData(mergedStudentIds);

    try {
      await this.db.client.from('school_asset_registry').delete().eq('school_id', schoolId);
    } catch (error) {
      throw new ServiceUnavailableException(`School database cleanup completed, but asset cleanup verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    try {
      const remaining: any = await this.db.client
        .from('school_asset_registry')
        .select('id')
        .eq('school_id', schoolId)
        .limit(1);
      if (remaining?.error) {
        throw new Error(remaining.error.message || 'Asset cleanup verification failed');
      }
      if (Array.isArray(remaining?.data) && remaining.data.length) {
        throw new Error('Asset registry rows remain for the deleted school');
      }
    } catch (error) {
      throw new ServiceUnavailableException(`School database cleanup completed, but asset cleanup verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    return {
      success: true,
      schoolDeleted: true,
      deletedTeacherCount: mergedTeacherIds.length,
      deletedStudentCount: mergedStudentIds.length,
      deletedTestCount: testIds.length,
      deletedExamCount: examIds.length,
      removedLocalFiles: removedFiles.length,
      localFeedCleanup,
      chatCleanup,
      legacyUploadReviewRequired: fileUrls.size > 0,
      backupRetentionDays: 7
    };
  }
}
