/* Sellix offline: lets the app open and move between screens with no internet.
 *
 *  - The app's code, styles, fonts and icons (/_next/static, …): kept once, served from here.
 *  - Pages: the server's copy when it answers within a few seconds; otherwise
 *    the copy kept from the last visit (or from warming, below).
 *  - Data (/api, the Sellix API) is not handled here: the app keeps that itself
 *    (src/lib/offline), per business and user.
 *
 * The app asks for its screens to be "warmed" while online, so screens not yet
 * opened on this device also work offline.
 */

const VERSION = 'v1'
const STATIC = `sellix-static-${VERSION}`
const PAGES = `sellix-pages-${VERSION}`
// Wait this long for the server's page, then open the kept one (refreshed
// for next time when the server does answer). Slow internet shouldn't mean
// a slow start.
const PAGE_TIMEOUT_MS = 1500
const MAX_STATIC = 800

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES])
      for (const name of await caches.keys()) if (name.startsWith('sellix-') && !keep.has(name)) await caches.delete(name)
      await self.clients.claim()
    })()
  )
})

const isStatic = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  // Optimised images (the Sellix logo, …).
  url.pathname === '/_next/image' ||
  /\.(?:js|css|woff2?|ttf|png|jpe?g|svg|ico|webp|gif)$/.test(url.pathname) ||
  url.pathname === '/manifest.webmanifest'

// Server-component payloads for in-app navigation. When they fail, Next.js
// falls back to a full page load, which is served from the pages cache.
const isRsc = (request, url) => request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')

// Pages worth keeping: real screens, not sign-in or redirects.
const keepable = (response) =>
  response.ok && !response.redirected && (response.headers.get('content-type') || '').includes('text/html')

const offlinePage = () =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Sellix</title><style>
body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#1c1917}
@media (prefers-color-scheme:dark){body{background:#0c0a09;color:#f5f5f4}.card{background:#1c1917!important;border-color:#292524!important}}
.card{max-width:420px;margin:16px;padding:28px;border-radius:20px;background:#fff;border:1px solid #e7e5e4;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 18px;line-height:1.5;opacity:.8}
a,button{display:inline-block;padding:10px 18px;border-radius:12px;border:0;background:#0865AC;color:#fff;font-weight:700;text-decoration:none;cursor:pointer;font-size:14px}
</style></head><body><div class="card"><h1>You’re offline</h1>
<p>This screen hasn’t been opened on this device yet, so it isn’t available without the internet. Screens you’ve used before still work.</p>
<button onclick="history.back()">Go back</button></div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )

const trim = async (name, max) => {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

const cacheFirst = async (request) => {
  const cache = await caches.open(STATIC)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.type !== 'opaque') cache.put(request, response.clone())
  return response
}

const fromPages = async (request) => {
  const cache = await caches.open(PAGES)
  return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }))
}

// The server's page if it comes quickly; otherwise the kept copy (refreshed when the server does answer).
const page = async (event) => {
  const { request } = event
  const cache = await caches.open(PAGES)
  const network = fetch(request).then((response) => {
    if (keepable(response)) event.waitUntil(cache.put(request, response.clone()))
    return response
  })
  // Served the kept copy and the network failed later: nothing to report.
  network.catch(() => undefined)
  const kept = await fromPages(request)
  if (!kept) {
    try {
      return await network
    } catch {
      return offlinePage()
    }
  }
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS))
  try {
    const first = await Promise.race([network, timeout])
    return first || kept
  } catch {
    return kept
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (isRsc(request, url)) {
    // Offline: fail at once so the app falls back to the kept page.
    if (self.navigator && self.navigator.onLine === false) event.respondWith(Response.error())
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(page(event))
    return
  }
  if (isStatic(url)) event.respondWith(cacheFirst(request))
})

// Fetch and keep screens (and the code they load) so they open offline.
const warm = async (urls) => {
  const pages = await caches.open(PAGES)
  const statics = await caches.open(STATIC)
  const assets = new Set()
  for (const u of urls) {
    try {
      const response = await fetch(u, { credentials: 'include' })
      if (!keepable(response)) continue
      const html = await response.clone().text()
      await pages.put(u, response)
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0])
    } catch {
      // offline again: try next time
      return
    }
  }
  for (const a of assets) {
    if (await statics.match(a)) continue
    try {
      const response = await fetch(a)
      if (response.ok) await statics.put(a, response)
    } catch {
      return
    }
  }
  await trim(STATIC, MAX_STATIC)
}

self.addEventListener('message', (event) => {
  const msg = event.data || {}
  if (msg.type === 'warm' && Array.isArray(msg.urls)) event.waitUntil(warm(msg.urls.slice(0, 60)))
  if (msg.type === 'forget-pages') event.waitUntil(caches.delete(PAGES))
})
