'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main style={{ maxWidth: 380, margin: '80px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GHO Expenses</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>Sign in to view the dashboard.</p>

      {sent ? (
        <p>✅ Check <b>{email}</b> for a sign-in link.</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}
          />
          <button
            type="submit"
            style={{ padding: '10px 12px', borderRadius: 8, border: 'none', background: '#2f6f5e', color: 'white', fontWeight: 600, cursor: 'pointer' }}
          >
            Send sign-in link
          </button>
          {error && <p style={{ color: '#c0392b', fontSize: 13 }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
