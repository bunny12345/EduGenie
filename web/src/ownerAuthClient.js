import { createClient } from '@supabase/supabase-js';

export function createOwnerClient() {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.REACT_APP_SUPABASE_API;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      storageKey: 'AcademiX.owner',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
