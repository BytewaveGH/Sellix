// Usage events for the platform console's analytics (BACKEND_REQUIREMENTS.md
// §15): which screens a business's people open, and minutes they're actually
// using it. Only the screen area (e.g. "stores.pos") and time are sent — no
// names, amounts or customer details; the token says whose they are.
//
// Batched and kept on the device while offline (never through the offline
// outbox, so they can't hold up real sales). If the server hasn't got the
// endpoint yet, sending pauses for a few hours and nothing piles up.

import type { AxiosRequestConfig } from 'axios'

export type ActivityEvent = {
  at: string
  // view: a screen was opened · active: a minute with someone using it
  type: 'view' | 'active'
  area: string
  online: boolean
}

export type DeviceInfo = { id: string; kind: 'desktop' | 'web'; appVersion?: string }

export type Send = (config: AxiosRequestConfig & { offline?: false }) => Promise<unknown>

export const ACTIVITY_URL = '/activity/events'
const KEY = 'sellix.activity.v1'
const PAUSE_KEY = 'sellix.activity.pause'
export const MAX_KEPT = 500
export const BATCH = 200
// Not built on the server (404/405/501): try again after this long.
export const PAUSE_MS = 6 * 60 * 60 * 1000

// "/en/stores/products/12/edit" → "stores.products". Ids are never areas.
export const areaOf = (pathname: string | null | undefined) => {
  const path = (pathname ?? '').split(/[?#]/)[0].replace(/^\/(en|fr)(?=\/|$)/, '')
  const parts = path.split('/').filter((p) => p && !/^\d+$/.test(p) && !/^[0-9a-f-]{16,}$/i.test(p))
  return parts.slice(0, 2).join('.') || 'home'
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private window / storage full: events just stay in memory
  }
}

// One queue per business and user, so a shared till never mixes them up.
export const createTracker = (opts: { scope: string; device: DeviceInfo; send: Send; now?: () => number }) => {
  const now = opts.now ?? Date.now
  const key = `${KEY}:${opts.scope}`
  let queue: ActivityEvent[] = read(key, [])
  let sending = false
  let lastActiveMinute = ''

  const save = () => write(key, queue.length ? queue : null)
  const paused = () => read<number>(PAUSE_KEY, 0) > now()

  const push = (e: Omit<ActivityEvent, 'at'> & { at?: string }) => {
    queue.push({ at: e.at ?? new Date(now()).toISOString(), type: e.type, area: e.area, online: e.online })
    // Oldest go first when a till is offline for a very long time.
    if (queue.length > MAX_KEPT) queue = queue.slice(queue.length - MAX_KEPT)
    save()
  }

  return {
    view: (area: string, online: boolean) => push({ type: 'view', area, online }),
    // At most one "active" per minute, whatever the caller does.
    active: (area: string, online: boolean) => {
      const minute = new Date(now()).toISOString().slice(0, 16)
      if (minute === lastActiveMinute) return
      lastActiveMinute = minute
      push({ type: 'active', area, online })
    },
    pending: () => queue.length,
    flush: async () => {
      if (sending || !queue.length || paused()) return
      sending = true
      const batch = queue.slice(0, BATCH)
      try {
        await opts.send({
          method: 'POST',
          url: ACTIVITY_URL,
          data: { device: opts.device, events: batch },
          timeout: 10_000,
          offline: false,
        })
        queue = queue.slice(batch.length)
        save()
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 404 || status === 405 || status === 501) {
          // Not on the server yet: don't keep a backlog of what it can't take.
          write(PAUSE_KEY, now() + PAUSE_MS)
          queue = []
          save()
        } else if (status === 400 || status === 413 || status === 422) {
          // This batch will never be accepted: drop it, keep the rest.
          queue = queue.slice(batch.length)
          save()
        }
        // Offline, 401, 5xx: keep them for next time.
      } finally {
        sending = false
      }
    },
  }
}

export type Tracker = ReturnType<typeof createTracker>
