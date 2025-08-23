const STATIC_CACHE = 'ktm-static-v1';
const RUNTIME_CACHE = 'ktm-runtime-v1';
const APP_SHELL = ['.'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map(k => caches.delete(k))
    ))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put('.', copy));
        return res;
      }).catch(() => caches.match('.') )
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    if (url.href.includes('/api/v1/channels/') || url.href.includes('api.twitch.tv') || url.href.includes('api.github.com')) {
      event.respondWith(networkFirst(req));
      return;
    }
    if (req.destination === 'image') {
      event.respondWith(cacheFirst(req));
      return;
    }
    return;
  }

  event.respondWith(cacheFirst(req));
});

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(res => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
      return res;
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(res => {
    const copy = res.clone();
    caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
    return res;
  }).catch(() => caches.match(request));
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
