'use client'

// Keeps the signed-in session through a dropped connection.
//
// next-auth checks the session in the background (on focus, on a timer). When
// that check can't reach the server it treats the user as signed out — menus
// vanish and the tab never checks again until a reload. So the last good
// session is remembered (in memory only) and answered when the server can't
// be reached. A real "signed out" answer from the server still clears it.

import { reportUnreachable } from './connection'

const GATEWAY_DOWN = new Set([502, 503, 504])

let last: string | null = null

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
    last = data && typeof data === 'object' && data.user ? body : null
  } catch {
    // Not JSON: leave what we had.
  }
}

export const forgetSession = () => {
  last = null
}

const cached = () => new Response(last, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Sellix-Offline': '1' } })

let installed = false

export const installSessionFallback = () => {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
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
