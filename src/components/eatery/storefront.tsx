'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Moon, ShoppingBag } from 'lucide-react'
import { useCart, useCartLines } from '@/lib/eatery/cart'
import { festivalOf, sealYear } from '@/lib/eatery/festivals'
import { formatMoney, openState, priceOrder } from '@/lib/eatery/menu'
import type { FulfilmentType, MenuItem, StorefrontBundle } from '@/lib/eatery/types'
import { CartSheet } from './cart-sheet'
import { FestivalBar, FestivalSeal } from './festival-marks'
import { Hero, InfoStrip } from './hero'
import { ItemSheet } from './item-sheet'
import { MenuView, PromoBanner } from './menu-view'
import { OrderMode, availableModes } from './order-mode'
import { RestaurantFooter } from './restaurant-footer'
import { BrandMark, ThemeScope } from './theme-scope'
import { GetAppButton } from '@/components/install/install-app'

// Why ordering is off right now, or null.
export const orderingBlocked = (bundle: StorefrontBundle, now: Date) => {
  const r = bundle.restaurant
  if (!r.acceptingOrders) return 'Not taking orders right now'
  const s = openState(r.hours, now)
  return s.open ? null : `Closed · ${s.label.toLowerCase()}`
}

// A restaurant's full storefront. Used by the public page and, inside a phone
// frame, by the owner's theme editor (`preview`).
export const Storefront = ({
  bundle,
  now,
  cartKey,
  checkoutHref,
  directoryHref,
  table,
  preview,
}: {
  bundle: StorefrontBundle
  now: Date
  // Cart bucket (the slug; previews use their own)
  cartKey: string
  checkoutHref: string
  directoryHref?: string
  table?: string | null
  preview?: boolean
}) => {
  const { restaurant } = bundle
  const festival = festivalOf(restaurant.theme)
  const [open, setOpen] = useState<MenuItem | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const lines = useCartLines(cartKey)
  const addLine = useCart((s) => s.add)
  const pref = useCart((s) => s.prefs[cartKey])
  const setPref = useCart((s) => s.setPref)
  const blocked = orderingBlocked(bundle, now)
  const modes = availableModes(restaurant, table)
  const mode: FulfilmentType | null =
    table && modes.includes('dine-in')
      ? 'dine-in'
      : pref?.fulfilment && modes.includes(pref.fulfilment)
        ? pref.fulfilment
        : (modes[0] ?? null)
  // The bar shows the food; fees appear in the cart sheet and at checkout.
  const priced = useMemo(() => priceOrder(bundle, lines, null, now), [bundle, lines, now])
  const count = lines.reduce((s, l) => s + l.quantity, 0)
  const counts = useMemo(() => {
    const m = new Map<number, number>()
    lines.forEach((l) => m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity))
    return m
  }, [lines])

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(null), 2200)
    return () => clearTimeout(t)
  }, [added])

  const add = (line: Parameters<typeof addLine>[1], name: string) => {
    addLine(cartKey, line)
    setAdded(`${line.quantity} × ${name} added`)
  }

  return (
    <ThemeScope theme={restaurant.theme} className="min-h-full">
      <FestivalBar theme={restaurant.theme} />
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ borderColor: 'var(--e-border)', background: 'color-mix(in srgb, var(--e-bg) 85%, transparent)' }}
      >
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          {directoryHref ? (
            <Link
              href={directoryHref}
              className="flex h-11 w-11 items-center justify-center rounded-full e-focus hover:opacity-80"
              aria-label="All places"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          ) : (
            <span className="w-2" />
          )}
          <BrandMark restaurant={restaurant} size={34} />
          <span className="e-display min-w-0 flex-1 truncate text-lg">{restaurant.name}</span>
          {/* Save this restaurant to the home screen (only on its live page). */}
          <GetAppButton className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold e-focus e-soft" />
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex h-11 items-center gap-2 rounded-full px-3 font-bold e-focus e-soft"
            aria-label={`${restaurant.theme.copy.cart}: ${count} item${count === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="h-5 w-5" style={{ color: 'var(--e-primary-text)' }} />
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        </div>
      </header>

      <div className="relative">
        <Hero restaurant={restaurant} now={now} table={table} />
        {festival && (
          <FestivalSeal
            festival={festival}
            year={sealYear(festival, now)}
            className="pointer-events-none absolute right-3 top-3 z-10 h-[72px] w-[72px] -rotate-[8deg] sm:right-8 sm:top-6 sm:h-24 sm:w-24"
          />
        )}
      </div>
      <InfoStrip restaurant={restaurant} now={now} />
      <OrderMode restaurant={restaurant} table={table} value={mode} onChange={(f) => setPref(cartKey, { fulfilment: f })} />

      {blocked && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <p className="flex items-center gap-2 px-4 py-3 text-sm font-bold e-card" role="status">
            <Moon className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--e-primary-text)' }} aria-hidden />
            {blocked}. You can still browse the menu.
          </p>
        </div>
      )}
      <div className="pt-4">
        <PromoBanner promotions={bundle.promotions} now={now} categories={bundle.categories} />
      </div>
      <MenuView
        bundle={bundle}
        now={now}
        onOpen={setOpen}
        onQuickAdd={(item) => add({ itemId: item.id, quantity: 1, choices: {} }, item.name)}
        cartCounts={counts}
        blocked={blocked}
        stickyOffset={64}
      />

      <RestaurantFooter restaurant={restaurant} now={now} directoryHref={directoryHref} />

      <ItemSheet
        bundle={bundle}
        item={open}
        now={now}
        blocked={blocked}
        onClose={() => setOpen(null)}
        onAdd={(line) => {
          add(line, open?.name ?? 'item')
          setOpen(null)
        }}
      />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        bundle={bundle}
        lines={lines}
        cartKey={cartKey}
        mode={mode}
        now={now}
        checkoutHref={preview ? '#' : checkoutHref}
        blocked={blocked}
      />

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        style={preview ? { position: 'sticky' } : undefined}
      >
        <div className="mx-auto max-w-lg">
          <p aria-live="polite" className="mb-2 flex justify-center">
            {added && (
              <span
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-lg e-card"
                style={{ color: 'var(--e-text)' }}
              >
                <Check className="h-4 w-4" style={{ color: 'var(--e-primary-text)' }} strokeWidth={3} aria-hidden /> {added}
              </span>
            )}
          </p>
          {count > 0 && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="pointer-events-auto flex h-14 w-full items-center gap-3 px-5 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] e-btn"
              style={{ borderRadius: 'var(--e-radius)' }}
            >
              <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-black/20 px-2 text-sm tabular-nums">
                {count}
              </span>
              <span className="flex-1 text-left">View {restaurant.theme.copy.cart.toLowerCase()}</span>
              <span className="tabular-nums">{formatMoney(priced.total, restaurant.currency)}</span>
            </button>
          )}
        </div>
      </div>
    </ThemeScope>
  )
}
