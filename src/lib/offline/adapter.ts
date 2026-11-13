// The API client's offline layer (installed in axios-client.ts), so every
// module works offline without changing its screens:
//   GET   — answered by the server and remembered; while the server can't be
//           reached, the last answer is given back instead.
//   other — while offline, kept on this device and answered as if saved;
//           sent in order when the connection is back (engine.ts).

import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { getConnection, reportReachable, reportUnreachable } from '../connection'
import { isUnreachableError, SLOW_MS } from '../network'
import { cachedRead, listOps, queueWrite, saveRead, settleKept, syncOutbox, type OfflineOptions, type Send } from './engine'
import { cannotQueue, methodOf, tempIdsIn } from './rules'

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

// A read slower than this is answered from the device (when it has a copy)
// while the server's answer still comes in and is kept for next time.
export const SLOW_READ_MS = 6000

// How long a write waits for older offline changes to go first.
const ORDER_WAIT_MS = 3000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const knownOffline = () => getConnection().status === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false)
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

export const withOffline = (base: AxiosAdapter, send: Send, slowReadMs = SLOW_READ_MS): AxiosAdapter => {
  return async (config) => {
    const c = config as InternalAxiosRequestConfig & OfflineConfig
    const scope = c._scope
    if (c._replay || !scope || c.offline === false) return base(config)
    const options = c.offline || undefined

    if (methodOf(c) === 'GET') {
      // Known to be offline: answer from the device at once, no waiting for a timeout.
      if (knownOffline()) {
        const hit = await cachedRead(scope, c)
        if (hit) return answer(config, hit.body, 'cached', hit.at)
      }
      const network = base(config).then((res) => {
        if (res.status >= 200 && res.status < 300) void saveRead(scope, c, res.data)
        return res
      })
      try {
        // Poor connection: don't keep the screen waiting if there's a copy.
        let timer: ReturnType<typeof setTimeout> | undefined
        const slow = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), slowReadMs)))
        const first = await Promise.race([network, slow]).finally(() => clearTimeout(timer))
        if (first) return first
        const hit = await cachedRead(scope, c)
        if (!hit) return await network
        network.catch(() => undefined)
        reportReachable(SLOW_MS + 1)
        return answer(config, hit.body, 'cached', hit.at)
      } catch (err) {
        if (!isUnreachableError(err)) throw err
        const hit = await cachedRead(scope, c)
        if (!hit) throw err
        reportUnreachable()
        return answer(config, hit.body, 'cached', hit.at)
      }
    }

    const reason = cannotQueue(c)
    const queue = async () => {
      const { body } = await queueWrite(scope, c, options)
      return answer(config, body, 'queued')
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
      if ('res' in first) return first.res
      if (isUnreachableError(first.err)) return queue()
      throw first.err
    }
    try {
      return await live
    } catch (err) {
      // The browser knew it had no network, so the request never left: safe to keep.
      if (!reason && isUnreachableError(err) && (browserOffline() || repeatable)) return queue()
      throw err
    }
  }
}
