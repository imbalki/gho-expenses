'use client';

// Minimal IndexedDB-backed queue so a capture made with weak/no signal at a
// job site isn't lost — it's saved locally and retried automatically once
// the connection comes back.

const DB_NAME = 'gho-expense-queue';
const STORE = 'pending';

export type QueuedItem = {
  id: string;
  teamMemberId: string;
  kind: 'photo' | 'audio' | 'text';
  text?: string;
  blob?: Blob;
  filename?: string;
  mimeType?: string;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueItem(item: QueuedItem) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedItems(): Promise<QueuedItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedItem(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Builds the fetch() call for one queued (or fresh) item. */
export function buildCaptureRequest(item: QueuedItem): { url: string; init: RequestInit } {
  if (item.kind === 'text') {
    return {
      url: '/api/capture',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberId: item.teamMemberId, text: item.text }),
      },
    };
  }
  const form = new FormData();
  form.append('teamMemberId', item.teamMemberId);
  if (item.kind === 'photo' && item.blob) form.append('photo', item.blob, item.filename || 'photo.jpg');
  if (item.kind === 'audio' && item.blob) form.append('audio', item.blob, item.filename || 'voice.webm');
  return { url: '/api/capture', init: { method: 'POST', body: form } };
}

/** Tries to send every queued item; stops at the first failure (likely still offline) rather than hammering the network. */
export async function flushQueue(onResult?: (item: QueuedItem, resultJson: any) => void) {
  const items = await getQueuedItems();
  for (const item of items) {
    try {
      const { url, init } = buildCaptureRequest(item);
      const res = await fetch(url, init);
      if (!res.ok && res.status !== 403) {
        // server error other than "pending approval" — leave queued, try again later
        break;
      }
      const json = await res.json().catch(() => ({}));
      await removeQueuedItem(item.id);
      onResult?.(item, json);
    } catch {
      break; // still offline
    }
  }
}
