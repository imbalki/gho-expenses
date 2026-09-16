// Minimal service worker: enables "Add to Home Screen" (PWA install) and
// handles the Android share target — when a photo/screenshot is shared to
// this app from WhatsApp/Gallery/SMS, it's stashed in the Cache API and the
// capture page picks it up on load via ?shared=1.

const SHARE_CACHE = 'gho-share-target';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/capture') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // Everything else: just pass through to the network (no offline page
  // caching needed here — the app's own IndexedDB queue handles offline
  // capture, not asset caching).
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('shared_file');
    const cache = await caches.open(SHARE_CACHE);
    if (file) {
      await cache.put('/shared-file', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
    }
  } catch (err) {
    // If parsing fails, just continue to the capture page empty-handed.
  }
  return Response.redirect('/capture?shared=1', 303);
}
