// The API client's offline layer (installed in axios-client.ts), so every
// module works offline without changing its screens:
//   GET   — remembered per business and user. Once a screen's data has been
//           loaded on this device, it's shown at once when the server is slow
//           or unreachable, and refreshed from the server in the background.
//   other — while offline, kept on this device and answered as if saved;
//           sent in order when the connection is back (engine.ts).

import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { getConnection, reportReachable, reportUnreachable } from '../connection'
import { isUnreachableError, SLOW_MS } from '../network'
import { cachedRead, listOps, queueWrite, refreshRead, saveRead, settleKept, showWritten, syncOutbox, type OfflineOptions, type Send } from './engine'
import { cannotKeepRead, cannotQueue, methodOf, readKey, tempIdsIn } from './rules'

export type OfflineConfig = {
  // Whose data this is (business:user); set from the session for each request.
  _scope?: string
  // A change from the outbox being sent: never queued again.
  _replay?: boolean
  // false: always needs the server (never cached or queued).
  offline?: OfflineOptions | false
}

export const OFFLINE_HEADER = 'x-sellix-offline'

// Did this answer come from the device rather than the server?
export const offlineKind = (res: { headers?: unknown } | undefined): 'cached' | 'queued' | null => {
  const h = res?.headers as Record<string, unknown> | { get?: (k: string) => unknown } | undefined
  const v = typeof (h as { get?: unknown })?.get === 'function' ? (h as { get: (k: string) => unknown }).get(OFFLINE_HEADER) : (h as Record<string, unknown>)?.[OFFLINE_HEADER]
  return v === 'cached' || v === 'queued' ? v : null
}

const answer = (config: InternalAxiosRequestConfig, data: unknown, kind: 'cached' | 'queued', at?: string): AxiosResponse => ({
  data,
  status: kind === 'queued' ? 202 : 200,
  statusText: kind === 'queued' ? 'Saved offline' : 'OK (saved copy)',
  headers: { [OFFLINE_HEADER]: kind, ...(at ? { 'x-sellix-saved-at': at } : {}) },
  config,
  request: {},
})

// With a copy on the device, a read waits this long for the server before the
// copy is shown; the server's answer still comes in and replaces it. Long
// enough for a good connection, short enough that a slow one isn't felt.
export const READ_GRACE_MS = 600

// After a background refresh the copy is as fresh as the server's: reads of
// it within this window use it without asking the server again.
const FRESH_MS = 15_000
const freshUntil = new Map<string, number>()

// Fresh copies arrived in the background: screens re-read theirs. For a
// moment every read is answered from the device, so that re-read is cheap
// and never sets off another round of requests.
const QUIET_MS = 2000
let quietUntil = 0
const readListeners = new Set<() => void>()
let readTimer: ReturnType<typeof setTimeout> | null = null
const readUpdated = () => {
  if (readTimer) return
  readTimer = setTimeout(() => {
    readTimer = null
    quietUntil = Date.now() + QUIET_MS
    readListeners.forEach((l) => l())
  }, 250)
}
// Tell me when kept answers were replaced by newer ones from the server.
export const subscribeReadUpdates = (l: () => void) => {
  readListeners.add(l)
  return () => void readListeners.delete(l)
}

// How long a write waits for older offline changes to go first.
const ORDER_WAIT_MS = 3000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const knownOffline = () => getConnection().status === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false)
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

export const withOffline = (base: AxiosAdapter, send: Send, readGraceMs = READ_GRACE_MS): AxiosAdapter => {
  return async (config) => {
    const c = config as InternalAxiosRequestConfig & OfflineConfig
    const scope = c._scope
    if (c._replay || !scope || c.offline === false) return base(config)
    const options = c.offline || undefined

    if (methodOf(c) === 'GET') {
      // Files (blobs) and sign-in/billing reads always come from the server.
      if ((c.responseType && c.responseType !== 'json') || cannotKeepRead(c)) return base(config)
      const key = `${scope}|${readKey(c)}`
      const hit = await cachedRead(scope, c)
      // Answer from the device straight away when:
      //  - it's kept current another way (the menu);
      //  - we know we're offline;
      //  - it was just refreshed in the background (no asking twice), or
      //    screens are re-reading their copies after such a refresh.
      if (hit && (options?.cacheFirst || knownOffline() || (freshUntil.get(key) ?? 0) > Date.now() || Date.now() < quietUntil)) {
        return answer(config, hit.body, 'cached', hit.at)
      }
      const network = base(config)
      // Nothing on this device yet: the first load has to wait for the server
      // (and is kept, so it never has to again).
      if (!hit) {
        const res = await network
        if (res.status >= 200 && res.status < 300) void saveRead(scope, c, res.data)
        return res
      }
      // A copy is here: wait only a moment for the server. A good connection
      // answers in time and the screen gets fresh data; a slow one gets the
      // copy at once, and the server's answer replaces it when it comes.
      let timer: ReturnType<typeof setTimeout> | undefined
      const grace = new Promise<'slow'>((resolve) => (timer = setTimeout(() => resolve('slow'), readGraceMs)))
      const first = await Promise.race([network.then((res) => ({ res }), (err: unknown) => ({ err })), grace]).finally(() =>
        clearTimeout(timer)
      )
      if (first !== 'slow' && 'res' in first) {
        if (first.res.status >= 200 && first.res.status < 300) void saveRead(scope, c, first.res.data)
        return first.res
      }
      if (first !== 'slow') {
        if (!isUnreachableError(first.err)) throw first.err
        reportUnreachable()
        return answer(config, hit.body, 'cached', hit.at)
      }
      reportReachable(SLOW_MS + 1)
      void network.then(
        async (res) => {
          if (res.status < 200 || res.status >= 300) return
          const changed = await refreshRead(scope, c, hit.body, res.data)
          freshUntil.set(key, Date.now() + FRESH_MS)
          if (changed) readUpdated()
        },
        (err: unknown) => {
          if (isUnreachableError(err)) reportUnreachable()
        }
      )
      return answer(config, hit.body, 'cached', hit.at)
    }

    const reason = cannotQueue(c)
    const queue = async () => {
      const { body } = await queueWrite(scope, c, options)
      return answer(config, body, 'queued')
    }

    // Local-first (a till's counter order): kept on the device and answered at
    // once, online or not; sent in the background. The till never waits for
    // the network — a slow connection doesn't fail, it hangs.
    if (options?.localFirst && !reason) {
      const res = await queue()
      void syncOutbox(scope, send).catch(() => undefined)
      return res
    }

    if (knownOffline()) {
      if (reason) throw new AxiosError(reason, 'ERR_NETWORK', config, {})
      return queue()
    }
    // A write the server recognises when it comes twice (clientId): safe to
    // keep and send again whatever happened to this attempt.
    const repeatable = !reason && !!options?.safeToRepeat
    if (!reason) {
      const waiting = (await listOps(scope)).some((o) => o.status === 'waiting')
      // Keep changes in order: what's waiting goes first — but on a slow
      // connection don't hold this one up for long (a till sale or order
      // doesn't depend on earlier changes at all).
      if (waiting) {
        const sync = syncOutbox(scope, send).catch(() => undefined)
        if (!repeatable) await Promise.race([sync, sleep(options?.waitMs ?? ORDER_WAIT_MS)])
      }
      // About a row that only exists on this device so far: it has to wait for it.
      if (tempIdsIn(c).length > 0) return queue()
    }

    const live = base(config)
    if (repeatable && options?.waitMs) {
      // Slow connection: don't keep the till waiting. Past the deadline the
      // change is kept and answered at once; this request carries on, and if
      // it lands the kept copy is dropped (if not, it's sent later, and the
      // server ignores it if it did arrive).
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<'slow'>((resolve) => (timer = setTimeout(() => resolve('slow'), options.waitMs)))
      const first = await Promise.race([live.then((res) => ({ res }), (err: unknown) => ({ err })), deadline]).finally(() => clearTimeout(timer))
      if (first === 'slow') {
        const { op, body } = await queueWrite(scope, c, options)
        reportReachable(SLOW_MS + 1)
        live.then(
          () => settleKept(scope, op.id),
          () => undefined
        )
        return answer(config, body, 'queued')
      }
      if ('res' in first) {
        await showWritten(scope, c, first.res.data, options?.appendTo)
        return first.res
      }
      if (isUnreachableError(first.err)) return queue()
      throw first.err
    }
    try {
      const res = await live
      await showWritten(scope, c, res.data, options?.appendTo)
      return res
    } catch (err) {
      // The browser knew it had no network, so the request never left: safe to keep.
      if (!reason && isUnreachableError(err) && (browserOffline() || repeatable)) return queue()
      throw err
    }
  }
}
