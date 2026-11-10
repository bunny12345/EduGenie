import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';

const localSecret = randomBytes(48).toString('hex');
let warned = false;

export function jwtSecret(): string {
  const configured = process.env.SUPABASE_JWT_SECRET;
  if (configured && configured !== 'dev-insecure-secret') return configured;
  if (process.env.NODE_ENV === 'production' || process.env.SUPABASE_URL) {
    throw new ServiceUnavailableException('Authentication signing key is not configured');
  }
  if (!warned) {
    Logger.warn('Using a temporary local JWT signing key; sessions expire on restart', 'Authentication');
    warned = true;
  }
  return localSecret;
}
