/* openGym service worker — runtime caching (works with Vite's hashed asset names).
   App assets: network-first with offline fallback.
   Media: cache-first, including the 360x360 ExerciseGymGifsDB GIFs from jsDelivr, so a
   session still shows its demonstration offline once it has been viewed. */
const CACHE = 'opengym-rt-v2'
const MEDIA_CACHE = 'opengym-media-v2'
const KEEP = new Set([CACHE, MEDIA_CACHE])

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => !KEEP.has(k)).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(self.registration.showNotification(data.title || 'openGym', {
    body: data.body || '',
    icon: 'icon-512.png',
    badge: 'icon-180.png',
    tag: data.tag || 'opengym',
    renotify: true
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    const c = clients.find(c => 'focus' in c)
    return c ? c.focus() : self.clients.openWindow('./')
  }))
})

const cacheFirst = (request, cacheName) =>
  caches.open(cacheName).then(c => c.match(request).then(hit =>
    hit || fetch(request).then(res => {
      // Opaque (no-cors) image responses have status 0, so `res.ok` is false for them.
      if (res.ok || res.type === 'opaque') c.put(request, res.clone())
      return res
    })
  ))

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return

  // HD exercise GIFs are served by jsDelivr; cache them on first view.
  if (url.origin !== location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/ExerciseGymGifsDB@')) {
      e.respondWith(cacheFirst(e.request, MEDIA_CACHE))
    }
    return
  }
  if (url.pathname.startsWith('/api/')) return    // never cache auth/data

  const isMedia = url.pathname.includes('/img/') || url.pathname.includes('/gif/')
  if (isMedia) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
