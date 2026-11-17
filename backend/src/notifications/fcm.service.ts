import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PushMessage } from './push-templates';

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

export type FcmSendResult = { ok: boolean; invalidToken: boolean; error?: string };

const ANDROID_CHANNEL: Record<string, string> = {
  evening_plan: 'academix_daily',
  night_recap: 'academix_daily',
  test: 'academix_daily',
  test_tomorrow: 'academix_tests',
  new_test: 'academix_tests',
  new_homework: 'academix_school',
  announcement: 'academix_school'
};

function readServiceAccount(): ServiceAccount | null {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    try {
      const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const json = JSON.parse(text);
      if (json.project_id && json.client_email && json.private_key) {
        return { projectId: json.project_id, clientEmail: json.client_email, privateKey: String(json.private_key) };
      }
    } catch {
      // fall through to the split variables below
    }
  }
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
}

/** Minimal Firebase Cloud Messaging HTTP v1 sender (no firebase-admin dependency). */
@Injectable()
export class FcmService {
  private readonly logger = new Logger('Push');
  private readonly account = readServiceAccount();
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor() {
    if (!this.account) this.logger.log('Firebase push is disabled (FIREBASE_SERVICE_ACCOUNT_JSON not set)');
  }

  get configured() {
    return !!this.account;
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const account = this.account!;
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: account.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
      account.privateKey,
      { algorithm: 'RS256' }
    );
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error(`Firebase auth failed (${res.status})`);
    this.accessToken = { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 };
    return this.accessToken.value;
  }

  async send(deviceToken: string, message: PushMessage): Promise<FcmSendResult> {
    if (!this.account) return { ok: false, invalidToken: false, error: 'Push notifications are not configured' };
    const data: Record<string, string> = { type: message.type, route: message.route, ...(message.data || {}) };
    const payload = {
      message: {
        token: deviceToken,
        notification: { title: message.title, body: message.body },
        data,
        android: {
          priority: 'HIGH',
          notification: { channel_id: ANDROID_CHANNEL[message.type] || 'academix_daily', tag: message.type, color: '#6C4CF1' }
        },
        apns: { payload: { aps: { sound: 'default', 'thread-id': message.type } } }
      }
    };
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return { ok: true, invalidToken: false };
      const json: any = await res.json().catch(() => ({}));
      const details = JSON.stringify(json?.error?.details || []);
      const invalidToken = res.status === 404 || details.includes('UNREGISTERED')
        || (res.status === 400 && details.includes('INVALID_ARGUMENT') && /token/i.test(String(json?.error?.message || '')));
      return { ok: false, invalidToken, error: `FCM ${res.status}: ${json?.error?.message || 'send failed'}` };
    } catch (error) {
      return { ok: false, invalidToken: false, error: String((error as any)?.message || error) };
    }
  }
}
