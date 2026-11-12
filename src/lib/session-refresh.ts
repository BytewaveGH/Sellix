'use client'

import { getCsrfToken } from 'next-auth/react'

// Asks the app's server to refresh the signed-in session's tokens and keep
// them (auth.config.ts, jwt callback on `update({ refresh: true })`). Used for
// cashiers, whose refresh token changes on every refresh: refreshing in the
// browser would leave the server holding the old one.
// Resolves to the session after the attempt; rejects when the app's server
// can't be reached.
export const refreshOnServer = async (): Promise<{ user?: { accessToken?: string }; error?: string } | null> => {
  const csrfToken = await getCsrfToken()
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csrfToken, data: { refresh: true } }),
  })
  if (!res.ok) throw Object.assign(new Error(`Session refresh failed (${res.status})`), { name: 'TypeError' })
  return res.json()
}
