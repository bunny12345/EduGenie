import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { EmailService } from '../auth/email.service';
import { answerSupportQuestion, redactSupportText } from './support-guide';

export interface SupportActor { actorId: string; actorRole: string; user?: { schoolId?: string } }
interface SupportIdentity { id: string; role: 'student' | 'teacher' | 'school_admin'; schoolId: string; name: string; className: string }
export interface SupportTicket {
  id: string; requester_id: string; requester_role: string; school_id: string;
  requester_name: string; class_name: string; category: string; subject: string;
  status: string; created_at: string; updated_at: string;
}
export interface SupportMessage { id: string; ticket_id: string; author_role: string; content: string; created_at: string }
interface DbResult<T> { data: T; error: { message: string } | null }

@Injectable()
export class SupportService {
  private readonly limits = new Map<string, { count: number; until: number }>();

  constructor(private readonly db: SupabaseService, private readonly auth: StudentAuthService, private readonly email: EmailService) {}

  private storageReady() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ServiceUnavailableException('Support tickets are not configured. Contact your school administrator.');
    }
  }

  private checked<T>(result: DbResult<T>, operation: string): T {
    if (result.error) {
      console.error(`[support] ${operation} failed:`, result.error.message);
      throw new ServiceUnavailableException('Support could not save or retrieve your request. Please try again. The site operator should check support setup.');
    }
    return result.data;
  }

  private rateLimit(key: string, max: number, minutes = 1) {
    const now = Date.now();
    for (const [id, limit] of this.limits) if (limit.until <= now) this.limits.delete(id);
    const limit = this.limits.get(key) || { count: 0, until: now + minutes * 60000 };
    if (limit.count >= max) throw new HttpException('Too many support requests. Please wait before trying again.', 429);
    limit.count += 1;
    this.limits.set(key, limit);
  }

  private text(value: unknown, max = 4000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      throw new BadRequestException(`Please enter text between 1 and ${max} characters.`);
    }
    return redactSupportText(value.trim());
  }

  private uuid(value: unknown) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException('Invalid support request identifier.');
    }
    return value;
  }

  private requester(actor: SupportActor): SupportIdentity['role'] {
    const role = actor.actorRole;
    if (!actor.actorId || (role !== 'student' && role !== 'teacher' && role !== 'school_admin')) {
      throw new ForbiddenException('Support is available to signed-in students, teachers and school administrators only.');
    }
    return role;
  }

  private async identity(actor: SupportActor): Promise<SupportIdentity> {
    const role = this.requester(actor);
    const id = actor.actorId;
    this.storageReady();
    if (role === 'school_admin') {
      if (actor.user?.schoolId && actor.user.schoolId !== id) {
        throw new ForbiddenException('Your school account could not be verified. Contact the site operator.');
      }
      const rows = this.checked<Array<{ id: string; school_name: string }>>(
        await this.db.client.from('schools').select('id,school_name').eq('id', id).limit(1), 'verify school');
      if (!rows[0]?.school_name) throw new ForbiddenException('Your school account could not be verified. Contact the site operator.');
      return { id, role, name: rows[0].school_name, schoolId: id, className: '' };
    }
    if (actor.actorRole === 'teacher') {
      const rows = this.checked<Array<{ id: string; name: string; school_id: string; grades?: string[] }>>(
        await this.db.client.from('teachers').select('id,name,school_id,grades').eq('id', id).limit(1), 'verify teacher');
      const row = rows[0];
      const local = row ? null : this.auth.getLocalTeacher(id);
      const name = row?.name || local?.name;
      const schoolId = row?.school_id || local?.schoolId;
      if (!name || !schoolId || (actor.user?.schoolId && actor.user.schoolId !== schoolId)) {
        throw new ForbiddenException('Your school account could not be verified. Contact your school administrator.');
      }
      return { id, role: 'teacher', name, schoolId, className: (row?.grades || local?.grades || []).join(', ') };
    }
    const profile = await this.auth.resolveStudentProfile(id);
    if (!profile.name || !profile.schoolId) throw new ForbiddenException('Your school account could not be verified. Contact your school administrator.');
    return { id, role: 'student', name: profile.name, className: profile.className, schoolId: profile.schoolId };
  }

  chat(actor: SupportActor, body: { message?: unknown }) {
    const role = this.requester(actor);
    this.rateLimit(`bot:${role}:${actor.actorId}`, 30);
    return { success: true, ...answerSupportQuestion(this.text(body?.message, 2000), role) };
  }

  async list(actor?: SupportActor, offset = 0) {
    this.storageReady();
    let query = this.db.client.from('support_tickets').select('*');
    if (actor) {
      const identity = await this.identity(actor);
      query = query.eq('requester_id', identity.id).eq('requester_role', identity.role).eq('school_id', identity.schoolId);
    }
    const tickets = this.checked<SupportTicket[]>(await query.order('updated_at', { ascending: false }).range(offset, offset + 49), 'list tickets');
    return { success: true, tickets, nextOffset: tickets.length === 50 ? offset + 50 : null };
  }

  private async ticket(id: string, identity?: SupportIdentity) {
    let query = this.db.client.from('support_tickets').select('*').eq('id', this.uuid(id));
    if (identity) query = query.eq('requester_id', identity.id).eq('requester_role', identity.role).eq('school_id', identity.schoolId);
    const tickets = this.checked<SupportTicket[]>(await query.limit(1), 'get ticket');
    if (!tickets?.[0]) throw new NotFoundException('Support request not found.');
    return tickets[0];
  }

  async detail(id: string, actor?: SupportActor, offset = 0) {
    this.storageReady();
    const identity = actor ? await this.identity(actor) : undefined;
    const ticket = await this.ticket(id, identity);
    const messages = this.checked<SupportMessage[]>(await this.db.client.from('support_messages').select('*').eq('ticket_id', id)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 99), 'get messages');
    return { success: true, ticket, messages, nextOffset: messages.length === 100 ? offset + 100 : null };
  }

  async create(actor: SupportActor, body: { id?: unknown; category?: unknown; subject?: unknown; description?: unknown; recentMessages?: unknown }) {
    const identity = await this.identity(actor);
    const id = this.uuid(body?.id);
    this.rateLimit(`create:${identity.id}`, 5, 10);
    const category = body.category;
    if (category !== 'glitch' && category !== 'technician') throw new BadRequestException('Choose Report an issue or Connect to a technician.');
    const subject = this.text(body.subject, 120);
    const description = this.text(body.description);
    const history = Array.isArray(body.recentMessages) ? body.recentMessages.slice(-12) : [];
    // Only requester text is accepted from the client. Never store a claimed
    // technician or bot reply supplied by an untrusted browser.
    const messages = history.filter((m) => m && m.role === 'user').map((m) => ({
      id: randomUUID(), author_role: identity.role, content: this.text(m.content, 2000),
    }));
    messages.push({ id: randomUUID(), author_role: identity.role, content: description });
    this.checked(await this.db.client.rpc('support_create_ticket', {
      p_ticket: { id, requester_id: identity.id, requester_role: identity.role, school_id: identity.schoolId,
        requester_name: identity.name, class_name: identity.className, category, subject },
      p_messages: messages,
    }), 'create ticket');
    const ticket = await this.ticket(id, identity);
    const notificationWarning = await this.notify(ticket);
    return { success: true, ticket, notificationWarning };
  }

  async reply(id: string, body: { id?: unknown; message?: unknown }, actor?: SupportActor) {
    this.storageReady();
    const identity = actor ? await this.identity(actor) : undefined;
    if (identity) this.rateLimit(`reply:${identity.id}`, 20);
    const ticket = await this.ticket(id, identity);
    const message = this.text(body?.message);
    const messageId = this.uuid(body?.id);
    this.checked(await this.db.client.rpc('support_append_message', {
      p_ticket_id: id, p_requester_id: identity?.id || null, p_school_id: identity?.schoolId || null,
      p_message_id: messageId, p_author_role: identity?.role || 'owner', p_content: message,
    }), 'append message');
    const notificationWarning = identity ? await this.notify(ticket) : null;
    return { success: true, notificationWarning };
  }

  async status(id: string, status: unknown) {
    this.storageReady();
    if (status !== 'open' && status !== 'resolved') throw new BadRequestException('Invalid request status.');
    await this.ticket(id);
    this.checked(await this.db.client.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', id), 'update status');
    return { success: true };
  }

  async retryNotification(id: string, actor: SupportActor) {
    const identity = await this.identity(actor);
    this.rateLimit(`notify:${identity.id}`, 1);
    const ticket = await this.ticket(id, identity);
    return { success: true, notificationWarning: await this.notify(ticket) };
  }

  private async notify(ticket: SupportTicket) {
    const messages = this.checked<SupportMessage[]>(await this.db.client.from('support_messages').select('*')
      .eq('ticket_id', ticket.id).order('created_at', { ascending: false }).limit(12), 'email transcript');
    const text = [
      'AcademiX support request',
      `Ticket: ${ticket.id}`, `Account role: ${ticket.requester_role}`,
      `Requester: ${ticket.requester_name}`, `Account ID: ${ticket.requester_id}`,
      `School ID: ${ticket.school_id}`, `Class: ${ticket.class_name}`,
      `Category: ${ticket.category}`, `Subject: ${ticket.subject}`, '',
      ...messages.reverse().map((m) => `${m.author_role}: ${m.content}`),
      '', 'Reply in your MFA-protected AcademiX owner Support Inbox.',
      'https://academix.now/owner',
      'Email replies are not imported into the support chat.',
    ].join('\n');
    const safeHtml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const result = await this.email.sendMail(
      process.env.SUPPORT_NOTIFICATION_EMAIL || 'jpr1521@gmail.com',
      `[AcademiX support] ${ticket.requester_role === 'school_admin' ? 'School administrator' : ticket.requester_role === 'teacher' ? 'Teacher' : 'Student'} ${ticket.category} - ${ticket.id.slice(0, 8)}`,
      `<pre style="white-space:pre-wrap">${safeHtml}</pre>`, text,
    );
    if (!result.ok) {
      console.warn('[support] Notification not delivered for ticket', ticket.id);
      return 'Your request is saved in the technician inbox, but its email notification was not delivered. You can retry the notification.';
    }
    return null;
  }
}
