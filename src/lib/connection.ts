'use client'

// Is the Sellix API reachable right now, and how fast?
//
// Fed by real traffic (every API response or network failure reports here),
// plus a tiny check of the API when there's doubt. `navigator.onLine` alone
// can't be trusted: Wi-Fi with no internet still says "online".

import { useEffect, useSyncExternalStore } from 'react'
import { SLOW_MS } from './network'

export type ConnectionStatus = 'online' | 'slow' | 'offline'

type State = { status: ConnectionStatus; since: number }

let state: State = { status: 'online', since: Date.now() }
const listeners = new Set<() => void>()

const set = (status: ConnectionStatus) => {
  if (status === state.status) return
  state = { status, since: Date.now() }
  listeners.forEach((l) => l())
}

export const getConnection = () => state

// A response came back. `ms` is how long it took, when known.
export const reportReachable = (ms?: number) => set(ms !== undefined && ms > SLOW_MS ? 'slow' : 'online')

// A request failed without reaching the server. Confirm with a check rather
// than trusting one failure.
export const reportUnreachable = () => {
  void probe()
}

const PROBE_TIMEOUT_MS = 8000
let probing: Promise<void> | null = null

// Any answer from the API's address counts, even a 404: it means the server
// is there. `no-cors` keeps it a single cheap request without CORS rules.
export const probe = () => {
  if (typeof window === 'undefined') return Promise.resolve()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set('offline')
    return Promise.resolve()
  }
  probing ??= (async () => {
    const started = Date.now()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      await fetch(process.env.NEXT_PUBLIC_API_URL || '/', { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
      reportReachable(Date.now() - started)
    } catch {
      set('offline')
    } finally {
      clearTimeout(timer)
      probing = null
    }
  })()
  return probing
}

// Checks again every so often while there's a problem (sooner when offline).
let watchers = 0
let timer: ReturnType<typeof setInterval> | null = null
const onOnline = () => void probe()
const onOffline = () => set('offline')

const startWatching = () => {
  if (watchers++ > 0 || typeof window === 'undefined') return
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  if (navigator.onLine === false) set('offline')
  timer = setInterval(() => {
    if (state.status !== 'online') void probe()
  }, 15_000)
}

const stopWatching = () => {
  if (--watchers > 0 || typeof window === 'undefined') return
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  if (timer) clearInterval(timer)
  timer = null
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// Server render and first paint assume online, so nothing flashes "offline".
const serverState: State = { status: 'online', since: 0 }

export const useConnection = (): State => {
  useEffect(() => {
    startWatching()
    return stopWatching
  }, [])
  return useSyncExternalStore(subscribe, getConnection, () => serverState)
}
