'use client';

import { useEffect, useRef, useState } from 'react';
import { queueItem, flushQueue, QueuedItem } from '@/lib/offlineQueue';

type Project = { id: string; name: string };
type Member = { id: string; name: string; status: string; currentProjectId: string | null };
type FeedItem = { id: string; text: string; sub?: string; warn?: boolean };

export default function CapturePage() {
  const [member, setMember] = useState<Member | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [textValue, setTextValue] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentProject = projects.find((p) => p.id === member?.currentProjectId) || null;

  // --- bootstrap: load saved identity, register SW, wire online/offline, flush queue ---
  useEffect(() => {
    const savedId = localStorage.getItem('gho_member_id');
    if (savedId) loadMember(savedId);

    fetch('/api/projects?status=active')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const goOnline = () => {
      setIsOffline(false);
      flushQueue(handleFlushedResult);
    };
    const goOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    flushQueue(handleFlushedResult);

    // Pick up a file shared in via the Android share target (?shared=1)
    if (new URLSearchParams(window.location.search).get('shared') === '1' && 'caches' in window) {
      caches
        .open('gho-share-target')
        .then((cache) => cache.match('/shared-file'))
        .then((res) => res?.blob())
        .then((blob) => {
          if (blob) submitCapture({ kind: 'photo', blob, filename: 'shared.jpg' });
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMember(id: string) {
    const res = await fetch('/api/team');
    const data = await res.json();
    const found = (data.members || []).find((m: Member) => m.id === id);
    if (found) setMember(found);
    else localStorage.removeItem('gho_member_id');
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    const data = await res.json();
    localStorage.setItem('gho_member_id', data.member.id);
    setMember(data.member);
  }

  async function setProject(projectId: string | null) {
    if (!member) return;
    setProjectMenuOpen(false);
    const res = await fetch(`/api/team/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentProjectId: projectId }),
    });
    const data = await res.json();
    setMember(data.member);
  }

  function handleFlushedResult(item: QueuedItem, resultJson: any) {
    if (resultJson?.results) pushResultsToFeed(resultJson.results);
  }

  function pushResultsToFeed(results: any[]) {
    for (const r of results) {
      if (r.type === 'expense') {
        const e = r.expense;
        setFeed((f) => [
          {
            id: e.id,
            text: `₹${e.amount.toLocaleString('en-IN')} · ${e.category?.name || 'Uncategorized'}`,
            sub: e.duplicateOfId ? '👀 Looks like a possible duplicate' : e.needsReview ? '⚠️ Needs review' : e.vendor || undefined,
            warn: Boolean(e.duplicateOfId || e.needsReview),
          },
          ...f,
        ]);
      } else {
        const a = r.activity;
        setFeed((f) => [
          {
            id: a.id,
            text: `Day logged${a.laborCount ? ` · ${a.laborCount} labor` : ''}${a.areaCoveredSqft ? ` · ${a.areaCoveredSqft} sqft` : ''}`,
            sub: a.description || a.location || undefined,
          },
          ...f,
        ]);
      }
    }
  }

  async function submitCapture(payload: { kind: 'photo' | 'audio' | 'text'; blob?: Blob; filename?: string; text?: string }) {
    if (!member) return;
    setBusy(true);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      let res: Response;
      if (payload.kind === 'text') {
        res = await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamMemberId: member.id, text: payload.text }),
        });
      } else {
        const form = new FormData();
        form.append('teamMemberId', member.id);
        form.append(payload.kind === 'photo' ? 'photo' : 'audio', payload.blob!, payload.filename);
        res = await fetch('/api/capture', { method: 'POST', body: form });
      }

      const data = await res.json();
      if (!res.ok) {
        setFeed((f) => [{ id, text: data.error || 'Could not log that', warn: true }, ...f]);
      } else {
        pushResultsToFeed(data.results || []);
      }
    } catch {
      // Offline or network failure — queue it for later instead of losing it.
      await queueItem({
        id,
        teamMemberId: member.id,
        kind: payload.kind,
        text: payload.text,
        blob: payload.blob,
        filename: payload.filename,
        createdAt: Date.now(),
      });
      setFeed((f) => [{ id, text: 'Saved offline — will send once you have signal', warn: true }, ...f]);
    } finally {
      setBusy(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) submitCapture({ kind: 'photo', blob: file, filename: file.name });
    e.target.value = '';
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        submitCapture({ kind: 'audio', blob, filename: 'voice.webm' });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setFeed((f) => [{ id: String(Date.now()), text: "Couldn't access the microphone — check browser permissions.", warn: true }, ...f]);
    }
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textValue.trim()) return;
    submitCapture({ kind: 'text', text: textValue.trim() });
    setTextValue('');
  }

  if (!member) {
    return (
      <main className="cap-page">
        <div className="cap-top">
          <div className="cap-brand">GHO Expenses</div>
        </div>
        <form className="cap-name-gate" onSubmit={handleNameSubmit}>
          <p>What's your name? (Just once — this device will remember you.)</p>
          <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="e.g. Selvi" required />
          <button type="submit">Continue</button>
        </form>
      </main>
    );
  }

  return (
    <main className="cap-page">
      <div className="cap-top">
        <div className="cap-brand">GHO Expenses</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{member.name}</div>
      </div>

      {member.status === 'pending' && (
        <div className="cap-banner pending">⏳ Waiting for admin approval — you can still log, and it'll count once approved.</div>
      )}
      {isOffline && <div className="cap-banner offline">📡 No connection — captures are being saved and will send automatically.</div>}

      <div className="cap-dropdown">
        <button className="cap-project-picker" onClick={() => setProjectMenuOpen((o) => !o)}>
          📍 {currentProject ? currentProject.name : 'General'}{' '}
          <span className="dim">▾ tap to {currentProject ? 'switch' : 'log for a project instead'}</span>
        </button>
        {projectMenuOpen && (
          <div className="cap-dropdown-menu">
            <button onClick={() => setProject(null)}>General</button>
            {projects.map((p) => (
              <button key={p.id} onClick={() => setProject(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cap-actions">
        <button className="cap-action-btn primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          📷 <span>Snap a receipt<span className="sub">Camera opens instantly</span></span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhotoChange} />

        <button className={`cap-action-btn ${recording ? 'recording' : 'secondary'}`} disabled={busy} onClick={toggleRecording}>
          🎙️ <span>{recording ? 'Tap to stop recording' : 'Tap to record'}<span className="sub">Just say the amount and what it was for</span></span>
        </button>
      </div>

      <form className="cap-text-row" onSubmit={handleTextSubmit}>
        <input value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder='Or type it: "180 rickshaw to SIDCO"' />
        <button type="submit" disabled={busy}>Log</button>
      </form>

      {feed.length > 0 && (
        <div className="cap-feed">
          <div className="cap-feed-title">Logged just now</div>
          {feed.map((item) => (
            <div key={item.id} className={`cap-feed-item ${item.warn ? 'warn' : ''}`}>
              <div className="row1">{item.text}</div>
              {item.sub && <div className="row2">{item.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
