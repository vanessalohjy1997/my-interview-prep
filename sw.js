/* Frontend Interview Prep — offline service worker.
 *
 * Bump CACHE whenever index.html or a guide changes. The old cache is dropped
 * on activate, so a stale deck never outlives a deploy.
 *
 * Strategy, by request type:
 *   navigations      -> stale-while-revalidate against the cached index.html
 *   same-origin GETs -> cache-first, then network (and cache what comes back)
 *   Google Fonts     -> cache-first; opaque cross-origin responses are fine here
 *                       because we only ever replay them, never read their bytes
 */
const CACHE = 'fe-prep-v1';

/* The shell. If any of these fail to fetch, install fails and we keep the old
   worker — better a stale-but-working deck than a half-cached one. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

/* Standalone guide pages. Nice to have offline, but index.html already embeds
   every one of them as base64, so a 404 here must not sink the install. */
const EXTRAS = [
  './ai-agents.html',
  './event-loop-course.html',
  './event-loop-playground.html',
  './guide-browser-security.html',
  './guide-bundlers.html',
  './guide-cicd.html',
  './guide-component-arch.html',
  './guide-css-layout.html',
  './guide-data-async.html',
  './guide-i18n.html',
  './guide-js-core.html',
  './guide-performance.html',
  './guide-pwa.html',
  './guide-react-hooks.html',
  './guide-react-rendering.html',
  './guide-release-ab.html',
  './guide-responsive.html',
  './guide-seo.html',
  './guide-ssr-hydration.html',
  './guide-testing.html',
  './guide-typescript.html',
  './http-prep-guide.html',
  './promises-prep-guide.html',
];

const isFontHost = url =>
  url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);                                  // must all succeed
    await Promise.all(EXTRAS.map(u => cache.add(u).catch(() => {})));  // best effort
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Navigations: hand over the cached deck immediately, refresh it behind the
     scenes. Offline, the revalidate just fails and the cached copy stands. */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache  = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      const fresh  = fetch(req)
        .then(res => { if (res.ok) cache.put('./index.html', res.clone()); return res; })
        .catch(() => null);
      return cached || (await fresh) || new Response(
        '<h1>Offline</h1><p>Open this once with a connection to cache it.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html' } }
      );
    })());
    return;
  }

  /* Fonts: cache-first and permanent. This is what makes the deck look right
     offline instead of falling back to system sans/mono. */
  if (isFontHost(url)) {
    e.respondWith((async () => {
      const cache  = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;   // anything else: leave alone

  e.respondWith((async () => {
    const cache  = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});
