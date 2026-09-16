import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>GHO Expenses</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 28 }}>Log an expense, or open the dashboard.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link
          href="/capture"
          style={{ background: '#2f6f5e', color: 'white', padding: '14px', borderRadius: 12, fontWeight: 600, textDecoration: 'none' }}
        >
          📷 Log an expense
        </Link>
        <Link
          href="/dashboard"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px', borderRadius: 12, fontWeight: 600, textDecoration: 'none' }}
        >
          📊 Open dashboard
        </Link>
      </div>
    </main>
  );
}
