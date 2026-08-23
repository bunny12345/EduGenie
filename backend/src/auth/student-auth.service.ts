import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID, createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { SupabaseService } from '../supabase.service';
import * as fs from 'fs';
import * as path from 'path';

const ACCOUNTS_DIR = path.join(process.cwd(), 'local-data');
const STUDENT_ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'student-accounts.json');
const TEACHER_ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'teacher-accounts.json');

type StudentAccount = {
  studentId: string;
  loginId: string;
  passwordSalt: string;
  passwordHash: string;
  name?: string;
  className?: string;
  teacherId?: string;
  schoolId?: string;
  gender?: string;
};

type TeacherAccount = {
  teacherId: string;
  loginId: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  name?: string;
  subject?: string;
  schoolId: string;
  grades?: string[];
};

/**
 * Normalize a list of grade selections into canonical class names.
 * Accepts inputs like 5, "5", "Class 5", "5th", "grade 5" and keeps only
 * grades 5..12, returning e.g. ["Class 5", "Class 9"] sorted ascending.
 */
export function normalizeGrades(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : input == null ? [] : [input];
  const nums = new Set<number>();
  for (const item of raw) {
    const match = String(item ?? '').match(/\d+/);
    if (!match) continue;
    const n = Number(match[0]);
    if (Number.isInteger(n) && n >= 5 && n <= 12) nums.add(n);
  }
  return Array.from(nums)
    .sort((a, b) => a - b)
    .map((n) => `Class ${n}`);
}

type SchoolAccount = {
  schoolId: string;
  email: string;
  schoolName: string;
  branch: string;
  location: string;
  passwordSalt: string;
  passwordHash: string;
};

type InviteRecord = {
  token: string;
  role: 'teacher' | 'student';
  schoolId: string;
  createdBy: string;
  teacherId?: string;
  expiresAt: number;
  consumed: boolean;
  revoked?: boolean;
  revokedAt?: number;
  revokedBy?: string;
};

@Injectable()
export class StudentAuthService implements OnModuleInit {
  private static localAccounts = new Map<string, StudentAccount>();
  private static teacherAccounts = new Map<string, TeacherAccount>();
  private static schoolAccounts = new Map<string, SchoolAccount>();
  private static invites = new Map<string, InviteRecord>();

  // Bumped on every teacher add / edit / removal. Cached, teacher-derived
  // responses (e.g. the student dashboard) key off this so a newly registered
  // subject shows up immediately instead of after the cache TTL.
  private static rosterVersionValue = 0;

  static get rosterVersion() {
    return StudentAuthService.rosterVersionValue;
  }

  private static bumpRosterVersion() {
    StudentAuthService.rosterVersionValue += 1;
  }

  constructor(private readonly db: SupabaseService) {}

  onModuleInit() {
    // Restore persisted local accounts so logins work after server restart
    try {
      if (fs.existsSync(STUDENT_ACCOUNTS_FILE)) {
        const list: StudentAccount[] = JSON.parse(fs.readFileSync(STUDENT_ACCOUNTS_FILE, 'utf8'));
        if (Array.isArray(list)) {
          list.forEach((a) => StudentAuthService.localAccounts.set(a.loginId.toLowerCase(), a));
          // eslint-disable-next-line no-console
          console.log(`[auth] Loaded ${list.length} persisted student accounts`);
        }
      }
    } catch (_e) { /* corrupt/missing file */ }
    try {
      if (fs.existsSync(TEACHER_ACCOUNTS_FILE)) {
        const list: TeacherAccount[] = JSON.parse(fs.readFileSync(TEACHER_ACCOUNTS_FILE, 'utf8'));
        if (Array.isArray(list)) {
          list.forEach((a) => StudentAuthService.teacherAccounts.set(a.loginId.toLowerCase(), a));
          // eslint-disable-next-line no-console
          console.log(`[auth] Loaded ${list.length} persisted teacher accounts`);
        }
      }
    } catch (_e) { /* corrupt/missing file */ }

    // Reconcile the local store with the database so accounts registered while
    // the DB was unavailable (or rejected by a constraint) still get their rows.
    void this.backfillLocalAccountsToDb();
  }

  private persistStudentAccounts() {
    try {
      if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
      const list = Array.from(StudentAuthService.localAccounts.values());
      fs.writeFileSync(STUDENT_ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch (_e) { /* non-fatal */ }
  }

  private persistTeacherAccounts() {
    try {
      if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
      const list = Array.from(StudentAuthService.teacherAccounts.values());
      fs.writeFileSync(TEACHER_ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch (_e) { /* non-fatal */ }
  }

  // ─── keeping the DB in step with locally-registered accounts ────────────────
  // The `students` row is what every class-scoped feature (homework, orchard,
  // curriculum, games, progress) keys off. Registration can fail to write it —
  // most often because `teacher_id` points at a teacher that only exists in the
  // local store — which would leave the student invisible to those features.
  // This guarantees the row exists, dropping only the optional columns that
  // caused the rejection.
  private async ensureStudentRowInDb(input: {
    studentId: string;
    name: string;
    className: string;
    schoolId?: string;
    teacherId?: string;
    createdBy?: string;
  }): Promise<boolean> {
    const id = String(input.studentId || '').trim();
    if (!id) return false;
    try {
      const existing = await this.db.client.from('students').select('id').eq('id', id).limit(1);
      if (Array.isArray((existing as any)?.data) && (existing as any).data.length) return true;
    } catch (_e) {
      return false;
    }

    // Try progressively simpler rows: full → without teacher_id → without
    // created_by → the bare minimum that still carries school + class.
    const candidates: Array<Record<string, any>> = [
      { id, name: input.name, class_name: input.className, school_id: input.schoolId || null, teacher_id: input.teacherId || null, created_by: input.createdBy || null },
      { id, name: input.name, class_name: input.className, school_id: input.schoolId || null, created_by: input.createdBy || null },
      { id, name: input.name, class_name: input.className, school_id: input.schoolId || null },
      { id, name: input.name, class_name: input.className },
    ];
    for (const row of candidates) {
      try {
        const res: any = await this.db.client.from('students').insert([row]);
        if (!res || !res.error) return true;
      } catch (_e) {
        /* try the next, simpler shape */
      }
    }
    // eslint-disable-next-line no-console
    console.warn(`[auth] could not persist students row for ${id}; local store remains the fallback`);
    return false;
  }

  private async ensureTeacherRowInDb(account: TeacherAccount): Promise<boolean> {
    const id = String(account.teacherId || '').trim();
    if (!id) return false;
    try {
      const existing = await this.db.client.from('teachers').select('id,grades').eq('id', id).limit(1);
      const row = Array.isArray((existing as any)?.data) ? (existing as any).data[0] : null;
      if (row) {
        // Row exists — make sure the grades it teaches are in step with the
        // local record, otherwise class rosters silently miss this teacher.
        const localGrades = normalizeGrades(account.grades);
        const dbGrades = normalizeGrades(row.grades);
        if (localGrades.length && !dbGrades.length) {
          try {
            await this.db.client.from('teachers').update({ grades: localGrades }).eq('id', id);
          } catch (_e) {
            /* grades column may not be migrated yet */
          }
        }
        return true;
      }
    } catch (_e) {
      return false;
    }
    const base: Record<string, any> = {
      id,
      school_id: account.schoolId || null,
      name: account.name || 'Teacher',
      email: account.email || null,
      subject: account.subject || 'General',
      login_id: account.loginId,
      password_salt: account.passwordSalt,
      password_hash: account.passwordHash,
      created_at: new Date().toISOString()
    };
    // Schools often reuse one contact address for several teachers, but the
    // database keeps e-mail unique per school. Login is by login_id, so fall
    // back to a per-teacher alias rather than leaving the teacher unsaved —
    // an unsaved teacher breaks lesson uploads and student assignment.
    const aliasEmail = (() => {
      const raw = String(account.email || '').trim();
      if (!raw.includes('@')) return `${account.loginId}@teachers.local`;
      const [local, domain] = raw.split('@');
      return `${local}+${account.loginId}@${domain}`;
    })();
    const grades = normalizeGrades(account.grades);
    const candidates: Array<Record<string, any>> = [
      { ...base, grades },
      base,
      { ...base, email: aliasEmail, grades },
      { ...base, email: aliasEmail },
    ];
    for (const row of candidates) {
      try {
        const res: any = await this.db.client.from('teachers').insert([row]);
        if (!res || !res.error) return true;
      } catch (_e) {
        /* try the next shape */
      }
    }
    return false;
  }

  // Push any locally-registered accounts that never made it into the database
  // into it on boot, so both long-standing and brand-new accounts behave the
  // same across every feature. Teachers go first — students reference them.
  private async backfillLocalAccountsToDb(): Promise<void> {
    try {
      for (const account of StudentAuthService.teacherAccounts.values()) {
        if (!account.schoolId) continue;
        await this.ensureTeacherRowInDb(account);
      }
      for (const account of StudentAuthService.localAccounts.values()) {
        if (!account.schoolId || !account.className) continue;
        await this.ensureStudentRowInDb({
          studentId: account.studentId,
          name: account.name || 'Student',
          className: account.className,
          schoolId: account.schoolId,
          teacherId: account.teacherId
        });
      }
    } catch (_e) {
      /* best effort — local store still backs every read path */
    }
  }

  private hashPassword(password: string, salt: string) {
    return createHash('sha256').update(`${salt}:${password}`).digest('hex');
  }

  private makeToken(studentId: string) {
    const secret = process.env.SUPABASE_JWT_SECRET || 'dev-insecure-secret';
    return jwt.sign({ sub: studentId, role: 'student' }, secret, { expiresIn: '12h' });
  }

  private makeRoleToken(sub: string, role: string, extras?: Record<string, any>) {
    const secret = process.env.SUPABASE_JWT_SECRET || 'dev-insecure-secret';
    const payload = { sub, role, ...(extras || {}) };
    return jwt.sign(payload, secret, { expiresIn: '12h' });
  }

  private remember(account: StudentAccount) {
    StudentAuthService.localAccounts.set(account.loginId.toLowerCase(), account);
    this.persistStudentAccounts();
  }

  private findLocal(loginId: string) {
    return StudentAuthService.localAccounts.get(String(loginId || '').toLowerCase()) || null;
  }

  // ─── shared student profile resolution ──────────────────────────────────────
  // Single source of truth for "who is this student" (name / class / school).
  // Merges the real `students` table with the local account store so a student
  // that only exists locally (e.g. the DB insert was rejected at registration)
  // still gets a full, correct profile everywhere in the app. Every feature that
  // needs the student's class or school must use this so new and existing
  // accounts behave identically.
  async resolveStudentProfile(studentId: string): Promise<{
    id: string;
    name: string;
    className: string;
    schoolId: string;
    teacherId: string;
  }> {
    const id = String(studentId || '').trim();
    const out = { id, name: '', className: '', schoolId: '', teacherId: '' };
    if (!id) return out;

    try {
      const res = await this.db.client.from('students').select('*').eq('id', id).limit(1);
      const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
      if (row) {
        out.name = String(row.name || '').trim();
        out.className = String(row.class_name || row.class || '').trim();
        out.schoolId = String(row.school_id || '').trim();
        out.teacherId = String(row.teacher_id || '').trim();
      }
    } catch (_e) {
      /* fall back to the local store below */
    }

    if (!out.name || !out.className || !out.schoolId) {
      for (const account of StudentAuthService.localAccounts.values()) {
        if (String(account.studentId || '').trim() !== id) continue;
        if (!out.name) out.name = String(account.name || '').trim();
        if (!out.className) out.className = String(account.className || '').trim();
        if (!out.schoolId) out.schoolId = String(account.schoolId || '').trim();
        if (!out.teacherId) out.teacherId = String(account.teacherId || '').trim();
        break;
      }
    }

    return out;
  }

  private rememberTeacher(account: TeacherAccount) {
    StudentAuthService.teacherAccounts.set(account.loginId.toLowerCase(), account);
    StudentAuthService.bumpRosterVersion();
    this.persistTeacherAccounts();
  }

  private findTeacher(loginId: string) {
    return StudentAuthService.teacherAccounts.get(String(loginId || '').toLowerCase()) || null;
  }

  private findTeacherById(teacherId: string): TeacherAccount | null {
    const id = String(teacherId || '').trim();
    if (!id) return null;
    for (const account of StudentAuthService.teacherAccounts.values()) {
      if (String(account.teacherId || '').trim() === id) return account;
    }
    return null;
  }

  private removeTeacherAccount(teacherId: string) {
    const id = String(teacherId || '').trim();
    for (const [loginId, account] of StudentAuthService.teacherAccounts.entries()) {
      if (String(account.teacherId || '').trim() === id) {
        StudentAuthService.teacherAccounts.delete(loginId);
      }
    }
    StudentAuthService.bumpRosterVersion();
    this.persistTeacherAccounts();
  }

  /**
   * Detect a duplicate subject-for-a-class conflict within a school.
   * Two teachers may not teach the same subject for the same class. Returns the
   * conflicting class name when a clash is found, otherwise null. The check runs
   * against the in-memory/persisted teacher store (which mirrors every teacher
   * registered through the app).
   */
  private findSubjectGradeConflict(
    schoolId: string,
    subject: string,
    grades: string[],
    excludeTeacherId?: string
  ): { grade: string } | null {
    const sid = String(schoolId || '').trim();
    const subj = String(subject || '').trim().toLowerCase();
    const gradeSet = new Set(normalizeGrades(grades).map((g) => g.toLowerCase()));
    const excludeId = String(excludeTeacherId || '').trim();
    if (!sid || !subj || !gradeSet.size) return null;

    for (const account of StudentAuthService.teacherAccounts.values()) {
      if (String(account.schoolId || '').trim() !== sid) continue;
      if (excludeId && String(account.teacherId || '').trim() === excludeId) continue;
      if (String(account.subject || '').trim().toLowerCase() !== subj) continue;
      for (const g of normalizeGrades(account.grades)) {
        if (gradeSet.has(g.toLowerCase())) return { grade: g };
      }
    }
    return null;
  }

  private rememberSchool(account: SchoolAccount) {
    StudentAuthService.schoolAccounts.set(account.email.toLowerCase(), account);
  }

  private findSchoolByEmail(email: string) {
    return StudentAuthService.schoolAccounts.get(String(email || '').toLowerCase()) || null;
  }

  private inviteStatus(invite: {
    consumed?: boolean;
    revoked?: boolean;
    expiresAt?: number | null;
    expires_at?: string | null;
  }): 'active' | 'used' | 'revoked' | 'expired' {
    if (invite.revoked) return 'revoked';
    if (invite.consumed) return 'used';

    let expiresAt = typeof invite.expiresAt === 'number' ? invite.expiresAt : null;
    if (!expiresAt && invite.expires_at) {
      const dt = new Date(invite.expires_at).getTime();
      expiresAt = Number.isFinite(dt) ? dt : null;
    }
    if (expiresAt && Date.now() > expiresAt) return 'expired';
    return 'active';
  }

  async registerSchool(payload: {
    email: string;
    schoolName: string;
    branch: string;
    location: string;
    password: string;
  }) {
    const email = String(payload.email || '').trim().toLowerCase();
    const schoolName = String(payload.schoolName || '').trim();
    const branch = String(payload.branch || '').trim();
    const location = String(payload.location || '').trim();
    const password = String(payload.password || '');

    if (!email || !schoolName || !branch || !location || !password) {
      return { ok: false, error: 'email, schoolName, branch, location and password are required' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters long' };
    }
    if (this.findSchoolByEmail(email)) {
      return { ok: false, error: 'School email already registered' };
    }

    const schoolId = randomUUID();
    const passwordSalt = randomBytes(12).toString('hex');
    const passwordHash = this.hashPassword(password, passwordSalt);
    const school: SchoolAccount = { schoolId, email, schoolName, branch, location, passwordSalt, passwordHash };
    this.rememberSchool(school);

    try {
      await this.db.client.from('schools').insert([
        {
          id: schoolId,
          email,
          school_name: schoolName,
          branch,
          location,
          password_salt: passwordSalt,
          password_hash: passwordHash,
          created_at: new Date().toISOString()
        }
      ]);
    } catch (e) {
      // local fallback is sufficient for dev.
    }

    const token = this.makeRoleToken(schoolId, 'school_admin', { schoolId });
    return {
      ok: true,
      token,
      school: {
        id: schoolId,
        email,
        schoolName,
        branch,
        location
      }
    };
  }

  async loginSchool(emailRaw: string, passwordRaw: string) {
    const email = String(emailRaw || '').trim().toLowerCase();
    const password = String(passwordRaw || '');
    if (!email || !password) return { ok: false, error: 'email and password are required' };

    let school = this.findSchoolByEmail(email);
    if (!school) {
      try {
        const res = await this.db.client.from('schools').select('*').eq('email', email);
        const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
        if (row) {
          school = {
            schoolId: row.id,
            email: row.email,
            schoolName: row.school_name,
            branch: row.branch,
            location: row.location,
            passwordSalt: row.password_salt,
            passwordHash: row.password_hash
          };
          this.rememberSchool(school);
        }
      } catch (e) {
        // keep fallback path.
      }
    }

    if (!school) return { ok: false, error: 'School not found' };
    if (this.hashPassword(password, school.passwordSalt) !== school.passwordHash) {
      return { ok: false, error: 'Invalid password' };
    }

    const token = this.makeRoleToken(school.schoolId, 'school_admin', { schoolId: school.schoolId });
    return {
      ok: true,
      token,
      school: {
        id: school.schoolId,
        email: school.email,
        schoolName: school.schoolName,
        branch: school.branch,
        location: school.location
      }
    };
  }

  async registerTeacherBySchool(payload: {
    schoolId: string;
    name: string;
    email: string;
    subject?: string;
    loginId: string;
    password: string;
    gender?: string;
    grades?: string[];
    createdBy?: string;
  }) {
    const schoolId = String(payload.schoolId || '').trim();
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const subject = String(payload.subject || '').trim() || 'General';
    const loginId = String(payload.loginId || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const grades = normalizeGrades(payload.grades);

    if (!schoolId || !name || !email || !loginId || !password) {
      return { ok: false, error: 'schoolId, name, email, loginId and password are required' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters long' };
    }
    if (this.findTeacher(loginId)) {
      return { ok: false, error: 'Teacher login ID already exists' };
    }
    const conflict = this.findSubjectGradeConflict(schoolId, subject, grades);
    if (conflict) {
      return { ok: false, error: `${subject} teacher already exists for ${conflict.grade}.` };
    }

    const teacherId = randomUUID();
    const passwordSalt = randomBytes(12).toString('hex');
    const passwordHash = this.hashPassword(password, passwordSalt);

    const account: TeacherAccount = {
      teacherId,
      loginId,
      email,
      passwordSalt,
      passwordHash,
      name,
      subject,
      schoolId,
      grades
    };
    this.rememberTeacher(account);

    const gender = String(payload.gender || '').trim().toLowerCase() || null;

    const baseRow = {
      id: teacherId,
      school_id: schoolId,
      name,
      email,
      subject,
      gender,
      login_id: loginId,
      password_salt: passwordSalt,
      password_hash: passwordHash,
      created_by: payload.createdBy || null,
      created_at: new Date().toISOString()
    };

    try {
      const insertRes: any = await this.db.client
        .from('teachers')
        .insert([{ ...baseRow, grades }]);
      // Supabase returns an error object (rather than throwing) when the
      // `grades` column hasn't been migrated yet — retry without it so the
      // teacher row is still persisted. Grades remain available via the local
      // account store and resolveTeacherGrades().
      if (insertRes && insertRes.error) {
        await this.db.client.from('teachers').insert([baseRow]);
      }
    } catch (e) {
      try {
        await this.db.client.from('teachers').insert([baseRow]);
      } catch (_e2) {
        // fallback only.
      }
    }
    // Confirm the row landed — students reference teachers, so a missing row
    // would block student registration for this teacher's classes.
    await this.ensureTeacherRowInDb(account);

    return {
      ok: true,
      teacher: {
        id: teacherId,
        schoolId,
        name,
        email,
        subject,
        loginId,
        grades
      }
    };
  }

  /**
   * Load a teacher by id, preferring the in-memory store and falling back to the
   * DB. Returns a normalized TeacherAccount (grades included) or null.
   */
  private async loadTeacherAccount(teacherId: string): Promise<TeacherAccount | null> {
    const local = this.findTeacherById(teacherId);
    if (local) return local;
    const id = String(teacherId || '').trim();
    if (!id) return null;
    try {
      const res = await this.db.client.from('teachers').select('*').eq('id', id);
      const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
      if (row) {
        const account: TeacherAccount = {
          teacherId: row.id,
          loginId: row.login_id,
          email: row.email,
          passwordSalt: row.password_salt,
          passwordHash: row.password_hash,
          name: row.name,
          subject: row.subject,
          schoolId: row.school_id,
          grades: normalizeGrades(row.grades)
        };
        this.rememberTeacher(account);
        return account;
      }
    } catch (_e) {
      // fallback only.
    }
    return null;
  }

  async updateTeacherBySchool(payload: {
    schoolId: string;
    teacherId: string;
    name?: string;
    email?: string;
    subject?: string;
    grades?: string[];
  }) {
    const schoolId = String(payload.schoolId || '').trim();
    const teacherId = String(payload.teacherId || '').trim();
    if (!schoolId || !teacherId) {
      return { ok: false, error: 'schoolId and teacherId are required' };
    }

    const existing = await this.loadTeacherAccount(teacherId);
    if (!existing || String(existing.schoolId || '').trim() !== schoolId) {
      return { ok: false, error: 'Teacher not found in this school' };
    }

    const name = payload.name !== undefined ? String(payload.name || '').trim() : existing.name || '';
    const email = payload.email !== undefined ? String(payload.email || '').trim().toLowerCase() : existing.email || '';
    const subject = payload.subject !== undefined
      ? (String(payload.subject || '').trim() || 'General')
      : (existing.subject || 'General');
    const grades = payload.grades !== undefined ? normalizeGrades(payload.grades) : normalizeGrades(existing.grades);

    if (!name) return { ok: false, error: 'Name is required' };

    const conflict = this.findSubjectGradeConflict(schoolId, subject, grades, teacherId);
    if (conflict) {
      return { ok: false, error: `${subject} teacher already exists for ${conflict.grade}.` };
    }

    const updated: TeacherAccount = { ...existing, name, email, subject, grades };
    this.rememberTeacher(updated);

    try {
      const res: any = await this.db.client
        .from('teachers')
        .update({ name, email, subject, grades, updated_at: new Date().toISOString() })
        .eq('id', teacherId);
      if (res && res.error) {
        await this.db.client
          .from('teachers')
          .update({ name, email, subject, updated_at: new Date().toISOString() })
          .eq('id', teacherId);
      }
    } catch (_e) {
      try {
        await this.db.client
          .from('teachers')
          .update({ name, email, subject, updated_at: new Date().toISOString() })
          .eq('id', teacherId);
      } catch (_e2) {
        // fallback only.
      }
    }

    return {
      ok: true,
      teacher: {
        id: teacherId,
        schoolId,
        name,
        email,
        subject,
        loginId: updated.loginId,
        grades
      }
    };
  }

  async resetTeacherPassword(payload: { schoolId: string; teacherId: string; password: string }) {
    const schoolId = String(payload.schoolId || '').trim();
    const teacherId = String(payload.teacherId || '').trim();
    const password = String(payload.password || '');
    if (!schoolId || !teacherId) return { ok: false, error: 'schoolId and teacherId are required' };
    if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters long' };

    const existing = await this.loadTeacherAccount(teacherId);
    if (!existing || String(existing.schoolId || '').trim() !== schoolId) {
      return { ok: false, error: 'Teacher not found in this school' };
    }

    const passwordSalt = randomBytes(12).toString('hex');
    const passwordHash = this.hashPassword(password, passwordSalt);
    this.rememberTeacher({ ...existing, passwordSalt, passwordHash });

    try {
      await this.db.client
        .from('teachers')
        .update({ password_salt: passwordSalt, password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('id', teacherId);
    } catch (_e) {
      // fallback only.
    }

    return { ok: true, teacher: { id: teacherId, loginId: existing.loginId } };
  }

  async deleteTeacherBySchool(payload: { schoolId: string; teacherId: string }) {
    const schoolId = String(payload.schoolId || '').trim();
    const teacherId = String(payload.teacherId || '').trim();
    if (!schoolId || !teacherId) return { ok: false, error: 'schoolId and teacherId are required' };

    const existing = await this.loadTeacherAccount(teacherId);
    if (!existing || String(existing.schoolId || '').trim() !== schoolId) {
      return { ok: false, error: 'Teacher not found in this school' };
    }

    this.removeTeacherAccount(teacherId);

    try {
      // Unlink students so we never leave dangling teacher references.
      await this.db.client.from('students').update({ teacher_id: null }).eq('teacher_id', teacherId);
      await this.db.client.from('teachers').delete().eq('id', teacherId);
    } catch (_e) {
      // fallback only.
    }

    return { ok: true, teacher: { id: teacherId } };
  }

  /**
   * Remove duplicate subject+class combinations within a school.
   * Keeps the first teacher registered for each subject+class pair and deletes the rest.
   */
  async deduplicateTeacherSubjects(schoolId: string) {
    const sid = String(schoolId || '').trim();
    if (!sid) return { removed: 0 };

    const seen = new Map<string, string>(); // key = "subject|grade" → first teacherId
    const toRemove: string[] = [];

    for (const account of StudentAuthService.teacherAccounts.values()) {
      if (String(account.schoolId || '').trim() !== sid) continue;
      const subj = String(account.subject || '').trim().toLowerCase();
      const grades = normalizeGrades(account.grades);
      for (const g of grades) {
        const key = `${subj}|${g.toLowerCase()}`;
        if (seen.has(key)) {
          toRemove.push(account.teacherId);
          break;
        } else {
          seen.set(key, account.teacherId);
        }
      }
    }

    for (const teacherId of toRemove) {
      this.removeTeacherAccount(teacherId);
      try {
        await this.db.client.from('students').update({ teacher_id: null }).eq('teacher_id', teacherId);
        await this.db.client.from('teachers').delete().eq('id', teacherId);
      } catch (_e) { /* non-fatal */ }
    }

    return { removed: toRemove.length };
  }

  /**
   * List the teachers (with their subjects) responsible for a given class in a
   * school. Used by the student portal so a student can see which teacher takes
   * each subject for their class. Merges in-memory accounts with DB rows.
   */
  async listClassTeachers(schoolId: string, className: string) {
    const sid = String(schoolId || '').trim();
    const cn = String(className || '').trim().toLowerCase();
    if (!sid || !cn) return [] as Array<{ id: string; name: string; subject: string }>;

    const byId = new Map<string, { id: string; name: string; subject: string }>();

    // DB teachers first (source of truth for the roster).
    try {
      const res = await this.db.client.from('teachers').select('*').eq('school_id', sid);
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      for (const r of rows) {
        const grades = normalizeGrades(r.grades);
        if (grades.some((g) => g.toLowerCase() === cn)) {
          byId.set(String(r.id), {
            id: String(r.id),
            name: r.name || 'Teacher',
            subject: r.subject || 'General'
          });
        }
      }
    } catch (_e) {
      // fallback only.
    }

    // Merge in-memory accounts (covers the grades-column-not-migrated case).
    for (const account of StudentAuthService.teacherAccounts.values()) {
      if (String(account.schoolId || '').trim() !== sid) continue;
      const grades = normalizeGrades(account.grades);
      if (grades.some((g) => g.toLowerCase() === cn)) {
        byId.set(String(account.teacherId), {
          id: String(account.teacherId),
          name: account.name || 'Teacher',
          subject: account.subject || 'General'
        });
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  }

  async loginTeacher(loginIdRaw: string, passwordRaw: string) {
    const loginId = String(loginIdRaw || '').trim().toLowerCase();
    const password = String(passwordRaw || '');
    if (!loginId || !password) return { ok: false, error: 'loginId and password are required' };

    let account = this.findTeacher(loginId);
    if (!account) {
      try {
        const res = await this.db.client.from('teachers').select('*').eq('login_id', loginId);
        const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
        if (row) {
          account = {
            teacherId: row.id,
            loginId: row.login_id,
            email: row.email,
            passwordSalt: row.password_salt,
            passwordHash: row.password_hash,
            name: row.name,
            subject: row.subject,
            schoolId: row.school_id,
            grades: normalizeGrades(row.grades)
          };
          this.rememberTeacher(account);
        }
      } catch (e) {
        // fallback path only.
      }
    }

    if (!account) return { ok: false, error: 'Teacher account not found' };
    if (this.hashPassword(password, account.passwordSalt) !== account.passwordHash) {
      return { ok: false, error: 'Invalid password' };
    }

    const token = this.makeRoleToken(account.teacherId, 'teacher', { schoolId: account.schoolId });
    return {
      ok: true,
      token,
      role: 'teacher',
      teacher: {
        id: account.teacherId,
        schoolId: account.schoolId,
        name: account.name || 'Teacher',
        subject: account.subject || 'General',
        loginId: account.loginId,
        email: account.email,
        grades: normalizeGrades(account.grades)
      }
    };
  }

  /**
   * Resolve the canonical class names (grades) a teacher is assigned to.
   * Checks the in-memory/persisted teacher accounts first, then the DB.
   */
  async resolveTeacherGrades(teacherId?: string): Promise<string[]> {
    const id = String(teacherId || '').trim();
    if (!id) return [];

    for (const account of StudentAuthService.teacherAccounts.values()) {
      if (String(account.teacherId || '').trim() === id) {
        return normalizeGrades(account.grades);
      }
    }

    try {
      const res = await this.db.client.from('teachers').select('grades').eq('id', id);
      const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
      if (row) return normalizeGrades(row.grades);
    } catch (_e) {
      // fallback only.
    }
    return [];
  }

  /**
   * Resolve the subject a teacher is registered to teach. Prefers the
   * in-memory/persisted account store, then falls back to the DB. Returns an
   * empty string when the teacher has no explicit subject so callers can decide
   * how to treat an unscoped teacher.
   */
  async resolveTeacherSubject(teacherId?: string): Promise<string> {
    const id = String(teacherId || '').trim();
    if (!id) return '';

    const local = this.findTeacherById(id);
    if (local) return String(local.subject || '').trim();

    try {
      const res = await this.db.client.from('teachers').select('subject').eq('id', id);
      const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
      if (row) return String(row.subject || '').trim();
    } catch (_e) {
      // fallback only.
    }
    return '';
  }

  /**
   * Public accessor for the locally-stored teacher account (name, subject,
   * email, school and grades). Returns null when the teacher only exists in the
   * DB. Used by controllers to backfill profile details when the DB row is
   * missing (e.g. the grades column has not been migrated yet).
   */
  getLocalTeacher(teacherId?: string): {
    id: string;
    name?: string;
    subject?: string;
    email?: string;
    schoolId?: string;
    loginId?: string;
    grades: string[];
  } | null {
    const account = this.findTeacherById(String(teacherId || '').trim());
    if (!account) return null;
    return {
      id: account.teacherId,
      name: account.name,
      subject: account.subject,
      email: account.email,
      schoolId: account.schoolId,
      loginId: account.loginId,
      grades: normalizeGrades(account.grades)
    };
  }

  getLocalStudent(studentId: string): { studentId: string; name?: string; className?: string; schoolId?: string; loginId?: string; gender?: string } | null {
    const id = String(studentId || '').trim();
    for (const account of StudentAuthService.localAccounts.values()) {
      if (String(account.studentId || '').trim() === id) return account;
    }
    return null;
  }

  async createInvite(payload: {
    role: 'teacher' | 'student';
    schoolId: string;
    createdBy: string;
    teacherId?: string;
    expiresHours?: number;
  }) {
    const token = `inv-${randomUUID().replace(/-/g, '')}`;
    const expiresHours = Number(payload.expiresHours || 72);
    const rec: InviteRecord = {
      token,
      role: payload.role,
      schoolId: payload.schoolId,
      createdBy: payload.createdBy,
      teacherId: payload.teacherId,
      expiresAt: Date.now() + Math.max(1, expiresHours) * 60 * 60 * 1000,
      consumed: false,
      revoked: false
    };
    StudentAuthService.invites.set(token, rec);

    try {
      await this.db.client.from('registration_invites').insert([
        {
          token,
          role: rec.role,
          school_id: rec.schoolId,
          teacher_id: rec.teacherId || null,
          created_by: rec.createdBy,
          expires_at: new Date(rec.expiresAt).toISOString(),
          consumed: false,
          revoked: false,
          created_at: new Date().toISOString()
        }
      ]);
    } catch (e) {
      // local fallback only.
    }

    const webBase = process.env.WEB_BASE_URL || 'http://localhost:3001';
    return {
      ok: true,
      invite: {
        token,
        role: rec.role,
        expiresAt: new Date(rec.expiresAt).toISOString(),
        status: 'active',
        link: `${webBase}/?inviteToken=${encodeURIComponent(token)}`
      }
    };
  }

  async getInvite(tokenRaw: string) {
    const token = String(tokenRaw || '').trim();
    if (!token) return { ok: false, error: 'Invite token is required' };

    let rec = StudentAuthService.invites.get(token) || null;
    if (!rec) {
      try {
        const res = await this.db.client.from('registration_invites').select('*').eq('token', token);
        const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
        if (row) {
          rec = {
            token: row.token,
            role: row.role,
            schoolId: row.school_id,
            teacherId: row.teacher_id || undefined,
            createdBy: row.created_by,
            expiresAt: new Date(row.expires_at).getTime(),
            consumed: !!row.consumed,
            revoked: !!row.revoked,
            revokedAt: row.revoked_at ? new Date(row.revoked_at).getTime() : undefined,
            revokedBy: row.revoked_by || undefined
          } as InviteRecord;
          StudentAuthService.invites.set(token, rec);
        }
      } catch (e) {
        // fallback only.
      }
    }

    if (!rec) return { ok: false, error: 'Invite not found' };
    if (rec.revoked) return { ok: false, error: 'Invite revoked' };
    if (rec.consumed) return { ok: false, error: 'Invite already used' };
    if (Date.now() > rec.expiresAt) return { ok: false, error: 'Invite expired' };

    return {
      ok: true,
      invite: {
        token: rec.token,
        role: rec.role,
        schoolId: rec.schoolId,
        teacherId: rec.teacherId,
        expiresAt: new Date(rec.expiresAt).toISOString(),
        status: this.inviteStatus(rec)
      }
    };
  }

  async revokeInvite(tokenRaw: string, revokedBy: string) {
    const token = String(tokenRaw || '').trim();
    if (!token) return { ok: false, error: 'Invite token is required' };

    let rec = StudentAuthService.invites.get(token) || null;
    if (!rec) {
      try {
        const res = await this.db.client.from('registration_invites').select('*').eq('token', token);
        const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
        if (row) {
          rec = {
            token: row.token,
            role: row.role,
            schoolId: row.school_id,
            teacherId: row.teacher_id || undefined,
            createdBy: row.created_by,
            expiresAt: new Date(row.expires_at).getTime(),
            consumed: !!row.consumed,
            revoked: !!row.revoked,
            revokedAt: row.revoked_at ? new Date(row.revoked_at).getTime() : undefined,
            revokedBy: row.revoked_by || undefined
          } as InviteRecord;
        }
      } catch (e) {
        // fallback only
      }
    }

    if (!rec) return { ok: false, error: 'Invite not found' };
    if (rec.revoked) return { ok: false, error: 'Invite already revoked' };
    if (rec.consumed) return { ok: false, error: 'Invite already used' };

    const now = Date.now();
    const updated: InviteRecord = { ...rec, revoked: true, revokedAt: now, revokedBy: String(revokedBy || '').trim() || undefined } as InviteRecord;
    StudentAuthService.invites.set(token, updated);

    try {
      await this.db.client
        .from('registration_invites')
        .update({ revoked: true, revoked_at: new Date(now).toISOString(), revoked_by: revokedBy || null })
        .eq('token', token);
    } catch (e) {
      // ignore persistence update failure in local mode
    }

    return {
      ok: true,
      invite: {
        token: updated.token,
        role: updated.role,
        schoolId: updated.schoolId,
        teacherId: updated.teacherId,
        expiresAt: new Date(updated.expiresAt).toISOString(),
        status: 'revoked'
      }
    };
  }

  async resendInvite(tokenRaw: string, createdBy: string, expiresHours?: number) {
    const token = String(tokenRaw || '').trim();
    if (!token) return { ok: false, error: 'Invite token is required' };

    let rec = StudentAuthService.invites.get(token) || null;
    if (!rec) {
      try {
        const res = await this.db.client.from('registration_invites').select('*').eq('token', token);
        const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
        if (row) {
          rec = {
            token: row.token,
            role: row.role,
            schoolId: row.school_id,
            teacherId: row.teacher_id || undefined,
            createdBy: row.created_by,
            expiresAt: new Date(row.expires_at).getTime(),
            consumed: !!row.consumed,
            revoked: !!row.revoked,
            revokedAt: row.revoked_at ? new Date(row.revoked_at).getTime() : undefined,
            revokedBy: row.revoked_by || undefined
          } as InviteRecord;
        }
      } catch (e) {
        // fallback only
      }
    }

    if (!rec) return { ok: false, error: 'Invite not found' };
    if (rec.consumed) return { ok: false, error: 'Invite already used' };

    if (!rec.revoked) {
      await this.revokeInvite(token, createdBy);
    }

    return this.createInvite({
      role: rec.role,
      schoolId: rec.schoolId,
      teacherId: rec.teacherId,
      createdBy: String(createdBy || '').trim() || rec.createdBy,
      expiresHours: expiresHours || 72
    });
  }

  async acceptInvite(tokenRaw: string, details: any) {
    const inv = await this.getInvite(tokenRaw);
    if (!inv.ok) return inv;
    const rec = (inv as any).invite as { token: string; role: 'teacher' | 'student'; schoolId: string; teacherId?: string };

    if (rec.role === 'teacher') {
      const created = await this.registerTeacherBySchool({
        schoolId: rec.schoolId,
        name: details?.name,
        email: details?.email,
        subject: details?.subject,
        loginId: details?.loginId,
        password: details?.password,
        createdBy: rec.token
      });
      if (!created.ok) return created;
      StudentAuthService.invites.set(rec.token, {
        ...(StudentAuthService.invites.get(rec.token) as InviteRecord),
        consumed: true
      });
      try {
        await this.db.client.from('registration_invites').update({ consumed: true, consumed_at: new Date().toISOString() }).eq('token', rec.token);
      } catch (e) {
        // ignore persistence update failure in local mode
      }
      const login = await this.loginTeacher(details?.loginId, details?.password);
      return login;
    }

    // A school-issued student invite carries no teacher, so the class picked at
    // accept time decides which teacher the student is filed under.
    let teacherId = rec.teacherId;
    if (!teacherId) {
      try {
        const classTeachers = await this.listClassTeachers(rec.schoolId, String(details?.className || ''));
        if (classTeachers.length) teacherId = String(classTeachers[0].id || '') || undefined;
      } catch (_e) {
        /* optional */
      }
    }

    const student = await this.registerByTeacher({
      loginId: details?.loginId,
      password: details?.password,
      name: details?.name,
      className: details?.className,
      createdBy: rec.teacherId || rec.token,
      schoolId: rec.schoolId,
      teacherId
    });
    if (!student.ok) return student;

    StudentAuthService.invites.set(rec.token, {
      ...(StudentAuthService.invites.get(rec.token) as InviteRecord),
      consumed: true
    });
    try {
      await this.db.client.from('registration_invites').update({ consumed: true, consumed_at: new Date().toISOString() }).eq('token', rec.token);
    } catch (e) {
      // ignore persistence update failure in local mode
    }

    return this.loginStudent(details?.loginId, details?.password);
  }

  async listTeachersBySchool(
    schoolIdRaw: string,
    opts?: {
      q?: string;
      className?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const schoolId = String(schoolIdRaw || '').trim();
    if (!schoolId) {
      return {
        teachers: [] as any[],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 }
      };
    }

    const queryText = String(opts?.q || '').trim().toLowerCase();
    const classNameFilter = String(opts?.className || '').trim().toLowerCase();
    const hasPaging = opts?.page !== undefined || opts?.limit !== undefined || !!queryText;
    const page = Math.max(1, Number(opts?.page || 1));
    const limit = hasPaging
      ? Math.min(100, Math.max(1, Number(opts?.limit || 10)))
      : 500;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
      let q = this.db.client.from('teachers').select('*', { count: 'exact' }).eq('school_id', schoolId);
      if (queryText) {
        q = q.or(`name.ilike.%${queryText}%,email.ilike.%${queryText}%,subject.ilike.%${queryText}%,login_id.ilike.%${queryText}%`);
      }
      const res = await q.order('created_at', { ascending: false });
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      // Local grades fallback: when the `grades` column hasn't been migrated,
      // DB rows carry no grades, so fill them in from the local account store.
      const localGradesById = new Map<string, string[]>();
      for (const t of StudentAuthService.teacherAccounts.values()) {
        localGradesById.set(String(t.teacherId || ''), normalizeGrades(t.grades));
      }

      const byId = new Map<string, any>();
      for (const r of rows) {
        const dbGrades = normalizeGrades(r.grades);
        const grades = dbGrades.length ? dbGrades : (localGradesById.get(String(r.id || '')) || []);
        byId.set(String(r.id || ''), {
          id: r.id,
          schoolId: r.school_id,
          name: r.name || 'Teacher',
          email: r.email || null,
          subject: r.subject || 'General',
          loginId: r.login_id || null,
          grades,
          createdAt: r.created_at || null
        });
      }

      // Merge in-memory accounts so teachers whose DB insert failed (e.g. the
      // grades column has not been migrated) are still listed and searchable.
      for (const t of StudentAuthService.teacherAccounts.values()) {
        if (String(t.schoolId || '').trim() !== schoolId) continue;
        const id = String(t.teacherId || '');
        if (byId.has(id)) continue;
        if (queryText) {
          const text = `${t.name || ''} ${t.email || ''} ${t.subject || ''} ${t.loginId || ''}`.toLowerCase();
          if (!text.includes(queryText)) continue;
        }
        byId.set(id, {
          id: t.teacherId,
          schoolId: t.schoolId,
          name: t.name || 'Teacher',
          email: t.email || null,
          subject: t.subject || 'General',
          loginId: t.loginId || null,
          grades: normalizeGrades(t.grades),
          createdAt: null
        });
      }

      const merged = Array.from(byId.values())
        .filter((t) => {
          if (!classNameFilter) return true;
          return (t.grades || []).some((g: string) => String(g).trim().toLowerCase() === classNameFilter);
        })
        .sort((a, b) => {
          const aTs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTs - aTs;
        });
      const total = merged.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const paged = merged.slice(from, from + limit);
      return {
        teachers: paged,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (e) {
      const locals = Array.from(StudentAuthService.teacherAccounts.values())
        .filter((t) => t.schoolId === schoolId)
        .filter((t) => {
          if (!queryText) return true;
          const text = `${t.name || ''} ${t.email || ''} ${t.subject || ''} ${t.loginId || ''}`.toLowerCase();
          return text.includes(queryText);
        })
        .filter((t) => {
          if (!classNameFilter) return true;
          return normalizeGrades(t.grades).some((g) => g.toLowerCase() === classNameFilter);
        })
        .map((t) => ({
          id: t.teacherId,
          schoolId: t.schoolId,
          name: t.name || 'Teacher',
          email: t.email || null,
          subject: t.subject || 'General',
          loginId: t.loginId,
          grades: normalizeGrades(t.grades),
          createdAt: null
        }));
      const total = locals.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const pagedLocals = locals.slice(from, from + limit);
      return {
        teachers: pagedLocals,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    }
  }

  async listStudentsByScope(
    scope: {
      schoolId?: string;
      teacherId?: string;
      grades?: string[];
      q?: string;
      className?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const schoolId = String(scope.schoolId || '').trim();
    const teacherId = String(scope.teacherId || '').trim();
    const grades = normalizeGrades(scope.grades);
    const gradeSet = new Set(grades.map((g) => g.toLowerCase()));
    const scopeByGrades = gradeSet.size > 0 && !!schoolId;
    const queryText = String(scope.q || '').trim().toLowerCase();
    const classNameFilter = String(scope.className || '').trim().toLowerCase();
    const hasPaging = scope.page !== undefined || scope.limit !== undefined || !!queryText || !!classNameFilter;
    const page = Math.max(1, Number(scope.page || 1));
    const limit = hasPaging
      ? Math.min(100, Math.max(1, Number(scope.limit || 10)))
      : 500;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const inGrades = (className: unknown, _rowTeacherId?: unknown) => {
      if (!gradeSet.size) return true;
      const cn = String(className || '').trim().toLowerCase();
      return gradeSet.has(cn);
    };

    try {
      let q = this.db.client.from('students').select('*', { count: 'exact' });
      if (scopeByGrades) q = q.eq('school_id', schoolId);
      else if (teacherId) q = q.eq('teacher_id', teacherId);
      else if (schoolId) q = q.eq('school_id', schoolId);
      if (queryText) {
        q = q.or(`name.ilike.%${queryText}%,full_name.ilike.%${queryText}%,class_name.ilike.%${queryText}%,class.ilike.%${queryText}%,grade.ilike.%${queryText}%`);
      }
      const res = await q.order('created_at', { ascending: false }).range(from, to);
      const rowsRaw = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const rows = rowsRaw
        .filter((r: any) => inGrades(r?.class_name ?? r?.class ?? r?.grade, r?.teacher_id))
        .filter((r: any) => (classNameFilter
          ? String(r?.class_name || r?.class || r?.grade || '').trim().toLowerCase() === classNameFilter
          : true));

      // Always merge in local-memory accounts so students registered locally
      // (but whose DB insert may have failed) are still included.
      const dbIds = new Set(rows.map((r: any) => String(r.id || '')));
      const localStudents = Array.from(StudentAuthService.localAccounts.values())
        .filter((s) => !dbIds.has(s.studentId)) // avoid duplicates already in DB rows
        .filter((s) => (scopeByGrades
          ? s.schoolId === schoolId && inGrades(s.className, s.teacherId)
          : teacherId ? s.teacherId === teacherId : true))
        .filter((s) => (!scopeByGrades && schoolId ? s.schoolId === schoolId : true))
        .filter((s) => {
          if (!queryText) return true;
          const text = `${s.name || ''} ${s.className || ''} ${s.loginId || ''}`.toLowerCase();
          return text.includes(queryText);
        })
        .filter((s) => {
          if (!classNameFilter) return true;
          return String(s.className || '').trim().toLowerCase() === classNameFilter;
        })
        .map((s) => ({
          id: s.studentId,
          schoolId: s.schoolId || null,
          teacherId: s.teacherId || null,
          name: s.name || 'Student',
          className: s.className || 'Class',
          loginId: s.loginId || null,
          email: null,
          createdAt: null
        }));

      // The login ID is what an admin has to hand back to a student after a
      // password reset, so carry it through from whichever store holds it.
      const localLoginById = new Map<string, string>();
      for (const s of StudentAuthService.localAccounts.values()) {
        localLoginById.set(String(s.studentId || ''), String(s.loginId || ''));
      }

      const dbStudents = rows.map((r: any) => ({
        id: r.id,
        schoolId: r.school_id || null,
        teacherId: r.teacher_id || null,
        name: r.name || r.full_name || 'Student',
        className: r.class_name || r.class || r.grade || 'Class',
        loginId: localLoginById.get(String(r.id || '')) || null,
        email: r.email || null,
        createdAt: r.created_at || null
      }));

      const allStudents = [...dbStudents, ...localStudents];
      const total = allStudents.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const paged = allStudents.slice(from, from + limit);

      const missingLogin = paged.filter((s: any) => !s.loginId).map((s: any) => String(s.id || '')).filter(Boolean);
      if (missingLogin.length) {
        try {
          const accRes = await this.db.client
            .from('student_accounts')
            .select('student_id, login_id')
            .in('student_id', missingLogin);
          for (const row of (Array.isArray((accRes as any)?.data) ? (accRes as any).data : [])) {
            const target = paged.find((s: any) => String(s.id || '') === String(row.student_id || ''));
            if (target) (target as any).loginId = row.login_id || null;
          }
        } catch (_e) {
          /* login id is display-only here */
        }
      }

      return {
        students: paged,
        pagination: { page, limit, total, totalPages }
      };
    } catch (e) {
      const locals = Array.from(StudentAuthService.localAccounts.values())
        .filter((s) => (scopeByGrades
          ? s.schoolId === schoolId && inGrades(s.className, s.teacherId)
          : teacherId ? s.teacherId === teacherId : true))
        .filter((s) => (!scopeByGrades && schoolId ? s.schoolId === schoolId : true))
        .filter((s) => {
          if (!queryText) return true;
          const text = `${s.name || ''} ${s.className || ''} ${s.loginId || ''}`.toLowerCase();
          return text.includes(queryText);
        })
        .filter((s) => {
          if (!classNameFilter) return true;
          return String(s.className || '').trim().toLowerCase() === classNameFilter;
        })
        .map((s) => ({
          id: s.studentId,
          schoolId: s.schoolId || null,
          teacherId: s.teacherId || null,
          name: s.name || 'Student',
          className: s.className || 'Class',
          loginId: s.loginId || null,
          email: null,
          createdAt: null
        }));
      const total = locals.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const pagedLocals = locals.slice(from, from + limit);
      return {
        students: pagedLocals,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    }
  }

  updateLocalStudentsClass(studentIds: string[], className: string, scope?: { schoolId?: string; teacherId?: string }) {
    const ids = new Set((Array.isArray(studentIds) ? studentIds : []).map((id) => String(id || '').trim()).filter(Boolean));
    const normalizedClassName = String(className || '').trim();
    if (!ids.size || !normalizedClassName) return 0;

    const schoolId = String(scope?.schoolId || '').trim();
    const teacherId = String(scope?.teacherId || '').trim();
    let updated = 0;

    for (const [loginId, account] of StudentAuthService.localAccounts.entries()) {
      if (!ids.has(String(account.studentId || '').trim())) continue;
      if (teacherId && String(account.teacherId || '').trim() !== teacherId) continue;
      if (!teacherId && schoolId && String(account.schoolId || '').trim() !== schoolId) continue;

      StudentAuthService.localAccounts.set(loginId, {
        ...account,
        className: normalizedClassName
      });
      updated += 1;
    }

    return updated;
  }

  async listInvitesByScope(scope: {
    schoolId?: string;
    teacherId?: string;
    role?: 'teacher' | 'student';
    q?: string;
    status?: 'all' | 'active' | 'used' | 'revoked' | 'expired';
    page?: number;
    limit?: number;
  }) {
    const schoolId = String(scope.schoolId || '').trim();
    const teacherId = String(scope.teacherId || '').trim();
    const role = scope.role;
    const queryText = String(scope.q || '').trim().toLowerCase();
    const status = String(scope.status || 'all').trim().toLowerCase() as 'all' | 'active' | 'used' | 'revoked' | 'expired';
    const hasPaging = scope.page !== undefined || scope.limit !== undefined;
    const page = Math.max(1, Number(scope.page || 1));
    const limit = Math.min(100, Math.max(1, Number(scope.limit || (hasPaging ? 10 : 500))));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const nowIso = new Date().toISOString();

    try {
      let q = this.db.client.from('registration_invites').select('*', { count: 'exact' });
      if (schoolId) q = q.eq('school_id', schoolId);
      if (teacherId) q = q.eq('teacher_id', teacherId);
      if (role) q = q.eq('role', role);
      if (queryText) q = q.ilike('token', `%${queryText}%`);

      if (status === 'used') {
        q = q.eq('consumed', true);
      } else if (status === 'revoked') {
        q = q.eq('revoked', true);
      } else if (status === 'active') {
        q = q.eq('consumed', false).eq('revoked', false).gt('expires_at', nowIso);
      } else if (status === 'expired') {
        q = q.eq('consumed', false).eq('revoked', false).lte('expires_at', nowIso);
      }

      const res = await q.order('created_at', { ascending: false }).range(from, to);
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const total = Number((res as any)?.count || rows.length);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return {
        invites: rows.map((r: any) => ({
          token: r.token,
          role: r.role,
          schoolId: r.school_id,
          teacherId: r.teacher_id || null,
          expiresAt: r.expires_at || null,
          consumed: !!r.consumed,
          revoked: !!r.revoked,
          revokedAt: r.revoked_at || null,
          createdAt: r.created_at || null,
          status: this.inviteStatus(r),
          link: `${process.env.WEB_BASE_URL || 'http://localhost:3001'}/?inviteToken=${encodeURIComponent(r.token)}`
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (e) {
      const locals = Array.from(StudentAuthService.invites.values())
        .filter((i) => (schoolId ? i.schoolId === schoolId : true))
        .filter((i) => (teacherId ? i.teacherId === teacherId : true))
        .filter((i) => (role ? i.role === role : true))
        .filter((i) => {
          if (!queryText) return true;
          return `${i.token} ${i.role}`.toLowerCase().includes(queryText);
        })
        .filter((i) => (status === 'all' ? true : this.inviteStatus(i) === status));

      const total = locals.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const pagedLocals = locals.slice(from, from + limit)
        .map((i) => ({
          token: i.token,
          role: i.role,
          schoolId: i.schoolId,
          teacherId: i.teacherId || null,
          expiresAt: new Date(i.expiresAt).toISOString(),
          consumed: i.consumed,
          revoked: !!i.revoked,
          revokedAt: i.revokedAt ? new Date(i.revokedAt).toISOString() : null,
          createdAt: null,
          status: this.inviteStatus(i),
          link: `${process.env.WEB_BASE_URL || 'http://localhost:3001'}/?inviteToken=${encodeURIComponent(i.token)}`
        }));
      return {
        invites: pagedLocals,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    }
  }

  async registerByTeacher(payload: {
    loginId: string;
    password: string;
    name: string;
    className?: string;
    studentId?: string;
    createdBy?: string;
    schoolId?: string;
    teacherId?: string;
    gender?: string;
  }) {
    const loginId = String(payload.loginId || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const name = String(payload.name || '').trim();
    const className = String(payload.className || '').trim() || 'Class';
    const gender = String(payload.gender || '').trim().toLowerCase() || null;

    if (!loginId || !password || !name) {
      return { ok: false, error: 'loginId, password and name are required' };
    }

    const existingLocal = this.findLocal(loginId);
    if (existingLocal) {
      return { ok: false, error: 'Login ID already exists' };
    }

    const studentId = payload.studentId || randomUUID();
    const passwordSalt = randomBytes(12).toString('hex');
    const passwordHash = this.hashPassword(password, passwordSalt);

    const account: StudentAccount = {
      studentId,
      loginId,
      passwordSalt,
      passwordHash,
      name,
      className,
      schoolId: payload.schoolId,
      teacherId: payload.teacherId
    };

    // Keep local copy so auth works even when backing table is absent in dev.
    this.remember(account);

    try {
      const dup = await this.db.client.from('student_accounts').select('*').eq('login_id', loginId).limit(1);
      if (Array.isArray((dup as any)?.data) && (dup as any).data.length) {
        return { ok: false, error: 'Login ID already exists' };
      }
    } catch (e) {
      // Ignore duplicate check failures in local/mock mode.
    }

    try {
      await this.db.client.from('students').insert([
        {
          id: studentId,
          name,
          class_name: className,
          gender,
          school_id: payload.schoolId || null,
          teacher_id: payload.teacherId || null,
          created_by: payload.createdBy || null
        }
      ]);
    } catch (e) {
      // Ignore if students table has constraints or is unavailable.
    }
    // Supabase reports constraint problems as a returned error rather than a
    // throw, so verify the row actually landed and repair it if it did not.
    // Without this the student would exist only locally and would silently miss
    // out on class-scoped content.
    await this.ensureStudentRowInDb({
      studentId,
      name,
      className,
      schoolId: payload.schoolId,
      teacherId: payload.teacherId,
      createdBy: payload.createdBy
    });

    try {
      await this.db.client
        .from('student_accounts')
        .insert([
          {
            student_id: studentId,
            login_id: loginId,
            password_salt: passwordSalt,
            password_hash: passwordHash,
            name,
            gender,
            class_name: className,
            school_id: payload.schoolId || null,
            teacher_id: payload.teacherId || null,
            created_by: payload.createdBy || null,
            created_at: new Date().toISOString()
          }
        ]);
    } catch (e) {
      // In local prototyping, the table may not exist; local memory remains source of truth.
    }

    return {
      ok: true,
      student: {
        id: studentId,
        loginId,
        name,
        className
      }
    };
  }

  // ─── school-admin student management ────────────────────────────────────────
  // Student accounts are owned by the school, not by an individual teacher, so
  // these mirror the teacher-management methods above: register, edit, reset the
  // password and delete, all scoped to the caller's school.

  private findStudentById(studentId: string): StudentAccount | null {
    const id = String(studentId || '').trim();
    if (!id) return null;
    for (const account of StudentAuthService.localAccounts.values()) {
      if (String(account.studentId || '').trim() === id) return account;
    }
    return null;
  }

  private removeStudentAccount(studentId: string) {
    const id = String(studentId || '').trim();
    for (const [loginId, account] of StudentAuthService.localAccounts.entries()) {
      if (String(account.studentId || '').trim() === id) {
        StudentAuthService.localAccounts.delete(loginId);
      }
    }
    this.persistStudentAccounts();
  }

  /**
   * Resolve a student for admin operations from whichever store has them —
   * the local account file, `student_accounts` or the `students` roster. A
   * student created before the local store existed only has a `students` row,
   * and must still be editable.
   */
  private async loadStudentForSchool(studentId: string, schoolId: string): Promise<{
    id: string;
    schoolId: string;
    name: string;
    className: string;
    teacherId: string;
    loginId: string;
    local: StudentAccount | null;
  } | null> {
    const id = String(studentId || '').trim();
    const sid = String(schoolId || '').trim();
    if (!id || !sid) return null;

    const local = this.findStudentById(id);
    if (local && String(local.schoolId || '').trim() === sid) {
      return {
        id,
        schoolId: sid,
        name: local.name || 'Student',
        className: local.className || '',
        teacherId: local.teacherId || '',
        loginId: local.loginId || '',
        local
      };
    }

    try {
      const res = await this.db.client.from('students').select('*').eq('id', id).limit(1);
      const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
      if (row && String(row.school_id || '').trim() === sid) {
        let loginId = local?.loginId || '';
        if (!loginId) {
          try {
            const acc = await this.db.client.from('student_accounts').select('login_id').eq('student_id', id).limit(1);
            loginId = String((Array.isArray((acc as any)?.data) ? (acc as any).data[0]?.login_id : '') || '');
          } catch (_e) {
            /* login id is display-only here */
          }
        }
        return {
          id,
          schoolId: sid,
          name: row.name || row.full_name || 'Student',
          className: row.class_name || row.class || row.grade || '',
          teacherId: row.teacher_id || '',
          loginId,
          local: local || null
        };
      }
    } catch (_e) {
      /* fall through to "not found" */
    }
    return null;
  }

  async registerStudentBySchool(payload: {
    schoolId: string;
    name: string;
    className: string;
    loginId: string;
    password: string;
    gender?: string;
    createdBy?: string;
  }) {
    const schoolId = String(payload.schoolId || '').trim();
    const className = String(payload.className || '').trim();
    if (!schoolId) return { ok: false, error: 'schoolId is required' };
    if (!className) return { ok: false, error: 'Class is required' };
    if (String(payload.password || '').length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters long' };
    }

    // File the student under the class teacher when there is exactly one, so
    // teacher-scoped views keep working. The class is what actually drives the
    // student's content, so no teacher is not an error.
    let teacherId: string | undefined;
    try {
      const classTeachers = await this.listClassTeachers(schoolId, className);
      if (classTeachers.length) teacherId = String(classTeachers[0].id || '') || undefined;
    } catch (_e) {
      /* optional */
    }

    return this.registerByTeacher({
      loginId: payload.loginId,
      password: payload.password,
      name: payload.name,
      className,
      schoolId,
      teacherId,
      gender: payload.gender,
      createdBy: payload.createdBy
    });
  }

  async updateStudentBySchool(payload: {
    schoolId: string;
    studentId: string;
    name?: string;
    className?: string;
  }) {
    const schoolId = String(payload.schoolId || '').trim();
    const studentId = String(payload.studentId || '').trim();
    if (!schoolId || !studentId) return { ok: false, error: 'schoolId and studentId are required' };

    const existing = await this.loadStudentForSchool(studentId, schoolId);
    if (!existing) return { ok: false, error: 'Student not found in this school' };

    const name = payload.name !== undefined ? String(payload.name || '').trim() : existing.name;
    const className = payload.className !== undefined
      ? String(payload.className || '').trim()
      : existing.className;
    if (!name) return { ok: false, error: 'Name is required' };
    if (!className) return { ok: false, error: 'Class is required' };

    // Moving a student to another class must re-point them at that class's
    // teacher, otherwise teacher-scoped views keep the student in the old class.
    let teacherId = existing.teacherId;
    if (className.toLowerCase() !== String(existing.className || '').toLowerCase()) {
      teacherId = '';
      try {
        const classTeachers = await this.listClassTeachers(schoolId, className);
        if (classTeachers.length) teacherId = String(classTeachers[0].id || '');
      } catch (_e) {
        /* optional */
      }
    }

    if (existing.local) {
      this.remember({ ...existing.local, name, className, teacherId: teacherId || undefined });
    }

    try {
      await this.db.client
        .from('students')
        .update({ name, class_name: className, teacher_id: teacherId || null })
        .eq('id', studentId);
    } catch (_e) {
      /* local store remains the fallback */
    }
    try {
      await this.db.client
        .from('student_accounts')
        .update({ name, class_name: className, teacher_id: teacherId || null })
        .eq('student_id', studentId);
    } catch (_e) {
      /* optional table */
    }

    return {
      ok: true,
      student: { id: studentId, schoolId, name, className, teacherId: teacherId || null, loginId: existing.loginId }
    };
  }

  async resetStudentPassword(payload: { schoolId: string; studentId: string; password: string }) {
    const schoolId = String(payload.schoolId || '').trim();
    const studentId = String(payload.studentId || '').trim();
    const password = String(payload.password || '');
    if (!schoolId || !studentId) return { ok: false, error: 'schoolId and studentId are required' };
    if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters long' };

    const existing = await this.loadStudentForSchool(studentId, schoolId);
    if (!existing) return { ok: false, error: 'Student not found in this school' };
    if (!existing.loginId) return { ok: false, error: 'This student has no login account to reset' };

    const passwordSalt = randomBytes(12).toString('hex');
    const passwordHash = this.hashPassword(password, passwordSalt);

    if (existing.local) {
      this.remember({ ...existing.local, passwordSalt, passwordHash });
    } else {
      this.remember({
        studentId,
        loginId: existing.loginId,
        passwordSalt,
        passwordHash,
        name: existing.name,
        className: existing.className,
        schoolId,
        teacherId: existing.teacherId || undefined
      });
    }

    try {
      await this.db.client
        .from('student_accounts')
        .update({ password_salt: passwordSalt, password_hash: passwordHash })
        .eq('student_id', studentId);
    } catch (_e) {
      /* local store remains the fallback */
    }

    return { ok: true, student: { id: studentId, loginId: existing.loginId } };
  }

  async deleteStudentBySchool(payload: { schoolId: string; studentId: string }) {
    const schoolId = String(payload.schoolId || '').trim();
    const studentId = String(payload.studentId || '').trim();
    if (!schoolId || !studentId) return { ok: false, error: 'schoolId and studentId are required' };

    const existing = await this.loadStudentForSchool(studentId, schoolId);
    if (!existing) return { ok: false, error: 'Student not found in this school' };

    this.removeStudentAccount(studentId);

    // Everything keyed off the student, removed newest-dependency first so no
    // orphan rows are left pointing at a student that no longer exists.
    const derived = [
      'orchard_reviews',
      'chapter_growth',
      'orchard_activity',
      'orchard_trees',
      'orchard_profile',
      'student_lesson_progress',
      'messages',
      'homework',
      'test_attempts',
      'progress_metrics',
      'student_accounts'
    ];
    for (const table of derived) {
      try {
        await this.db.client.from(table).delete().eq('student_id', studentId);
      } catch (_e) {
        /* table may not exist in this deployment */
      }
    }
    try {
      await this.db.client.from('students').delete().eq('id', studentId);
    } catch (_e) {
      /* local store already dropped the account */
    }

    return { ok: true, student: { id: studentId, name: existing.name, className: existing.className } };
  }

  async loginStudent(loginIdRaw: string, passwordRaw: string) {
    const loginId = String(loginIdRaw || '').trim().toLowerCase();
    const password = String(passwordRaw || '');
    if (!loginId || !password) return { ok: false, error: 'loginId and password are required' };

    let account = this.findLocal(loginId);

    if (!account) {
      try {
        const res = await this.db.client.from('student_accounts').select('*').eq('login_id', loginId).limit(1);
        const row = Array.isArray((res as any)?.data) ? (res as any).data[0] : null;
        if (row) {
          account = {
            studentId: row.student_id,
            loginId: row.login_id,
            passwordSalt: row.password_salt,
            passwordHash: row.password_hash,
            name: row.name,
            className: row.class_name,
            schoolId: row.school_id,
            teacherId: row.teacher_id
          };
          this.remember(account);
        }
      } catch (e) {
        // Fall through to local-only auth.
      }
    }

    if (!account) return { ok: false, error: 'Account not found. Please contact your teacher.' };

    const computed = this.hashPassword(password, account.passwordSalt);
    if (computed !== account.passwordHash) {
      return { ok: false, error: 'Invalid password' };
    }

    let name = account.name || 'Student';
    let className = account.className || 'Class';
    try {
      const student = await this.db.client.from('students').select('*').eq('id', account.studentId).limit(1);
      const row = Array.isArray((student as any)?.data) ? (student as any).data[0] : null;
      if (row) {
        name = row.name || row.full_name || name;
        className = row.class_name || row.grade || className;
      }
    } catch (e) {
      // Keep account fallback values.
    }

    const token = this.makeToken(account.studentId);
    return {
      ok: true,
      token,
      role: 'student',
      student: {
        id: account.studentId,
        loginId: account.loginId,
        name,
        className,
        schoolId: account.schoolId || null,
        teacherId: account.teacherId || null
      }
    };
  }
}
