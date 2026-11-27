// Formula Play offline support.
// The app is one page. This keeps a copy of it and its icons so it opens without a connection,
// and fetches a fresh copy whenever the phone is online.
const VERSION = 'formula-play-v68';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The page itself: newest copy when online, saved copy when not.
  if (req.mode === 'navigate') {
    // The saved copy of this page (each page is saved under its own address).
    const saved = () => caches.match(req).then(hit => hit || (url.pathname.includes('/prototype-lab/') ? caches.match('./prototype-lab/index.html') : url.pathname.includes('/solve/') ? caches.match('./solve/index.html') : caches.match('./index.html').then(h => h || caches.match('./'))));
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; }
          // The site answered with an error (for example 404 or 503): open the saved copy instead of an error page.
          return saved().then(hit => hit || res);
        })
        .catch(saved)
    );
    return;
  }

  // Everything else (icons, the manifest, scripts): saved copy first, refreshed in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
