import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  if (process.argv[2] !== '--confirm-owner-mfa-reset') {
    throw new Error('Recovery only: run with --confirm-owner-mfa-reset after verifying the owner identity.');
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.OWNER_SUPABASE_USER_ID;
  if (!url || !key || !userId) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_SUPABASE_USER_ID are required.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  for (const factor of data.factors.filter((f) => f.factor_type === 'totp')) {
    const { error: deleteError } = await client.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
    if (deleteError) throw deleteError;
  }
  console.log('Owner TOTP factors removed. Sign in at /owner and enroll a new authenticator immediately.');
}

main().catch((error: Error) => {
  console.error('Owner MFA recovery failed:', error.message);
  process.exitCode = 1;
});
