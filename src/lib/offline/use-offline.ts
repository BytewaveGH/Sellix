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
import { getConnection, useConnection } from '../connection'
import { discardOp, isSyncing, listOps, retryOp, subscribeOutbox, subscribeSynced, syncOutbox, type Op, type SyncResult } from './engine'
import type { Query, QueryClient } from '@tanstack/react-query'

// The API lists a query holds (`meta.paths`), if it says.
const queryPaths = (q: Query) => ((q.meta as { paths?: unknown } | undefined)?.paths as string[] | undefined) ?? []

// After a sync: show rows that were made on this device under their real ids
// at once, then reload only the lists the sent changes belong to (all of them
// when no screen says which lists it holds).
const showSynced = (qc: QueryClient, result: SyncResult) => {
  if (!result.sent) return
  const touched = (q: Query) => queryPaths(q).some((p) => result.paths.includes(p))
  const queries = qc.getQueryCache().findAll({ predicate: touched })
  for (const { path, row } of result.made) {
    for (const q of queries) {
      if (!queryPaths(q).includes(path)) continue
      qc.setQueryData(q.queryKey, (old: unknown) =>
        Array.isArray(old) && !old.some((x) => x?.id === row.id) ? [row, ...old] : old
      )
    }
  }
  void (queries.length ? qc.invalidateQueries({ predicate: touched }) : qc.invalidateQueries())
}

// While changes wait: try every 15 s, backing off to a minute after failures.
const RESYNC_MS = 15_000
const RESYNC_MAX_MS = 60_000
const CATALOGUE_MS = 5 * 60_000
const MENU_PATHS = ['/eatery/restaurants', '/eatery/menu-categories', '/eatery/menu-items', '/eatery/promotions']

// Straight to the server: never answered from, or kept in, the device's copies.
const getChanges: Get = async (url, params) =>
  (await apiClient.request({ method: 'GET', url, params, offline: false } as Parameters<typeof apiClient.request>[0] & OfflineConfig)).data?.data

// Servers without the sync endpoints yet (404/405): not asked again this session.
const noChangesEndpoint = new Set<string>()

let catalogueRunning = false
const syncCatalogue = async (scope: string, appType?: string, onMenuChanged?: () => void) => {
  const which = appType === 'retail' ? 'retail' : appType === 'eatery' ? 'eatery' : null
  if (!which || noChangesEndpoint.has(which) || catalogueRunning) return
  catalogueRunning = true
  try {
    if (which === 'retail') await syncRetailCatalogue(scope, getChanges)
    // Screens read the menu from this device: show what changed.
    else if ((await syncEateryMenu(scope, getChanges)) > 0) onMenuChanged?.()
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
    // Something new was kept offline: say so (not for every change, and not
    // for a till's orders made online, which are kept first by design).
    if (
      getConnection().status === 'offline' &&
      known.current &&
      next.some((o) => !known.current!.has(o.id)) &&
      Date.now() - lastQueuedToast.current > 60_000
    ) {
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

  // Whatever started a sync: update the screens and say what happened.
  const wasOffline = useRef(false)
  const delay = useRef(RESYNC_MS)
  useEffect(() => {
    if (status === 'offline') wasOffline.current = true
  }, [status])
  useEffect(
    () =>
      subscribeSynced((s, result) => {
        if (s !== scope) return
        showSynced(qc, result)
        // Gone well: back to the quick timer. Stopped (no answer, 429, 5xx): back off.
        delay.current = result.stopped ? Math.min(delay.current * 2, RESYNC_MAX_MS) : RESYNC_MS
        // Only worth a word after an offline spell; online it happens all the time.
        if (result.sent > 0 && wasOffline.current) {
          wasOffline.current = false
          toast.success(result.sent === 1 ? 'Your offline change was sent' : `${result.sent} offline changes were sent`)
        }
        if (result.failed > 0) {
          toast.error(result.failed === 1 ? 'One change was refused' : `${result.failed} changes were refused`, {
            description: 'Open the sync list at the top of the screen to see why.',
          })
        }
      }),
    [scope, qc]
  )

  const sync = useCallback(async () => {
    if (!scope) return
    const before = await listOps(scope)
    if (!before.some((o) => o.status === 'waiting')) return
    await syncOutbox(scope, sendQueued)
  }, [scope])

  // Back online (or signed in with changes waiting): send them.
  useEffect(() => {
    if (status !== 'offline') void sync()
  }, [status, sync])

  // The browser's own "online" event too: it can come before our check notices.
  useEffect(() => {
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [sync])

  // While changes wait: every 15 s, backing off to a minute after failures.
  const hasWaiting = ops.some((o) => o.status === 'waiting')
  useEffect(() => {
    if (status === 'offline' || !hasWaiting) return
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      t = setTimeout(async () => {
        await sync()
        tick()
      }, delay.current)
    }
    tick()
    return () => clearTimeout(t)
  }, [status, hasWaiting, sync])

  // Keep what the till sells from up to date on this PC (§13.3).
  const appType = (session?.user as { appType?: string } | undefined)?.appType
  const isOffline = status === 'offline'
  useEffect(() => {
    if (isOffline || !scope) return
    const menuChanged = () => void qc.invalidateQueries({ predicate: (q) => queryPaths(q).some((p) => MENU_PATHS.includes(p)) })
    void syncCatalogue(scope, appType, menuChanged)
    const t = setInterval(() => void syncCatalogue(scope, appType, menuChanged), CATALOGUE_MS)
    return () => clearInterval(t)
  }, [isOffline, scope, appType, qc])

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
