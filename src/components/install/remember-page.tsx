'use client'

// Inside the installed phone/tablet app only: remember the screen, so closing
// the app and opening it again comes back here (src/lib/last-page.ts).

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { isStandalone } from './install-state'
import { LAST_PAGE_COOKIE, LAST_PAGE_MAX_AGE_S, keepablePage, lastPageCookie, whoFor } from '@/lib/last-page'

export const RememberPage = () => {
  const pathname = usePathname()
  const { data: session } = useSession()
  const who = whoFor(session?.user as any)

  useEffect(() => {
    if (!who || !isStandalone()) return
    const page = window.location.pathname + window.location.search
    if (!keepablePage(page)) return
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${LAST_PAGE_COOKIE}=${lastPageCookie(who, page)}; Path=/; Max-Age=${LAST_PAGE_MAX_AGE_S}; SameSite=Lax${secure}`
  }, [pathname, who])

  return null
}
