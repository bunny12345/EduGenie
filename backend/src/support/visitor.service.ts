import { BadRequestException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { SupabaseService } from '../supabase.service';
import { EmailService } from '../auth/email.service';
import { redactSupportText } from './support-guide';
import { answerVisitorQuestion } from './visitor-guide';

export interface Enquiry {
  id: string; email: string; name: string; school_name: string; status: string;
  created_at: string; updated_at: string; session_hash: string; session_expires_at: string;
  whatsapp_number: string | null;
}
interface Result<T> { data: T; error: { message: string } | null }

@Injectable()
export class VisitorService {
  private readonly limits = new Map<string, { count: number; until: number }>();
  constructor(private readonly db: SupabaseService, private readonly email: EmailService) {}

  private ready() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ServiceUnavailableException('School enquiries are not available right now. Please try again later.');
    }
  }
  private checked<T>(res: Result<T>): T {
    if (res.error) {
      console.error('[school-enquiries] Database operation failed:', res.error.message);
      throw new ServiceUnavailableException('Unable to save or retrieve the school enquiry. Please try again.');
    }
    return res.data;
  }
  private limit(key: string, max: number, minutes = 1) {
    const now = Date.now();
    for (const [id, entry] of this.limits) if (entry.until <= now) this.limits.delete(id);
    const entry = this.limits.get(key) || { count: 0, until: now + minutes * 60000 };
    if (entry.count >= max) throw new HttpException('Please wait before sending another request.', 429);
    entry.count++;
    this.limits.set(key, entry);
  }
  private text(value: unknown, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      throw new BadRequestException(`Please enter between 1 and ${max} characters.`);
    }
    return redactSupportText(value.trim());
  }
  private id(value: unknown) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException('Invalid enquiry identifier.');
    }
    return value;
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private tokenHash(header?: string) {
    const match = /^Enquiry ([0-9a-f]{64})$/i.exec(header || '');
    if (!match) throw new UnauthorizedException('Your enquiry session is unavailable. Please verify your email to start a new enquiry.');
    return this.hash(match[1]);
  }
  private publicEnquiry(enquiry: Enquiry) {
    const { session_hash, session_expires_at, ...safe } = enquiry;
    return safe;
  }
  chat(ip: string, body: { message?: unknown; previousQuestions?: unknown }) {
    this.limit(`bot:${ip}`, 30);
    const history = body?.previousQuestions;
    if (history !== undefined && (!Array.isArray(history) || history.length > 4)) {
      throw new BadRequestException('Visitor context must contain at most four previous questions.');
    }
    const previousQuestions = Array.isArray(history) ? history.map((question) => this.text(question, 2000)) : [];
    return { success: true, ...answerVisitorQuestion(this.text(body?.message, 2000), previousQuestions) };
  }

  async requestCode(ip: string, body: { email?: unknown; name?: unknown; schoolName?: unknown; message?: unknown; consent?: unknown; whatsappNumber?: unknown; whatsappConsent?: unknown; whatsappCountry?: unknown }) {
    this.limit(`code-ip:${ip}`, 5, 10);
    this.ready();
    if (body?.consent !== true) throw new BadRequestException('Please agree to share your enquiry details with the admin.');
    const email = this.text(body.email, 254).toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
    this.limit(`code-email:${this.hash(email)}`, 3, 10);
    const name = this.text(body.name, 100);
    const schoolName = this.text(body.schoolName, 160);
    const message = this.text(body.message, 4000);
    const country = getCountries().find((value) => value === body.whatsappCountry);
    if (body.whatsappCountry !== undefined && !country) throw new BadRequestException('Select a valid country code for WhatsApp contact.');
    let whatsappNumber: string | null = null;
    if (body.whatsappNumber !== undefined && body.whatsappNumber !== '') {
      if (typeof body.whatsappNumber !== 'string' || body.whatsappNumber.length > 32) {
        throw new BadRequestException('Enter a valid WhatsApp number with country code, or leave it blank.');
      }
      const number = body.whatsappNumber.trim().replace(/[ ()-]/g, '');
      if (number) {
        if (!/^\+[1-9][0-9]{7,14}$/.test(number)) throw new BadRequestException('Include the country code, for example +91 98765 43210.');
        const phone = parsePhoneNumberFromString(number, { extract: false });
        if (!phone?.isValid() || (country && phone.country !== country)) {
          throw new BadRequestException('Enter a valid WhatsApp number with the correct country code and number of digits.');
        }
        if (body.whatsappConsent !== true) throw new BadRequestException('Please allow WhatsApp contact or remove the optional number.');
        whatsappNumber = phone.number;
      }
    }
    if (body.whatsappConsent === true && !whatsappNumber) throw new BadRequestException('Enter a WhatsApp number or turn off WhatsApp contact.');
    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    this.checked(await this.db.client.from('school_enquiry_challenges').insert({
      id, email, name, school_name: schoolName, message,
      code_hash: this.hash(`${id}:${code}`),
      expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      whatsapp_number: whatsappNumber
    }));
    const text = `Your AcademiX school enquiry code is ${code}. It expires in 10 minutes. If you did not request this, ignore it. Do not share this code.`;
    const result = await this.email.sendMail(email, 'Verify your AcademiX school enquiry', `<p>${text}</p>`, text);
    if (!result.ok) {
      console.warn('[school-enquiries] Verification email delivery failed');
      throw new ServiceUnavailableException('The verification email could not be delivered. Please try again later.');
    }
    return { success: true, challengeId: id };
  }

  async verify(ip: string, body: { challengeId?: unknown; code?: unknown }) {
    this.limit(`verify:${ip}`, 20, 10);
    this.ready();
    const id = this.id(body?.challengeId);
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new BadRequestException('Enter the six-digit email code.');
    const token = randomBytes(32).toString('hex');
    const result = this.checked<{ verified: boolean; id?: string }>(await this.db.client.rpc('school_enquiry_verify', {
      p_challenge_id: id, p_code_hash: this.hash(`${id}:${body.code}`), p_session_hash: this.hash(token)
    }));
    if (!result?.verified || !result.id) throw new BadRequestException('The code is incorrect, expired or already used. Request a new code if needed.');
    const enquiry = await this.enquiry(result.id);
    const notificationWarning = await this.notify(enquiry, 'New verified school enquiry');
    return { success: true, token, enquiry: this.publicEnquiry(enquiry), notificationWarning };
  }

  private async enquiry(id: string, header?: string, owner = true) {
    this.ready();
    let query = this.db.client.from('school_enquiries').select('*').eq('id', this.id(id));
    if (!owner) query = query.eq('session_hash', this.tokenHash(header)).gt('session_expires_at', new Date().toISOString());
    const rows = this.checked<Enquiry[]>(await query.limit(1));
    if (!rows[0]) throw new UnauthorizedException('This enquiry is unavailable or your session expired. Please verify your email to start a new enquiry.');
    return rows[0];
  }
  async detail(id: string, header?: string, owner = false, offset = 0) {
    const enquiry = await this.enquiry(id, header, owner);
    const messages = this.checked<Array<{ id: string; author_role: string; content: string; created_at: string }>>(
      await this.db.client.from('school_enquiry_messages').select('id,author_role,content,created_at')
        .eq('enquiry_id', id).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 99)
    );
    return { success: true, enquiry: this.publicEnquiry(enquiry), messages, nextOffset: messages.length === 100 ? offset + 100 : null };
  }
  async list(offset = 0) {
    this.ready();
    const rows = this.checked<Enquiry[]>(await this.db.client.from('school_enquiries')
      .select('id,email,name,school_name,status,created_at,updated_at,whatsapp_number').order('updated_at', { ascending: false }).order('id').range(offset, offset + 49));
    return { success: true, enquiries: rows, nextOffset: rows.length === 50 ? offset + 50 : null };
  }
  async reply(id: string, body: { id?: unknown; message?: unknown }, header?: string, owner = false) {
    const enquiry = await this.enquiry(id, header, owner);
    this.limit(`reply:${owner ? 'owner' : id}`, 20);
    const content = this.text(body?.message, 4000);
    this.checked(await this.db.client.rpc('school_enquiry_append', {
      p_enquiry_id: id, p_session_hash: owner ? null : this.tokenHash(header),
      p_message_id: this.id(body.id), p_author_role: owner ? 'owner' : 'visitor', p_content: content
    }));
    const notificationWarning = await this.notify(enquiry, owner ? 'Admin replied to your school enquiry' : 'School enquiry follow-up', owner);
    return { success: true, notificationWarning };
  }
  async notifyAgain(id: string, header?: string) {
    const enquiry = await this.enquiry(id, header, false);
    this.limit(`notify:${id}`, 3, 10);
    return { success: true, notificationWarning: await this.notify(enquiry, 'School enquiry notification retry') };
  }
  async status(id: string, status: unknown) {
    await this.enquiry(id);
    if (status !== 'open' && status !== 'resolved') throw new BadRequestException('Choose open or resolved.');
    this.checked(await this.db.client.from('school_enquiries').update({ status, updated_at: new Date().toISOString() }).eq('id', id));
    return { success: true };
  }
  private async notify(enquiry: Enquiry, subject: string, visitor = false) {
    const text = visitor
      ? 'Our admin has replied to your AcademiX school enquiry. Open the website login page and the welcome assistant in the same browser to read and reply. Email replies are not imported into the chat.'
      : `Verified prospective school enquiry\nName: ${enquiry.name}\nSchool: ${enquiry.school_name}\nEmail: ${enquiry.email}\n${enquiry.whatsapp_number ? `WhatsApp contact requested: ${enquiry.whatsapp_number} (number supplied by visitor, not verified)\nOpen WhatsApp manually: https://wa.me/${enquiry.whatsapp_number.slice(1)}\n` : ''}Enquiry: ${enquiry.id}\nOpen https://academix.now/owner, verify MFA and choose School enquiries to read and reply. Email and WhatsApp replies are not imported into the chat.`;
    const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const result = await this.email.sendMail(visitor ? enquiry.email : process.env.SUPPORT_NOTIFICATION_EMAIL || 'jpr1521@gmail.com',
      `[AcademiX] ${subject}`, `<pre style="white-space:pre-wrap">${html}</pre>`, text);
    if (!result.ok) {
      console.warn('[school-enquiries] Notification delivery failed for', enquiry.id);
      return 'Your message is saved, but the email notification was not delivered.';
    }
    return null;
  }
}
