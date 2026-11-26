'use client'

// Mounted once in the business dashboards' layout. Records screen views and
// minutes of real use (a tap or key in the last minute, with the page in view)
// and sends them in batches — see src/lib/activity/tracker.ts.

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiClient, sessionScope } from '@/lib/axios-client'
import { createTracker, areaOf, type Tracker } from '@/lib/activity/tracker'
import { getConnection } from '@/lib/connection'
import { isDesktopApp } from '@/lib/tenant'
import { deviceId } from '@/lib/till'

const FLUSH_MS = 2 * 60 * 1000
const MINUTE = 60 * 1000

export const ActivityTracker = () => {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user as { tenant?: string; userId?: number | string; username?: string; accountType?: string } | undefined
  const scope = user?.accountType === 'super-admin' ? undefined : sessionScope(user)
  const tracker = useRef<Tracker | null>(null)
  const area = useRef(areaOf(pathname))
  const lastInput = useRef(0)

  // One tracker per signed-in business and user.
  useEffect(() => {
    if (!scope) return
    const t = createTracker({
      scope,
      device: { id: deviceId(), kind: isDesktopApp() ? 'desktop' : 'web', appVersion: process.env.NEXT_PUBLIC_APP_VERSION || undefined },
      send: (config) => apiClient.request(config as never),
    })
    tracker.current = t
    const online = () => getConnection().status !== 'offline'
    const onInput = () => {
      lastInput.current = Date.now()
    }
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput.current < MINUTE) t.active(area.current, online())
    }, MINUTE / 2)
    const flush = window.setInterval(() => online() && void t.flush(), FLUSH_MS)
    const onHide = () => document.visibilityState === 'hidden' && online() && void t.flush()
    window.addEventListener('pointerdown', onInput, { passive: true })
    window.addEventListener('keydown', onInput)
    document.addEventListener('visibilitychange', onHide)
    if (online()) void t.flush()
    return () => {
      window.clearInterval(tick)
      window.clearInterval(flush)
      window.removeEventListener('pointerdown', onInput)
      window.removeEventListener('keydown', onInput)
      document.removeEventListener('visibilitychange', onHide)
      tracker.current = null
    }
  }, [scope])

  // A view each time the screen changes.
  useEffect(() => {
    area.current = areaOf(pathname)
    tracker.current?.view(area.current, getConnection().status !== 'offline')
  }, [pathname, scope])

  return null
}
