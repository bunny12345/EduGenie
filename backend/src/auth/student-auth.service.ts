import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID, createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { SupabaseService } from '../supabase.service';

type StudentAccount = {
  studentId: string;
  loginId: string;
  passwordSalt: string;
  passwordHash: string;
  name?: string;
  className?: string;
  teacherId?: string;
  schoolId?: string;
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
};

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
export class StudentAuthService {
  private static localAccounts = new Map<string, StudentAccount>();
  private static teacherAccounts = new Map<string, TeacherAccount>();
  private static schoolAccounts = new Map<string, SchoolAccount>();
  private static invites = new Map<string, InviteRecord>();

  constructor(private readonly db: SupabaseService) {}

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
  }

  private findLocal(loginId: string) {
    return StudentAuthService.localAccounts.get(String(loginId || '').toLowerCase()) || null;
  }

  private rememberTeacher(account: TeacherAccount) {
    StudentAuthService.teacherAccounts.set(account.loginId.toLowerCase(), account);
  }

  private findTeacher(loginId: string) {
    return StudentAuthService.teacherAccounts.get(String(loginId || '').toLowerCase()) || null;
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
    createdBy?: string;
  }) {
    const schoolId = String(payload.schoolId || '').trim();
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const subject = String(payload.subject || '').trim() || 'General';
    const loginId = String(payload.loginId || '').trim().toLowerCase();
    const password = String(payload.password || '');

    if (!schoolId || !name || !email || !loginId || !password) {
      return { ok: false, error: 'schoolId, name, email, loginId and password are required' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters long' };
    }
    if (this.findTeacher(loginId)) {
      return { ok: false, error: 'Teacher login ID already exists' };
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
      schoolId
    };
    this.rememberTeacher(account);

    try {
      await this.db.client.from('teachers').insert([
        {
          id: teacherId,
          school_id: schoolId,
          name,
          email,
          subject,
          login_id: loginId,
          password_salt: passwordSalt,
          password_hash: passwordHash,
          created_by: payload.createdBy || null,
          created_at: new Date().toISOString()
        }
      ]);
    } catch (e) {
      // fallback only.
    }

    return {
      ok: true,
      teacher: {
        id: teacherId,
        schoolId,
        name,
        email,
        subject,
        loginId
      }
    };
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
            schoolId: row.school_id
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
        email: account.email
      }
    };
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

    const student = await this.registerByTeacher({
      loginId: details?.loginId,
      password: details?.password,
      name: details?.name,
      className: details?.className,
      createdBy: rec.teacherId || rec.token,
      schoolId: rec.schoolId,
      teacherId: rec.teacherId
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
      const res = await q.order('created_at', { ascending: false }).range(from, to);
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const total = Number((res as any)?.count || rows.length);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return {
        teachers: rows.map((r: any) => ({
          id: r.id,
          schoolId: r.school_id,
          name: r.name || 'Teacher',
          email: r.email || null,
          subject: r.subject || 'General',
          loginId: r.login_id || null,
          createdAt: r.created_at || null
        })),
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
        .map((t) => ({
          id: t.teacherId,
          schoolId: t.schoolId,
          name: t.name || 'Teacher',
          email: t.email || null,
          subject: t.subject || 'General',
          loginId: t.loginId,
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
      q?: string;
      className?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const schoolId = String(scope.schoolId || '').trim();
    const teacherId = String(scope.teacherId || '').trim();
    const queryText = String(scope.q || '').trim().toLowerCase();
    const classNameFilter = String(scope.className || '').trim().toLowerCase();
    const hasPaging = scope.page !== undefined || scope.limit !== undefined || !!queryText || !!classNameFilter;
    const page = Math.max(1, Number(scope.page || 1));
    const limit = hasPaging
      ? Math.min(100, Math.max(1, Number(scope.limit || 10)))
      : 500;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
      let q = this.db.client.from('students').select('*', { count: 'exact' });
      if (teacherId) q = q.eq('teacher_id', teacherId);
      else if (schoolId) q = q.eq('school_id', schoolId);
      if (queryText) {
        q = q.or(`name.ilike.%${queryText}%,full_name.ilike.%${queryText}%,class_name.ilike.%${queryText}%,class.ilike.%${queryText}%,grade.ilike.%${queryText}%`);
      }
      const res = await q.order('created_at', { ascending: false }).range(from, to);
      const rowsRaw = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const rows = classNameFilter
        ? rowsRaw.filter((r: any) => String(r?.class_name || r?.class || r?.grade || '').trim().toLowerCase() === classNameFilter)
        : rowsRaw;
      const total = Number((res as any)?.count || rows.length);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return {
        students: rows.map((r: any) => ({
          id: r.id,
          schoolId: r.school_id || null,
          teacherId: r.teacher_id || null,
          name: r.name || r.full_name || 'Student',
          className: r.class_name || r.class || r.grade || 'Class',
          email: r.email || null,
          createdAt: r.created_at || null
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (e) {
      const locals = Array.from(StudentAuthService.localAccounts.values())
        .filter((s) => (teacherId ? s.teacherId === teacherId : true))
        .filter((s) => (schoolId ? s.schoolId === schoolId : true))
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
  }) {
    const loginId = String(payload.loginId || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const name = String(payload.name || '').trim();
    const className = String(payload.className || '').trim() || 'Class';

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
          school_id: payload.schoolId || null,
          teacher_id: payload.teacherId || null,
          created_by: payload.createdBy || null
        }
      ]);
    } catch (e) {
      // Ignore if students table has constraints or is unavailable.
    }

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
