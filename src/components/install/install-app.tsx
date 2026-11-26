'use client'

// Putting Sellix on a phone or tablet's home screen (manifest.ts):
//   • InstallApp — the "Install app" button in the dashboard's top bar.
//   • InstallCard — shown on a phone or tablet's first visit, so nobody has to
//     know the browser can do it. On the business pages it installs the
//     dashboard; on a public site (a Sellix Eat storefront, a rentals site, the
//     directories) it offers customers that site as its own app.
// Android/Chrome/Edge install in one tap. iPhone and iPad have no install
// button for websites, so they get the two steps instead.

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Download, EllipsisVertical, Share, SquarePlus, WifiOff, X } from 'lucide-react'
import { store, useInstall, type InstallKind } from './install-state'

export { isIos, isStandalone } from './install-state'

const DISMISS_KEY = 'sellix.install.dismissed'
const CARD_KEY = 'sellix.install.card'
// "Not now" on the card: ask again after this long.
export const CARD_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

const Steps = ({ kind }: { kind: Exclude<InstallKind, 'prompt' | null> }) =>
  kind === 'ios' ? (
    <ol className="mt-1.5 list-decimal pl-4 space-y-1">
      <li>
        Tap <Share className="inline h-3.5 w-3.5 -mt-0.5" aria-label="Share" /> in Safari (at the bottom of the screen; on newer iPhones it’s under <b>•••</b>)
      </li>
      <li>
        Choose <b>Add to Home Screen</b> <SquarePlus className="inline h-3.5 w-3.5 -mt-0.5" aria-hidden />
      </li>
    </ol>
  ) : (
    <ol className="mt-1.5 list-decimal pl-4 space-y-1">
      <li>
        Tap <EllipsisVertical className="inline h-3.5 w-3.5 -mt-0.5" aria-label="the menu" /> in the browser
      </li>
      <li>
        Choose <b>Install app</b> or <b>Add to Home screen</b>
      </li>
    </ol>
  )

// ── Top-bar button ──────────────────────────────────────────────────────────

export const InstallApp = () => {
  const { kind, install } = useInstall()
  const [help, setHelp] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => setDismissed(store.get(DISMISS_KEY) === '1'), [])

  if (!kind || dismissed) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (kind === 'prompt' ? void install() : setHelp((h) => !h))}
        className="inline-flex items-center gap-1.5 rounded-md border border-endeavour/30 px-2.5 py-1.5 text-xs font-semibold text-endeavour hover:bg-endeavour/5 md:text-sm"
        aria-expanded={kind === 'prompt' ? undefined : help}
        aria-label="Install app"
        title="Install app on this device"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Install app</span>
      </button>
      {help && kind !== 'prompt' && (
        <div
          role="dialog"
          aria-label="How to install"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-600 shadow-lg"
        >
          <p className="font-bold text-stone-900">Add Sellix to your home screen</p>
          <Steps kind={kind} />
          <div className="mt-2 flex justify-between">
            <button
              type="button"
              onClick={() => {
                store.set(DISMISS_KEY, '1')
                setDismissed(true)
              }}
              className="font-semibold text-stone-400 hover:text-stone-600"
            >
              Don’t show again
            </button>
            <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="text-stone-400 hover:text-stone-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── "Get the app" on a public site's header ─────────────────────────────────

// Always there (unlike the first-visit card, which "Not now" hides). Where the
// browser allows it (Android's Chrome, Edge, Samsung Internet; Chrome and Edge
// on computers) one tap installs the site. iPhones and iPads don't let any
// website do that, so it shows the two steps there.
export const GetAppButton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => {
  const { kind, publicApp, install } = useInstall()
  const [help, setHelp] = useState(false)
  if (!kind || !publicApp) return null
  const icon = document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '/icons/icon-192.png'
  // The system share sheet, opened from the page (iPhones have it; some
  // computers too). It's where Add to Home Screen lives in Safari.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = () => void navigator.share({ title: publicApp.name, url: window.location.href }).catch(() => {})

  return (
    <>
      <button
        type="button"
        onClick={() => (kind === 'prompt' ? void install() : setHelp(true))}
        className={className}
        style={style}
        aria-label={`Get the ${publicApp.name} app`}
        title="Add to your home screen"
      >
        <Download className="h-4 w-4" />
        <span className="hidden min-[380px]:inline">Get the app</span>
      </button>
      {/* On the page itself, not inside the header: the sticky, blurred
          headers would otherwise trap a full-screen sheet in a 64px strip. */}
      {help &&
        kind !== 'prompt' &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3" onClick={() => setHelp(false)}>
            <div
              role="dialog"
              aria-label={`Get the ${publicApp.name} app`}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-4 text-stone-700 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon} alt="" className="h-12 w-12 rounded-xl border border-stone-100" />
                <p className="min-w-0 flex-1 text-[15px] font-bold text-stone-900">Add {publicApp.name} to your home screen</p>
                <button
                  type="button"
                  onClick={() => setHelp(false)}
                  aria-label="Close"
                  className="h-8 w-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
                <Steps kind={kind} />
              </div>
              {kind === 'ios' && canShare && (
                <button
                  type="button"
                  onClick={share}
                  className="mt-3 h-11 w-full rounded-xl bg-stone-900 text-sm font-semibold text-white inline-flex items-center justify-center gap-2"
                >
                  <Share className="h-4 w-4" /> Open the Share menu
                </button>
              )}
              <p className="mt-2 text-xs text-stone-400">
                {kind === 'ios' ? 'Apple only lets you add websites this way — it takes two taps.' : 'Your browser adds it from its menu.'}
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

// ── First-visit card (phones and tablets) ───────────────────────────────────

// The lobby board runs on a TV, and the console on the platform team's PCs.
const NO_CARD = /^\/(?:en|fr)\/(?:amusement\/board|super-admin)(?:\/|$)/
const PUBLIC = /^\/(?:en|fr)\/(?:eat|rentals)(?:\/|$)/

export const InstallCard = ({ now = Date.now }: { now?: () => number }) => {
  const pathname = usePathname()
  const { kind, mobile, install, publicApp } = useInstall()
  // "Not now" is per app: the dashboard, and each storefront or rentals site.
  const cardKey = `${CARD_KEY}:${publicApp?.path ?? 'app'}`
  const [snoozed, setSnoozed] = useState(true)
  useEffect(() => {
    setSnoozed(Number(store.get(cardKey) || 0) > now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey])

  const isPublic = PUBLIC.test(pathname ?? '')
  // A public page offers its own app once it has loaded (usePublicApp), never the dashboard.
  if (!kind || !mobile || snoozed || NO_CARD.test(pathname ?? '') || (isPublic && !publicApp)) return null
  const device = /ipad|tablet/i.test(navigator.userAgent) ? 'tablet' : 'phone'
  const title = publicApp ? `Add ${publicApp.name} to your home screen` : `Install Sellix on this ${device}`
  const pitch = publicApp
    ? publicApp.kind === 'eat'
      ? 'Order again in one tap — the menu opens straight from your home screen.'
      : 'See what’s free in one tap, straight from your home screen.'
    : 'Opens from your home screen, full screen, and keeps working when the internet drops.'

  const close = () => {
    store.set(cardKey, String(now() + CARD_SNOOZE_MS))
    setSnoozed(true)
  }

  return (
    <div
      role="dialog"
      aria-label={publicApp ? `Install ${publicApp.name}` : 'Install Sellix'}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-4 text-stone-700 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(publicApp && document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')) || '/icons/icon-192.png'}
          alt=""
          className="h-11 w-11 rounded-xl border border-stone-100 flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-stone-900">{title}</p>
          <p className="mt-0.5 text-xs text-stone-500 inline-flex items-start gap-1">
            {!publicApp && <WifiOff className="h-3.5 w-3.5 mt-px flex-shrink-0" />} {pitch}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="h-8 w-8 -mr-1 -mt-1 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {kind === 'prompt' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={close}
            className="h-11 flex-1 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void install().then((ok) => ok && close())}
            className="h-11 flex-[2] rounded-xl bg-endeavour text-sm font-semibold text-white inline-flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Install
          </button>
        </div>
      ) : (
        <div className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <Steps kind={kind} />
        </div>
      )}
    </div>
  )
}
