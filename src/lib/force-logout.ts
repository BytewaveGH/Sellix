'use client'

import { getSession, signOut } from 'next-auth/react'
import { forgetSession } from './session-offline'

export type LogoutReason = 'rebind' | 'expired'

// Shown on the sign-in pages via ?reason=…
export const LOGOUT_MESSAGES: Record<LogoutReason, string> = {
  rebind: 'Sellix was updated. Please sign in again to continue.',
  expired: 'Your session has ended. Please sign in again.',
}

export const logoutReasonFromSearch = (search: string): string | null => {
  const reason = new URLSearchParams(search).get('reason')
  return reason && reason in LOGOUT_MESSAGES ? LOGOUT_MESSAGES[reason as LogoutReason] : null
}

let inProgress = false

// Clears the session and sends the user to the right sign-in page (staff vs
// owner) with a short explanation. Safe to call from many failing requests at
// once — only the first call does anything.
export const forceLogout = async (reason: LogoutReason) => {
  if (inProgress || typeof window === 'undefined') return
  inProgress = true
  const locale = window.location.pathname.split('/')[1] === 'fr' ? 'fr' : 'en'
  const session = await getSession().catch(() => null)
  const staff = session?.user?.accountType === 'employee'
  forgetSession()
  await signOut({ callbackUrl: `/${locale}${staff ? '/staff' : ''}?reason=${reason}` })
}
