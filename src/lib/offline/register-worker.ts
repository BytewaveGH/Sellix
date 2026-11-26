// The service worker (public/sw.js): keeps screens so they open offline, and
// is what lets browsers offer "Install" for the dashboard and the public sites.

let registered = false

export const registerWorker = () => {
  if (registered || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // Development rebuilds code on every change; keeping it would serve stale screens.
  if (process.env.NODE_ENV !== 'production') return
  registered = true
  navigator.serviceWorker.register('/sw.js').catch(() => {
    registered = false
  })
}
