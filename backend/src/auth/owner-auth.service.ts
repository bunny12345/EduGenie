import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { decode } from 'jsonwebtoken';

@Injectable()
export class OwnerAuthService {
  private client?: SupabaseClient;

  async authenticate(authorization: string | undefined, requireMfa = true) {
    const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ownerId = (process.env.OWNER_SUPABASE_USER_ID || '').trim();
    if (!url || !key || !ownerId) {
      throw new ServiceUnavailableException('Owner access is not configured. Contact the site operator.');
    }
    const match = /^Bearer ([^\s]+)$/i.exec(authorization || '');
    if (!match) throw new UnauthorizedException('Owner sign-in required.');
    const token = match[1];
    this.client ||= createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // getUser validates this exact token with Supabase Auth; never trust a
    // locally decoded JWT or the existing development-token verifier alone.
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Owner session expired or invalid. Sign in again.');
    const claims = decode(token);
    if (!claims || typeof claims === 'string' || claims.iss !== `${url}/auth/v1` ||
        claims.sub !== data.user.id || claims.role !== 'authenticated' ||
        typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Invalid owner session.');
    }
    if (data.user.id !== ownerId) throw new ForbiddenException('This account does not have owner access.');
    const mfaVerified = claims.aal === 'aal2' &&
      data.user.factors?.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified') === true;
    if (requireMfa && !mfaVerified) throw new ForbiddenException('Verify your authenticator code before registering schools.');
    return { id: data.user.id, mfaVerified };
  }
}
