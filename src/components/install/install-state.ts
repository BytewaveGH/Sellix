'use client'

// Shared install state for the "Install app" button and the first-visit card.
// Browsers fire `beforeinstallprompt` once per page load, often before React
// mounts, so it's caught here at import time and kept for whoever asks.
// No site can install itself: the person always taps to confirm. iPhones and
// iPads have no install prompt at all — there it's Share → Add to Home Screen.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { isDesktopApp } from '@/lib/tenant'

export type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPrompt | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPrompt
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}

// A public site in view (usePublicApp): customers install it, not the dashboard.
export type PublicAppInfo = { path: string; name: string; kind: 'eat' | 'rentals' }
let publicApp: PublicAppInfo | null = null

// The page's manifest just changed: an offer made for the old one is stale,
// so wait for the browser to offer again (it does, for the new manifest).
export const setPublicApp = (info: PublicAppInfo | null) => {
  if (publicApp?.path === info?.path) return
  publicApp = info
  deferred = null
  emit()
}

// For tests.
export const resetInstallState = () => {
  deferred = null
  installed = false
  publicApp = null
  emit()
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

export const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

// Phones and tablets (iPads report themselves as Macs, hence the touch check).
export const isMobileDevice = () =>
  isIos() || isAndroid() || (typeof navigator !== 'undefined' && /mobile|tablet/i.test(navigator.userAgent))

export type InstallKind =
  | 'prompt' // one tap: the browser's own install dialog
  | 'ios' // Share → Add to Home Screen
  | 'android-menu' // a browser with no prompt: ⋮ → Add to Home screen
  | null // installed already, desktop app, or a computer browser with nothing to offer

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useInstall = () => {
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null
  )
  const done = useSyncExternalStore(
    subscribe,
    () => installed,
    () => false
  )
  // Device checks need the browser: after mount.
  const [env, setEnv] = useState<{ blocked: boolean; ios: boolean; android: boolean; mobile: boolean } | null>(null)
  useEffect(() => setEnv({ blocked: isDesktopApp() || isStandalone(), ios: isIos(), android: isAndroid(), mobile: isMobileDevice() }), [])

  const kind: InstallKind = !env || env.blocked || done ? null : prompt ? 'prompt' : env.ios ? 'ios' : env.android ? 'android-menu' : null

  const app = useSyncExternalStore(
    subscribe,
    () => publicApp,
    () => null
  )

  return {
    kind,
    mobile: !!env?.mobile,
    publicApp: app,
    // Shows the browser's install dialog; true if they installed.
    install: async () => {
      if (!deferred) return false
      const p = deferred
      await p.prompt()
      const { outcome } = await p.userChoice
      deferred = null
      if (outcome === 'accepted') installed = true
      emit()
      return outcome === 'accepted'
    },
  }
}

// localStorage that never throws (private windows, blocked storage).
export const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // ignore
    }
  },
}
