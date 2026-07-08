import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.REACT_APP_SUPABASE_API || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

function fallbackClient() {
	return {
		auth: {
			getSession: async () => ({ data: { session: null }, error: null }),
			onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
			signInWithOtp: async () => ({ error: { message: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.' } }),
			signOut: async () => ({ error: null })
		}
	};
}

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
	? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: fallbackClient();

export default supabase;
