'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowRight,
  BadgePercent,
  Coffee,
  LayoutGrid,
  MapPin,
  Receipt,
  Search,
  Soup,
  Store,
  UtensilsCrossed,
  Wine,
  X,
  Pizza,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCart } from '@/lib/eatery/cart'
import { useDirectory, useNow } from '@/lib/eatery/hooks'
import { openState } from '@/lib/eatery/menu'
import { DIRECTORY_GROUPS, presetFor } from '@/lib/eatery/presets'
import { FONTS } from '@/lib/eatery/theme'
import type { DirectoryEntry, FulfilmentType } from '@/lib/eatery/types'
import { apiErrorMessage } from '@/lib/api-error'
import { RestaurantCard, livePromotion } from '@/components/eatery/restaurant-card'

const GROUP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  'Drinks & bars': Wine,
  'Fast food': Pizza,
  'Cafés & bakeries': Coffee,
  'Local & grills': Soup,
  Restaurants: UtensilsCrossed,
}

const WAYS: { value: FulfilmentType | 'all'; label: string }[] = [
  { value: 'all', label: 'Any way' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'dine-in', label: 'Dine-in' },
]

const SUGGESTIONS = ['Pizza', 'Shawarma', 'Cocktails', 'Coffee', 'Jollof', 'Smoothie', 'Croissant']

type Sort = 'recommended' | 'fastest' | 'name'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Text where a word starts with `q` (any language's letters count as word characters).
const wordStart = (q: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(q)}`, 'iu')

const display = { fontFamily: FONTS.fraunces.family }

const Rail = ({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) => (
  <section className="pt-8" aria-label={title}>
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-2xl text-stone-900" style={display}>
          <Icon className="h-5 w-5 text-amber-600" /> {title}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-stone-500">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
)

export default function EatDirectory() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const now = useNow()
  const { data, isLoading, error, refetch, isFetching } = useDirectory()
  const tickets = useCart((s) => s.tickets)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [way, setWay] = useState<FulfilmentType | 'all'>('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [city, setCity] = useState('all')
  const [sort, setSort] = useState<Sort>('recommended')

  const restaurants = useMemo(() => (data ?? []) as DirectoryEntry[], [data])
  const cities = Array.from(new Set(restaurants.map((r) => r.city))).sort()
  const isOpen = (r: DirectoryEntry) => r.acceptingOrders && openState(r.hours, now).open
  const q = query.trim().toLowerCase()

  // What matched: the place itself, or one of its dishes (shown on the card).
  // Matches the start of a word, so "latte" finds lattes but not a platter.
  const wordRe = q ? wordStart(q) : null
  const match = (r: DirectoryEntry): { ok: boolean; dish?: string } => {
    if (!wordRe) return { ok: true }
    if (wordRe.test(`${r.name} ${r.tagline ?? ''} ${r.city} ${r.address} ${presetFor(r.category).label}`)) return { ok: true }
    const dish = (r.menu ?? []).find((m) => wordRe.test(m))
    return dish ? { ok: true, dish } : { ok: false }
  }

  const filtered = restaurants
    .map((r) => ({ r, m: match(r) }))
    .filter(({ m }) => m.ok)
    .filter(({ r }) => group === 'all' || presetFor(r.category).group === group)
    .filter(({ r }) => way === 'all' || r.fulfilment[way === 'dine-in' ? 'dineIn' : way].enabled)
    .filter(({ r }) => !openOnly || isOpen(r))
    .filter(({ r }) => city === 'all' || r.city === city)
    .sort((a, b) => {
      if (sort === 'name') return a.r.name.localeCompare(b.r.name)
      const open = Number(isOpen(b.r)) - Number(isOpen(a.r))
      if (open) return open
      if (sort === 'fastest')
        return (
          (a.r.fulfilment.delivery.etaMinutes || a.r.fulfilment.pickup.prepMinutes) -
          (b.r.fulfilment.delivery.etaMinutes || b.r.fulfilment.pickup.prepMinutes)
        )
      return Number(!!livePromotion(b.r, now)) - Number(!!livePromotion(a.r, now))
    })

  const filtering = !!q || group !== 'all' || way !== 'all' || openOnly || city !== 'all'
  const deals = restaurants.filter((r) => livePromotion(r, now) && isOpen(r))
  const openCount = restaurants.filter(isOpen).length
  const groups = DIRECTORY_GROUPS.filter((g) => restaurants.some((r) => presetFor(r.category).group === g))
  const nameBySlug = new Map(restaurants.map((r) => [r.slug, r.name]))
  const reset = () => {
    setQuery('')
    setGroup('all')
    setWay('all')
    setOpenOnly(false)
    setCity('all')
  }

  return (
    <main className="min-h-[100dvh] text-stone-900">
      {/* ── Top bar ── */}
      <nav className="sticky top-0 z-30 border-b border-white/10 bg-stone-950/95 text-white backdrop-blur" aria-label="Sellix Eats">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href={`/${locale}/eat`} className="mr-auto text-[15px] font-extrabold tracking-wide">
            sellix <span className="text-amber-300">eats</span>
          </Link>
          {tickets.length > 0 && (
            <a
              href="#recent"
              className="hidden sm:inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Receipt className="h-4 w-4" /> My orders
              <span className="rounded-full bg-amber-300 px-1.5 text-[10px] text-stone-900">{tickets.length}</span>
            </a>
          )}
          <Link
            href={`/${locale}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-3 text-xs font-bold text-white/90 hover:bg-white/10"
          >
            <Store className="h-4 w-4" /> For restaurants
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="relative overflow-hidden bg-stone-950 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-amber-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-[360px] w-[360px] rounded-full bg-rose-500/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-14">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300/90">
            {openCount > 0 ? `${openCount} place${openCount === 1 ? '' : 's'} open now` : 'Order ahead'}
            {cities.length === 1 ? ` · ${cities[0]}` : ''}
          </p>
          <h1 className="mt-3 max-w-3xl text-[42px] leading-[1.02] sm:text-[64px]" style={display}>
            Hungry, thirsty, or just need a <em className="text-amber-300 not-italic">coffee</em>?
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/70 sm:text-lg">
            Bars, kitchens and cafés near you — order for pickup, delivery or right at your table.
          </p>

          <form className="mt-7 max-w-2xl" role="search" onSubmit={(e) => e.preventDefault()}>
            <label className="relative block">
              <span className="sr-only">Search places and dishes</span>
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a place or a dish — “shawarma”, “latte”…"
                className="h-14 w-full rounded-2xl bg-white pl-12 pr-12 text-base text-stone-900 shadow-xl placeholder:text-stone-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Popular searches">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="h-9 rounded-full border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-white/80 hover:bg-white/15 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4">
        {/* ── Kinds of place ── */}
        <div className="-mt-7 relative z-10 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Kind of place">
          {['all', ...groups].map((g) => {
            const Icon = g === 'all' ? LayoutGrid : (GROUP_ICON[g] ?? UtensilsCrossed)
            const count = g === 'all' ? restaurants.length : restaurants.filter((r) => presetFor(r.category).group === g).length
            return (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  'flex min-w-[118px] flex-col items-start gap-2 rounded-2xl border bg-white p-3 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900',
                  group === g ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200 hover:border-stone-400'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl',
                    group === g ? 'bg-stone-900 text-white' : 'bg-amber-50 text-amber-700'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-bold leading-tight text-stone-900">{g === 'all' ? 'Everything' : g}</span>
                <span className="sr-only">
                  , {count} place{count === 1 ? '' : 's'}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Recent orders ── */}
        {tickets.length > 0 && (
          <section id="recent" className="scroll-mt-20 pt-6" aria-labelledby="recent-title">
            <h2 id="recent-title" className="mb-2 text-sm font-extrabold text-stone-700">
              Your recent orders
            </h2>
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {tickets.slice(0, 8).map((t) => (
                <li key={`${t.slug}-${t.code}`}>
                  <Link
                    href={`/${locale}/eat/${t.slug}/order/${t.code}`}
                    className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border border-stone-200 bg-white px-4 text-sm font-bold hover:border-stone-400"
                  >
                    <Receipt className="h-4 w-4 text-stone-500" /> {nameBySlug.get(t.slug) ?? t.slug} · #{t.code}
                    <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Live deals ── */}
        {!filtering && deals.length > 0 && (
          <Rail title="Deals on right now" hint="Happy hours and specials that end soon" icon={BadgePercent}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deals.map((r) => (
                <li key={r.id}>
                  <RestaurantCard restaurant={r} href={`/${locale}/eat/${r.slug}`} now={now} />
                </li>
              ))}
            </ul>
          </Rail>
        )}

        {/* ── All places ── */}
        <section className="pb-16 pt-8" aria-labelledby="all-title">
          <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-stone-200/70 bg-[#FAF7F2]/95 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="all-title" className="mr-auto text-2xl text-stone-900" style={display}>
                {filtering ? `${filtered.length} place${filtered.length === 1 ? '' : 's'}` : 'All places'}
              </h2>
              <div role="radiogroup" aria-label="How you want it" className="inline-flex rounded-full bg-stone-200/70 p-1">
                {WAYS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    role="radio"
                    aria-checked={way === w.value}
                    onClick={() => setWay(w.value)}
                    className={cn(
                      'h-8 rounded-full px-3 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900',
                      way === w.value ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-400' : 'text-stone-600'
                    )}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                  className="h-4 w-4 accent-stone-900"
                />
                Open now
              </label>
              {cities.length > 1 && (
                <label className="inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white pl-3 pr-1 text-xs font-bold text-stone-700">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">City</span>
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="h-8 bg-transparent pr-1 focus:outline-none">
                    <option value="all">All cities</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="inline-flex h-10 items-center rounded-full border border-stone-300 bg-white px-1 text-xs font-bold text-stone-700">
                <span className="sr-only">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-8 bg-transparent px-2 focus:outline-none"
                >
                  <option value="recommended">Recommended</option>
                  <option value="fastest">Fastest</option>
                  <option value="name">A–Z</option>
                </select>
              </label>
            </div>
          </div>

          {error ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
              <p className="font-bold text-rose-800">Couldn’t load places</p>
              <p className="mt-1 text-sm text-rose-700">{apiErrorMessage(error, 'Check your connection and try again.')}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="mt-4 h-11 rounded-full bg-rose-700 px-5 text-sm font-bold text-white disabled:opacity-60"
              >
                Retry
              </button>
            </div>
          ) : isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="overflow-hidden rounded-2xl bg-white">
                  <div className="aspect-[16/10] animate-pulse bg-stone-200/70" />
                  <div className="space-y-2 p-4">
                    <div className="h-6 w-2/3 animate-pulse rounded bg-stone-200/70" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 px-6 py-16 text-center">
              <p className="text-2xl text-stone-900" style={display}>
                {restaurants.length ? 'Nothing matches that' : 'No places yet'}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {restaurants.length ? 'Try another dish or clear the filters.' : 'Check back soon.'}
              </p>
              {filtering && (
                <button type="button" onClick={reset} className="mt-5 h-11 rounded-full bg-stone-900 px-5 text-sm font-bold text-white">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(({ r, m }) => (
                <li key={r.id}>
                  <RestaurantCard restaurant={r} href={`/${locale}/eat/${r.slug}`} now={now} matched={m.dish} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[15px] font-extrabold tracking-wide">
              sellix <span className="text-amber-600">eats</span>
            </p>
            <p className="mt-2 max-w-sm text-sm text-stone-500">
              Every place here runs on Sellix — menus are live from their kitchens, prices are set by them, and your order goes straight to
              their counter.
            </p>
          </div>
          <div className="rounded-2xl bg-stone-950 p-5 text-white">
            <p className="text-xl" style={display}>
              Run a bar, café or kitchen?
            </p>
            <p className="mt-1 text-sm text-white/70">Get your own branded menu, counter POS and online orders in minutes.</p>
            <Link
              href={`/${locale}`}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-extrabold text-stone-900 hover:bg-amber-200"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <p className="border-t border-stone-100 py-4 text-center text-xs text-stone-400">
          © Sellix · Alcohol is only sold to guests 18 and over.
        </p>
      </footer>
    </main>
  )
}
