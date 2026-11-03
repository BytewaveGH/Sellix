'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { MapPin, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api-error'
import { usePublicSite } from '@/app/[locale]/(real-estate)/real-estate/_logics/public-hooks'
import { sitePath, type PublicListing } from '@/app/[locale]/(real-estate)/real-estate/_logics/site'
import { ContactButtons, ListingCard, Photo, SiteFooter, SiteHeader, SiteState } from '../_components/site'

type Kind = 'all' | 'long-term' | 'short-stay'
type Beds = 'any' | '1' | '2' | '3'
type Sort = 'soonest' | 'cheapest' | 'dearest'

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
          value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
)

export default function RentalsHome() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const slug = decodeURIComponent(String(params?.slug ?? ''))
  const { data, isLoading, error, refetch, isFetching } = usePublicSite(slug)

  const [kind, setKind] = useState<Kind>('all')
  const [area, setArea] = useState('all')
  const [beds, setBeds] = useState<Beds>('any')
  const [nowOnly, setNowOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('soonest')

  useEffect(() => {
    if (data) document.title = `${data.site.name || 'Rooms to rent'} · ${data.site.tagline || 'available now'}`
  }, [data])

  const propertyById = useMemo(() => new Map((data?.properties ?? []).map((p) => [p.id, p])), [data])
  const listings = data?.listings ?? []
  const hasBoth = listings.some((l) => l.rentalMode === 'long-term') && listings.some((l) => l.rentalMode === 'short-stay')
  // Filter by city when there are several, else by building.
  const cities = Array.from(new Set((data?.properties ?? []).map((p) => p.city).filter(Boolean))).sort()
  const byCity = cities.length > 1
  const areas = byCity
    ? cities.map((c) => ({ value: c, label: c }))
    : (data?.properties ?? []).map((p) => ({ value: String(p.id), label: p.name }))

  const inArea = (l: PublicListing) =>
    area === 'all' || (byCity ? propertyById.get(l.propertyId)?.city === area : String(l.propertyId) === area)
  const shown = listings
    .filter((l) => kind === 'all' || l.rentalMode === kind)
    .filter(inArea)
    .filter((l) => beds === 'any' || (beds === '3' ? l.bedrooms >= 3 : l.bedrooms === Number(beds)))
    .filter((l) => !nowOnly || l.availability.state === 'now')
    .sort((a, b) => (sort === 'soonest' ? 0 : ((a.price ?? Infinity) - (b.price ?? Infinity)) * (sort === 'cheapest' ? 1 : -1) || 0))
  const filtering = kind !== 'all' || area !== 'all' || beds !== 'any' || nowOnly
  const freeNow = listings.filter((l) => l.availability.state === 'now').length
  const hero = data?.site.coverUrl ?? data?.properties.find((p) => p.photos.length)?.photos[0]

  if (isLoading) {
    return (
      <div aria-busy="true">
        <div className="h-16 border-b border-stone-200 bg-white" />
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="h-56 animate-pulse rounded-3xl bg-stone-200/70" />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-stone-200/70" />
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <SiteState
        alert
        title="Couldn’t load this page"
        body={apiErrorMessage(error, 'Check your connection and try again.')}
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="h-11 rounded-full bg-stone-900 px-5 text-sm font-bold text-white disabled:opacity-60"
          >
            Try again
          </button>
        }
      />
    )
  }
  if (!data) {
    return <SiteState title="This page isn’t available" body="The link may be old, or the owner has taken the page down for now." />
  }

  const { site } = data
  return (
    <>
      <SiteHeader site={site} locale={locale} slug={slug} />

      {/* ── Hero ── */}
      <header className="mx-auto max-w-6xl px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-stone-900 text-white">
          {hero && <Photo src={hero} alt="" className="absolute inset-0 h-full w-full opacity-45" />}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" aria-hidden />
          <div className="relative px-6 py-10 sm:px-10 sm:py-16">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              {freeNow > 0 ? `${freeNow} free now` : listings.length ? `${listings.length} coming up` : 'Fully let right now'}
              {cities.length === 1 ? ` · ${cities[0]}` : ''}
            </p>
            <h1 className="mt-4 max-w-2xl text-[34px] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              {site.tagline || 'Rooms and apartments to rent'}
            </h1>
            {site.name && <p className="mt-3 text-base text-white/80 sm:text-lg">{site.name}</p>}
            <ContactButtons
              site={site}
              size="lg"
              className="mt-6"
              message={`Hello${site.name ? ` ${site.name}` : ''}, I’m looking for a place to rent. What do you have available?`}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* ── Filters ── */}
        <div className="z-20 -mx-4 mt-6 sm:sticky sm:top-16 border-b border-stone-200/70 bg-[#F7F7F5]/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-xl font-extrabold text-stone-900">
              {filtering ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : 'Available'}
            </h2>
            {hasBoth && (
              <Chips
                label="Kind of stay"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'long-term', label: 'Monthly rent' },
                  { value: 'short-stay', label: 'Short stays' },
                ]}
              />
            )}
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
            {areas.length > 1 && (
              <label className="inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white pl-3 pr-1 text-xs font-bold text-stone-700">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{byCity ? 'Area' : 'Property'}</span>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="h-8 max-w-[160px] bg-transparent pr-1 focus:outline-none"
                >
                  <option value="all">{byCity ? 'All areas' : 'All properties'}</option>
                  {areas.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
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
            {site.showPrices && (
              <label className="inline-flex h-10 items-center rounded-full border border-stone-300 bg-white px-1 text-xs font-bold text-stone-700">
                <span className="sr-only">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-8 bg-transparent px-2 focus:outline-none"
                >
                  <option value="soonest">Soonest free</option>
                  <option value="cheapest">Lowest price</option>
                  <option value="dearest">Highest price</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {/* ── Listings ── */}
        {shown.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <SearchX className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-xl font-extrabold text-stone-900">
              {listings.length ? 'Nothing matches that' : 'Everything is let right now'}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {listings.length ? 'Try fewer filters.' : 'Send a message and we’ll tell you when something comes up.'}
            </p>
            {filtering ? (
              <button
                type="button"
                onClick={() => {
                  setKind('all')
                  setArea('all')
                  setBeds('any')
                  setNowOnly(false)
                }}
                className="mt-5 h-11 rounded-full bg-stone-900 px-5 text-sm font-bold text-white"
              >
                Clear filters
              </button>
            ) : (
              <ContactButtons
                site={site}
                className="mt-5 justify-center"
                message={`Hello${site.name ? ` ${site.name}` : ''}, please let me know when a room is free.`}
              />
            )}
          </div>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => (
              <li key={l.id}>
                <ListingCard listing={l} property={propertyById.get(l.propertyId)} href={sitePath(locale, slug, l.id)} />
              </li>
            ))}
          </ul>
        )}

        {(site.about || site.rentTerms) && (
          <section className="mt-12 grid gap-4 rounded-3xl bg-white p-6 sm:grid-cols-[1.5fr_1fr] sm:p-8" aria-label="About">
            {site.about && (
              <div>
                <h2 className="text-xl font-extrabold text-stone-900">About {site.name || 'us'}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">{site.about}</p>
              </div>
            )}
            {site.rentTerms && (
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Rent terms</p>
                <p className="mt-1 text-sm font-semibold text-stone-800">{site.rentTerms}</p>
              </div>
            )}
          </section>
        )}
      </main>

      <SiteFooter site={site} showAbout={false} />
    </>
  )
}
