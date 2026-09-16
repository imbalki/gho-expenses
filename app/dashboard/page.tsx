'use client';

import { useEffect, useMemo, useState } from 'react';

type Category = { id: string; name: string };
type Project = { id: string; name: string; status: string };
type TeamMember = { id: string; name: string; status: string; isAdmin: boolean; telegramId: string | null };
type Expense = {
  id: string;
  amount: number;
  vendor: string | null;
  note: string | null;
  date: string;
  channel: string;
  needsReview: boolean;
  duplicateOfId: string | null;
  category: Category | null;
  project: Project | null;
  teamMember: TeamMember | null;
};

export default function DashboardPage() {
  const [tab, setTab] = useState<'expenses' | 'projects' | 'team'>('expenses');

  return (
    <main className="dash-page">
      <div className="dash-header">
        <h1>GHO Expenses</h1>
        <a className="btn-mini" href="/capture">📷 Log an expense</a>
      </div>
      <div className="dash-tabs">
        <button className={`dash-tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
        <button className={`dash-tab ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>Projects</button>
        <button className={`dash-tab ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>Team</button>
      </div>
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'team' && <TeamTab />}
    </main>
  );
}

function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projectFilter, setProjectFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [range, setRange] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, memberFilter, range]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (projectFilter !== 'all') params.set('projectId', projectFilter);
    if (memberFilter !== 'all') params.set('teamMemberId', memberFilter);
    if (range !== 'all') params.set('range', range);
    const res = await fetch(`/api/expenses?${params.toString()}`);
    const data = await res.json();
    setExpenses(data.expenses || []);
    setCategories(data.categories || []);
    setProjects(data.projects || []);
    setTeamMembers(data.teamMembers || []);
    setLoading(false);
  }

  async function updateExpense(id: string, patch: Record<string, any>) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setExpenses((list) => list.map((e) => (e.id === id ? data.expense : e)));
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    setExpenses((list) => list.filter((e) => e.id !== id));
  }

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date();
    monthStart.setDate(1);

    const sum = (pred: (e: Expense) => boolean) => expenses.filter(pred).reduce((s, e) => s + e.amount, 0);
    return {
      today: sum((e) => new Date(e.date).toDateString() === today),
      week: sum((e) => new Date(e.date) >= weekStart),
      month: sum((e) => new Date(e.date) >= monthStart),
      needsReview: expenses.filter((e) => e.needsReview || e.duplicateOfId).length,
    };
  }, [expenses]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.category?.name || 'Uncategorized';
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount, pct: (amount / total) * 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  function exportUrl() {
    const params = new URLSearchParams();
    if (projectFilter !== 'all') params.set('projectId', projectFilter);
    return `/api/export?${params.toString()}`;
  }

  return (
    <div>
      <div className="dash-filters">
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">All projects</option>
          <option value="general">General</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
          <option value="all">All team members</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">This month</option>
        </select>
        <a className="export" href={exportUrl()}>⬇ Export CSV</a>
      </div>

      <div className="stat-row">
        <div className="stat"><div className="label">Today</div><div className="value">₹{stats.today.toLocaleString('en-IN')}</div></div>
        <div className="stat"><div className="label">This week</div><div className="value">₹{stats.week.toLocaleString('en-IN')}</div></div>
        <div className="stat"><div className="label">This month</div><div className="value">₹{stats.month.toLocaleString('en-IN')}</div></div>
        <div className="stat flag"><div className="label">Needs review</div><div className="value">{stats.needsReview}</div></div>
      </div>

      <div className="cat-bars">
        {categoryBreakdown.map((c) => (
          <div className="cat-bar-row" key={c.name}>
            <span>{c.name}</span>
            <div className="cat-bar-track"><div className="cat-bar-fill" style={{ width: `${c.pct}%` }} /></div>
            <span className="val">₹{c.amount.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Date</th><th>Amount</th><th>Vendor</th><th>Category</th><th>Project</th><th>Person</th><th>Via</th><th>Flags</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9}>Loading…</td></tr>}
            {!loading && expenses.length === 0 && <tr><td colSpan={9}>No expenses yet.</td></tr>}
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={e.amount}
                    onBlur={(ev) => {
                      const val = Number(ev.target.value);
                      if (val !== e.amount) updateExpense(e.id, { amount: val });
                    }}
                  />
                </td>
                <td>
                  <input
                    defaultValue={e.vendor || ''}
                    onBlur={(ev) => {
                      if (ev.target.value !== (e.vendor || '')) updateExpense(e.id, { vendor: ev.target.value });
                    }}
                  />
                </td>
                <td>
                  <select value={e.category?.id || ''} onChange={(ev) => updateExpense(e.id, { categoryId: ev.target.value || null })}>
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={e.project?.id || ''} onChange={(ev) => updateExpense(e.id, { projectId: ev.target.value || null })}>
                    <option value="">General</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </td>
                <td>{e.teamMember?.name || '—'}</td>
                <td>{e.channel === 'telegram' ? '✈️' : e.channel === 'web' ? '🌐' : e.channel === 'system' ? '⚙️' : e.channel}</td>
                <td>
                  {e.needsReview && <span className="chip review" style={{ marginRight: 4 }}>⚠ review</span>}
                  {e.duplicateOfId && (
                    <span className="chip review" title="Possible duplicate">
                      👀 dup{' '}
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => updateExpense(e.id, { clearDuplicateFlag: true })}>
                        not a dup
                      </button>
                    </span>
                  )}
                </td>
                <td><button className="btn-mini" onClick={() => deleteExpense(e.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newLocation, setNewLocation] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects || []);
  }

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!details[id]) {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      setDetails((d) => ({ ...d, [id]: data }));
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), client: newClient.trim() || undefined, location: newLocation.trim() || undefined }),
    });
    setNewName('');
    setNewClient('');
    setNewLocation('');
    load();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div>
      <form className="proj-new-form" onSubmit={createProject}>
        <input placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="Client (optional)" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
        <input placeholder="Site location (optional)" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
        <button type="submit">+ New project</button>
      </form>

      <div className="proj-grid">
        {projects.map((p: any) => {
          const d = details[p.id];
          const isOpen = openId === p.id;
          return (
            <div className="proj-card" key={p.id}>
              <div className="proj-card-top">
                <div>
                  <div className="proj-name">{p.name}</div>
                  <div className="proj-meta">
                    {p.location ? `📍 ${p.location} · ` : ''}
                    {p.client ? `Client: ${p.client} · ` : ''}
                    Started {new Date(p.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
                <select className={`chip status-${p.status}`} value={p.status} onChange={(e) => setStatus(p.id, e.target.value)}>
                  <option value="active">Active</option>
                  <option value="onHold">On hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {isOpen && d && (
                <div className="proj-stats">
                  <div className="proj-stat"><div className="v">{d.stats.daysLogged}</div><div className="l">Days logged</div></div>
                  <div className="proj-stat"><div className="v">{d.stats.laborDays}</div><div className="l">Labor-days</div></div>
                  <div className="proj-stat"><div className="v">{d.stats.sqftCovered.toLocaleString('en-IN')}</div><div className="l">Sqft covered</div></div>
                  <div className="proj-stat spend"><div className="v">₹{d.stats.totalSpend.toLocaleString('en-IN')}</div><div className="l">Total spend</div></div>
                </div>
              )}

              <button className="proj-toggle" onClick={() => toggle(p.id)}>
                {isOpen ? '▾ Hide expense breakdown' : '▸ View expense breakdown'}
              </button>

              {isOpen && d && (
                <>
                  <div className="cat-bars">
                    {d.categoryBreakdown.map((c: any) => {
                      const max = d.categoryBreakdown[0]?.amount || 1;
                      return (
                        <div className="cat-bar-row" key={c.name}>
                          <span>{c.name}</span>
                          <div className="cat-bar-track"><div className="cat-bar-fill" style={{ width: `${(c.amount / max) * 100}%` }} /></div>
                          <span className="val">₹{c.amount.toLocaleString('en-IN')}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="proj-log-title">Recent activity</div>
                  <div className="proj-log">
                    {d.activityLogs.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>No activity logged yet.</div>}
                    {d.activityLogs.map((a: any) => (
                      <div className="proj-log-row" key={a.id}>
                        <div className="proj-log-date">{new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                        <div>
                          <div>{a.description || '—'}</div>
                          <div className="proj-log-tags">
                            {a.location && <span>📍 {a.location}</span>}
                            {a.laborCount && <span>👷 {a.laborCount} labor</span>}
                            {a.areaCoveredSqft && <span>📐 {a.areaCoveredSqft} sqft</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/team');
    const data = await res.json();
    setMembers(data.members || []);
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/team/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr><th>Name</th><th>Channel</th><th>Status</th><th>Admin</th><th></th></tr>
        </thead>
        <tbody>
          {members.map((m: any) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.telegramId ? '✈️ Telegram' : '🌐 Web'}</td>
              <td><span className={`chip ${m.status}`}>{m.status}</span></td>
              <td>{m.isAdmin ? '👑' : ''}</td>
              <td>
                {m.status !== 'approved' && (
                  <button className="btn-mini primary" onClick={() => setStatus(m.id, 'approved')}>Approve</button>
                )}{' '}
                {m.status !== 'blocked' && (
                  <button className="btn-mini" onClick={() => setStatus(m.id, 'blocked')}>Block</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
