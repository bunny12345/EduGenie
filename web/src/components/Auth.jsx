import React, { useState, useEffect } from 'react';
import supabase from '../supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data?.session?.user || null);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });
    return () => { mounted = false; listener?.subscription?.unsubscribe?.(); };
  }, []);

  async function signIn() {
    if (!email) return alert('Enter email');
    // Use magic link (email) for simplicity in prototype
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert('Sign-in error: ' + error.message);
    else alert('Check your email for a magic link (dev mode may print link in Supabase console)');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (user) {
    return (
      <div style={{ marginBottom: 8, fontSize: 13 }}>
        Signed in as <strong>{user.email || user.id}</strong>
        <button style={{ marginLeft: 8 }} onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginRight: 8 }} />
      <button onClick={signIn}>Sign in (magic link)</button>
    </div>
  );
}
