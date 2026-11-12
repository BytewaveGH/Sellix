'use client'

// Runs working offline for the signed-in dashboard: sends waiting changes when
// the connection is back, refreshes the screens afterwards, and keeps the
// app's screens on the device (public/sw.js) so it opens without internet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { apiClient, sendQueued, sessionScope } from '../axios-client'
import { apiStatus } from '../api-error'
import { syncEateryMenu, syncRetailCatalogue, type Get } from './catalogue'
import type { OfflineConfig } from './adapter'
import { useConnection } from '../connection'
import { discardOp, isSyncing, listOps, retryOp, subscribeOutbox, syncOutbox, type Op } from './engine'

const RESYNC_MS = 30_000
const CATALOGUE_MS = 5 * 60_000

// Straight to the server: never answered from, or kept in, the device's copies.
const getChanges: Get = async (url, params) =>
  (await apiClient.request({ method: 'GET', url, params, offline: false } as Parameters<typeof apiClient.request>[0] & OfflineConfig)).data?.data

// Servers without the sync endpoints yet (404/405): not asked again this session.
const noChangesEndpoint = new Set<string>()

let catalogueRunning = false
const syncCatalogue = async (scope: string, appType?: string) => {
  const which = appType === 'retail' ? 'retail' : appType === 'eatery' ? 'eatery' : null
  if (!which || noChangesEndpoint.has(which) || catalogueRunning) return
  catalogueRunning = true
  try {
    await (which === 'retail' ? syncRetailCatalogue(scope, getChanges) : syncEateryMenu(scope, getChanges))
  } catch (err) {
    if (apiStatus(err) === 404 || apiStatus(err) === 405) noChangesEndpoint.add(which)
    // Otherwise (offline, slow): tried again next time.
  } finally {
    catalogueRunning = false
  }
}

// ── Service worker ──────────────────────────────────────────────────────────

let registered = false
const registerWorker = () => {
  if (registered || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // Development rebuilds code on every change; keeping it would serve stale screens.
  if (process.env.NODE_ENV !== 'production') return
  registered = true
  navigator.serviceWorker.register('/sw.js').catch(() => {
    registered = false
  })
}

// The dashboard's own screens, from its menus: kept so they open offline.
const screensOnPage = () => {
  const locale = window.location.pathname.split('/')[1]
  const urls = new Set<string>([window.location.pathname])
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    try {
      const u = new URL(a.href, window.location.origin)
      if (u.origin !== window.location.origin || !u.pathname.startsWith(`/${locale}/`)) return
      if (/\/(login|logout|sign-?in|sign-?out|register|staff)(\/|$)/.test(u.pathname)) return
      urls.add(u.pathname)
    } catch {
      // not a link
    }
  })
  return Array.from(urls)
}

let warmedAt = 0
const warmScreens = async () => {
  if (Date.now() - warmedAt < 30 * 60_000) return
  const reg = await navigator.serviceWorker?.ready.catch(() => null)
  if (!reg?.active) return
  warmedAt = Date.now()
  reg.active.postMessage({ type: 'warm', urls: screensOnPage() })
}

// ── The outbox ──────────────────────────────────────────────────────────────

export type OfflineState = {
  ops: Op[]
  waiting: number
  // Refused by the server, or may already be recorded: a person decides.
  attention: number
  syncing: boolean
  syncNow: () => void
  retry: (id: string) => void
  discard: (id: string) => void
}

export const useOffline = (): OfflineState => {
  const { data: session } = useSession()
  const scope = sessionScope(session?.user)
  const { status } = useConnection()
  const qc = useQueryClient()
  const [ops, setOps] = useState<Op[]>([])
  const [syncing, setSyncing] = useState(false)
  const lastQueuedToast = useRef(0)
  const known = useRef<Set<string> | null>(null)

  const reload = useCallback(async () => {
    if (!scope) return setOps([])
    const next = await listOps(scope)
    // Something new was kept offline: say so (not for every change).
    if (known.current && next.some((o) => !known.current!.has(o.id)) && Date.now() - lastQueuedToast.current > 60_000) {
      lastQueuedToast.current = Date.now()
      toast.message('Saved on this device', { description: 'You’re offline. Your changes will be sent when the connection is back.' })
    }
    known.current = new Set(next.map((o) => o.id))
    setOps(next)
    setSyncing(isSyncing(scope))
  }, [scope])

  useEffect(() => {
    void reload()
    return subscribeOutbox(() => void reload())
  }, [reload])

  const sync = useCallback(async () => {
    if (!scope || isSyncing(scope)) return
    const before = await listOps(scope)
    if (!before.some((o) => o.status === 'waiting')) return
    const result = await syncOutbox(scope, sendQueued)
    if (result.sent > 0) {
      // Replace what was shown early with the server's own data.
      await qc.invalidateQueries()
      toast.success(result.sent === 1 ? 'Your offline change was sent' : `${result.sent} offline changes were sent`)
    }
    if (result.failed > 0) {
      toast.error(result.failed === 1 ? 'One offline change was refused' : `${result.failed} offline changes were refused`, {
        description: 'Open the sync list at the top of the screen to see why.',
      })
    }
  }, [scope, qc])

  // Back online (or signed in with changes waiting): send them.
  useEffect(() => {
    if (status !== 'offline') void sync()
  }, [status, sync])

  useEffect(() => {
    if (status === 'offline' || !ops.some((o) => o.status === 'waiting')) return
    const t = setInterval(() => void sync(), RESYNC_MS)
    return () => clearInterval(t)
  }, [status, ops, sync])

  // Keep what the till sells from up to date on this PC (§13.3).
  const appType = (session?.user as { appType?: string } | undefined)?.appType
  const isOffline = status === 'offline'
  useEffect(() => {
    if (isOffline || !scope) return
    void syncCatalogue(scope, appType)
    const t = setInterval(() => void syncCatalogue(scope, appType), CATALOGUE_MS)
    return () => clearInterval(t)
  }, [isOffline, scope, appType])

  // Keep the screens for offline use, once things have settled.
  useEffect(() => {
    registerWorker()
    if (status !== 'online' || !scope) return
    const t = setTimeout(() => void warmScreens(), 8000)
    return () => clearTimeout(t)
  }, [status, scope])

  return {
    ops,
    waiting: ops.filter((o) => o.status === 'waiting').length,
    attention: ops.filter((o) => o.status !== 'waiting').length,
    syncing,
    syncNow: () => void sync(),
    retry: (id) => scope && void retryOp(scope, id).then(() => sync()),
    discard: (id) => scope && void discardOp(scope, id).then(() => qc.invalidateQueries()),
  }
}
