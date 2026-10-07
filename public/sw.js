const CACHE = 'content-factory-shell-v1';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    for (const path of SHELL) {
      const response = await fetch(path, { credentials: 'omit', cache: 'reload' });
      if (response.ok) await cache.put(path, response);
    }
  }));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(async (keys) => {
    await Promise.all(keys.filter((key) => key.startsWith('content-factory-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  }));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const isShell = SHELL.includes(url.pathname);
  const isAsset = url.pathname.startsWith('/assets/');
  if (!isShell && !isAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { credentials: 'omit' });
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return (await cache.match(event.request)) || (event.request.mode === 'navigate' && await cache.match('/offline.html')) || Response.error();
    }
  })());
});
