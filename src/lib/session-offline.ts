'use client'

// Keeps the signed-in session through a dropped connection.
//
// next-auth checks the session in the background (on focus, on a timer). When
// that check can't reach the server it treats the user as signed out — menus
// vanish and the tab never checks again until a reload. So the last good
// session is remembered and answered when the server can't be reached. A real
// "signed out" answer from the server, or signing out, clears it.
//
// It's also kept on the device so the app still opens signed in after a
// reload or restart with no internet — but without its tokens: offline they
// aren't needed (nothing can be sent), and once the server answers again the
// real session, tokens and all, comes from it.

import { reportUnreachable } from './connection'

const GATEWAY_DOWN = new Set([502, 503, 504])
const KEY = 'sellix:offline-session'

let last: string | null = null

// The session without anything that grants access (tokens), for keeping on disk.
export const withoutTokens = (session: unknown): unknown => {
  const strip = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => !/token$/i.test(k) && !/secret|password/i.test(k))
            .map(([k, x]) => [k, strip(x)])
        )
      : v
  return strip(session)
}

const persist = (body: string | null) => {
  try {
    if (body) localStorage.setItem(KEY, JSON.stringify(withoutTokens(JSON.parse(body))))
    else localStorage.removeItem(KEY)
  } catch {
    // Not kept: after a reload offline the user signs in again once online.
  }
}

const restore = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

const isSessionCheck = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const req = input instanceof Request ? input : null
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
    const url = new URL(req ? req.url : String(input), window.location.origin)
    return method === 'GET' && url.origin === window.location.origin && url.pathname.endsWith('/api/auth/session')
  } catch {
    return false
  }
}

// What the server answered: a session (remember it) or none (forget it).
export const rememberSession = (body: string) => {
  try {
    const data = JSON.parse(body)
    const next = data && typeof data === 'object' && data.user ? body : null
    if (next !== last) persist(next)
    last = next
  } catch {
    // Not JSON: leave what we had.
  }
}

export const forgetSession = () => {
  last = null
  persist(null)
  // Pages kept for offline use were rendered for this person.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'forget-pages' })
  } catch {
    // no service worker
  }
}

const isSignOut = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const req = input instanceof Request ? input : null
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
    const url = new URL(req ? req.url : String(input), window.location.origin)
    return method === 'POST' && url.origin === window.location.origin && url.pathname.endsWith('/api/auth/signout')
  } catch {
    return false
  }
}

const cached = () => new Response(last, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Sellix-Offline': '1' } })

let installed = false

export const installSessionFallback = () => {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  installed = true
  last = restore()
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Every way of signing out ends here.
    if (isSignOut(input, init)) forgetSession()
    if (!isSessionCheck(input, init)) return original(input, init)
    try {
      const res = await original(input, init)
      if (res.ok) {
        rememberSession(await res.clone().text())
        return res
      }
      if (GATEWAY_DOWN.has(res.status) && last) {
        reportUnreachable()
        return cached()
      }
      return res
    } catch (err) {
      if (last) {
        reportUnreachable()
        return cached()
      }
      throw err
    }
  }
}
