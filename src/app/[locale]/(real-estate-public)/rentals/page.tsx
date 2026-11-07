'use client'

// Sellix Homes: free rooms and short stays from every landlord on Sellix who
// has published a website and chosen to be listed here.

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowRight, Building2, MapPin, Search, SearchX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api-error'
import { SellixLogo } from '@/components/brand/sellix-logo'
import { useRentalsDirectory } from '@/app/[locale]/(real-estate)/real-estate/_logics/public-hooks'
import { sitePath, type DirectoryListing } from '@/app/[locale]/(real-estate)/real-estate/_logics/site'
import { money } from '@/app/[locale]/(real-estate)/real-estate/_logics/format'
import { accentStyle, ListingCard } from './_components/site'

type Kind = 'all' | 'long-term' | 'short-stay'
type Beds = 'any' | '1' | '2' | '3'
type Sort = 'soonest' | 'cheapest'

// Budgets per month (rooms) and per night (short stays).
const BUDGETS: Record<Exclude<Kind, 'all'>, number[]> = {
  'long-term': [300, 600, 1000, 2000, 5000],
  'short-stay': [200, 400, 700, 1200],
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Matches the start of a word, so "east" finds "East Legon" but not "Breast…".
const wordStart = (q: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(q)}`, 'iu')

const haystack = (e: DirectoryListing) =>
  [e.listing.typeName, e.property?.name, e.property?.city, e.property?.region, e.property?.address, e.business.name, ...e.listing.amenities]
    .filter(Boolean)
    .join(' ')

const Chips = <T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-stone-200/70 p-1">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        onClick={() => onChange(o.value)}
        className={cn(
          'h-8 whitespace-nowrap rounded-full px-3 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900',
          value === o.value ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-400' : 'text-stone-600'
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
)

export default function SellixHomes() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const { data, isLoading, error, refetch, isFetching } = useRentalsDirectory()

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [beds, setBeds] = useState<Beds>('any')
  const [budget, setBudget] = useState(0)
  const [nowOnly, setNowOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('soonest')

  useEffect(() => {
    document.title = 'Sellix Homes · rooms and apartments to rent'
  }, [])

  const entries = useMemo(() => data ?? [], [data])
  const cities = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of entries) if (e.property?.city) n.set(e.property.city, (n.get(e.property.city) ?? 0) + 1)
    return Array.from(n.entries()).sort((a, b) => b[1] - a[1])
  }, [entries])
  const landlords = new Set(entries.map((e) => e.slug)).size
  const freeNow = entries.filter((e) => e.listing.availability.state === 'now').length

  const q = query.trim()
  const re = q ? wordStart(q) : null
  const shown = entries
    .filter((e) => !re || re.test(haystack(e)))
    .filter((e) => kind === 'all' || e.listing.rentalMode === kind)
    .filter((e) => beds === 'any' || (beds === '3' ? e.listing.bedrooms >= 3 : e.listing.bedrooms === Number(beds)))
    .filter((e) => !budget || (e.listing.price !== null && e.listing.price <= budget))
    .filter((e) => !nowOnly || e.listing.availability.state === 'now')
    .sort((a, b) => {
      if (sort === 'cheapest') return (a.listing.price ?? Infinity) - (b.listing.price ?? Infinity) || 0
      const day = (e: DirectoryListing) => (e.listing.availability.state === 'now' ? '' : e.listing.availability.date)
      return day(a).localeCompare(day(b))
    })
  const filtering = !!q || kind !== 'all' || beds !== 'any' || !!budget || nowOnly
  const reset = () => {
    setQuery('')
    setKind('all')
    setBeds('any')
    setBudget(0)
    setNowOnly(false)
  }

  return (
    <div style={accentStyle('#3b3ff5')}>
      {/* ── Top bar ── */}
      <nav className="sticky top-0 z-30 border-b border-white/10 bg-stone-950/95 text-white backdrop-blur" aria-label="Sellix Homes">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href={`/${locale}/rentals`} className="mr-auto flex items-center gap-1.5" aria-label="Sellix Homes">
            <SellixLogo size={26} tone="white" />
            <span className="text-[17px] font-extrabold text-sky-300">homes</span>
          </Link>
          <Link
            href={`/${locale}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-3 text-xs font-bold text-white/90 hover:bg-white/10"
          >
            <Building2 className="h-4 w-4" /> For landlords
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="relative overflow-hidden bg-stone-950 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-indigo-500/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-[360px] w-[360px] rounded-full bg-cyan-400/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-14">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-300/90">
            {freeNow > 0 ? `${freeNow} place${freeNow === 1 ? '' : 's'} free now` : 'Rooms, flats and short stays'}
            {landlords > 0 ? ` · ${landlords} landlord${landlords === 1 ? '' : 's'}` : ''}
          </p>
          <h1 className="mt-3 max-w-3xl text-[40px] font-extrabold leading-[1.03] tracking-tight sm:text-[60px]">
            Find your next <span className="text-sky-300">room</span> — straight from the landlord.
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/70 sm:text-lg">
            Real vacancies, updated as tenants move out. Message the owner on WhatsApp, or request a short stay.
          </p>

          <form className="mt-7 max-w-2xl" role="search" onSubmit={(e) => e.preventDefault()}>
            <label className="relative block">
              <span className="sr-only">Search by area, city or kind of room</span>
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Area, city or room — “Kumasi”, “chamber & hall”…"
                className="h-14 w-full rounded-2xl bg-white pl-12 pr-12 text-base text-stone-900 shadow-xl placeholder:text-stone-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/60"
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
            {cities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Popular areas">
                {cities.slice(0, 8).map(([city, n]) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setQuery(city)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-white/80 hover:bg-white/15 hover:text-white"
                  >
                    <MapPin className="h-3.5 w-3.5" /> {city} <span className="text-white/50">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* ── Filters ── */}
        <div className="z-20 -mx-4 border-b border-stone-200/70 bg-[#F7F7F5]/95 px-4 py-3 backdrop-blur sm:sticky sm:top-14">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-xl font-extrabold text-stone-900">
              {filtering ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : 'Available now and soon'}
            </h2>
            <Chips
              label="Kind of stay"
              value={kind}
              onChange={(k) => {
                setKind(k)
                setBudget(0)
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'long-term', label: 'Monthly rent' },
                { value: 'short-stay', label: 'Short stays' },
              ]}
            />
            <Chips
              label="Bedrooms"
              value={beds}
              onChange={setBeds}
              options={[
                { value: 'any', label: 'Any size' },
                { value: '1', label: '1 bed' },
                { value: '2', label: '2 beds' },
                { value: '3', label: '3+' },
              ]}
            />
            {kind !== 'all' && (
              <label className="inline-flex h-10 items-center rounded-full border border-stone-300 bg-white px-1 text-xs font-bold text-stone-700">
                <span className="sr-only">Budget</span>
                <select
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="h-8 bg-transparent px-2 focus:outline-none"
                >
                  <option value={0}>Any budget</option>
                  {BUDGETS[kind].map((b) => (
                    <option key={b} value={b}>
                      Up to {money(b)} / {kind === 'short-stay' ? 'night' : 'month'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700">
              <input
                type="checkbox"
                checked={nowOnly}
                onChange={(e) => setNowOnly(e.target.checked)}
                className="h-4 w-4 accent-stone-900"
              />
              Free now
            </label>
            <label className="inline-flex h-10 items-center rounded-full border border-stone-300 bg-white px-1 text-xs font-bold text-stone-700">
              <span className="sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 bg-transparent px-2 focus:outline-none">
                <option value="soonest">Soonest free</option>
                <option value="cheapest">Lowest price</option>
              </select>
            </label>
          </div>
        </div>

        {/* ── Results ── */}
        {error ? (
          <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
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
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-stone-200/70" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
            <SearchX className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-2xl font-extrabold text-stone-900">
              {entries.length ? 'Nothing matches that' : 'No places listed yet'}
            </p>
            <p className="mt-1 text-sm text-stone-500">{entries.length ? 'Try another area or fewer filters.' : 'Check back soon.'}</p>
            {filtering && (
              <button type="button" onClick={reset} className="mt-5 h-11 rounded-full bg-stone-900 px-5 text-sm font-bold text-white">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((e) => (
              <li key={`${e.slug}-${e.listing.id}`}>
                <ListingCard
                  listing={e.listing}
                  property={e.property}
                  business={e.business}
                  href={sitePath(locale, e.slug, e.listing.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="mt-16 border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="flex items-center gap-1.5">
              <SellixLogo size={22} />
              <span className="text-[15px] font-extrabold text-indigo-600">homes</span>
            </p>
            <p className="mt-2 max-w-sm text-sm text-stone-500">
              Every place here comes from a landlord’s own Sellix account — what’s free, the price and the photos are theirs, and your
              message goes straight to them. Never pay anyone before you’ve seen the place.
            </p>
          </div>
          <div className="rounded-2xl bg-stone-950 p-5 text-white">
            <p className="text-xl font-extrabold">Own rooms or apartments?</p>
            <p className="mt-1 text-sm text-white/70">
              Track tenants and rent, and list your vacancies here — they update as tenants move out.
            </p>
            <Link
              href={`/${locale}`}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-sky-300 px-5 text-sm font-extrabold text-stone-900 hover:bg-sky-200"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <p className="border-t border-stone-100 py-4 text-center text-xs text-stone-400">© Sellix</p>
      </footer>
    </div>
  )
}
