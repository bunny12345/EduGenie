import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

// Thin SMTP wrapper used for real transactional email (currently: school
// registration OTP codes). Reads connection details from env vars so no
// credentials are ever hard-coded — see backend/README.md for setup.
@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private transporterAttempted = false;

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporterAttempted) return this.transporter;
    this.transporterAttempted = true;

    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    if (!host || !user || !pass) return null;

    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    this.transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    return this.transporter;
  }

  isConfigured(): boolean {
    return this.getTransporter() !== null;
  }

  async sendMail(to: string, subject: string, html: string, text?: string): Promise<{ ok: boolean; error?: string }> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return {
        ok: false,
        error: 'Email delivery is not configured on the server. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in backend/.env.'
      };
    }

    const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@AcademiX.app').trim();
    try {
      await transporter.sendMail({ from, to, subject, html, text: text || html.replace(/<[^>]+>/g, ' ') });
      return { ok: true };
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[email] send failed', e?.message || e);
      return { ok: false, error: 'Could not send the email right now. Please try again shortly.' };
    }
  }
}
