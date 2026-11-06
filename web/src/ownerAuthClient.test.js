import { createClient } from '@supabase/supabase-js';
import { createOwnerClient } from './ownerAuthClient';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

test('owner client uses isolated, memory-only sessions without auto refresh or URL detection', () => {
  const saved = { ...process.env };
  try {
    process.env.REACT_APP_SUPABASE_URL = 'https://owner-auth.example.test';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'test-public-key';
    createOwnerClient();
    expect(createClient).toHaveBeenCalledWith(
      'https://owner-auth.example.test',
      'test-public-key',
      { auth: {
        storageKey: 'AcademiX.owner',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      } },
    );
    delete process.env.REACT_APP_SUPABASE_ANON_KEY;
    expect(createOwnerClient()).toBeNull();
  } finally {
    process.env = saved;
  }
});
