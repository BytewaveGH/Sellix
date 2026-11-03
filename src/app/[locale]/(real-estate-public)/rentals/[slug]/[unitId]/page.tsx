'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, BedDouble, CalendarDays, CheckCircle2, MapPin, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api-error'
import { usePublicSite, useBookingRequest } from '@/app/[locale]/(real-estate)/real-estate/_logics/public-hooks'
import { bookingNights, layoutLabel } from '@/app/[locale]/(real-estate)/real-estate/_logics/calc'
import { dayMonth, money } from '@/app/[locale]/(real-estate)/real-estate/_logics/format'
import { propertyTypeLabel } from '@/app/[locale]/(real-estate)/real-estate/_logics/constants'
import {
  bookingRequestProblem,
  enquiryText,
  listingPhotos,
  sitePath,
  type PublicListing,
  type PublicSite,
} from '@/app/[locale]/(real-estate)/real-estate/_logics/site'
import { FacilityList } from '@/app/[locale]/(real-estate)/real-estate/_components/facilities'
import {
  AvailabilityBadge,
  ContactButtons,
  ListingCard,
  Photo,
  priceLabel,
  SiteFooter,
  SiteHeader,
  SiteState,
} from '../../_components/site'

const Gallery = ({ photos, alt }: { photos: string[]; alt: string }) => {
  const [i, setI] = useState(0)
  const current = photos[Math.min(i, Math.max(photos.length - 1, 0))]
  return (
    <div>
      <div className="aspect-[16/10] overflow-hidden rounded-3xl bg-stone-100">
        <Photo src={current} alt={alt} className="h-full w-full" />
      </div>
      {photos.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Photos">
          {photos.map((p, n) => (
            <li key={`${n}-${p.slice(-16)}`} className="flex-shrink-0">
              <button
                type="button"
                onClick={() => setI(n)}
                aria-label={`Photo ${n + 1} of ${photos.length}`}
                aria-current={n === i}
                className={cn(
                  'block h-16 w-24 overflow-hidden rounded-xl ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  n === i ? 'ring-2 ring-[var(--accent)]' : 'opacity-75 hover:opacity-100'
                )}
              >
                <Photo src={p} alt="" className="h-full w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const inputClass =
  'h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 sm:text-sm'

const BookingForm = ({ listing, site, slug, on }: { listing: PublicListing; site: PublicSite['site']; slug: string; on: string }) => {
  const send = useBookingRequest(slug)
  const [f, setF] = useState({ checkIn: '', checkOut: '', guests: 1, name: '', phone: '', note: '' })
  const [tried, setTried] = useState(false)
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }))
  const request = { unitId: listing.id, ...f }
  const problem = bookingRequestProblem(request, listing, on)
  const nights = f.checkIn && f.checkOut > f.checkIn ? bookingNights(f) : 0

  if (send.isSuccess) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-5 text-center" role="status">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="mt-2 font-extrabold text-emerald-900">Request sent</p>
        <p className="mt-1 text-sm text-emerald-800">
          {site.name || 'The host'} will confirm your stay on {f.phone}. Nothing is booked or paid until they do.
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!problem) send.mutate(request)
      }}
      noValidate
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-stone-600">
          Arrive
          <input
            type="date"
            min={on}
            value={f.checkIn}
            onChange={(e) => set('checkIn', e.target.value)}
            className={cn(inputClass, 'mt-1')}
          />
        </label>
        <label className="text-xs font-bold text-stone-600">
          Leave
          <input
            type="date"
            min={f.checkIn || on}
            value={f.checkOut}
            onChange={(e) => set('checkOut', e.target.value)}
            className={cn(inputClass, 'mt-1')}
          />
        </label>
      </div>
      <label className="block text-xs font-bold text-stone-600">
        Guests
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={listing.maxGuests || undefined}
          value={f.guests}
          onChange={(e) => set('guests', Number(e.target.value))}
          className={cn(inputClass, 'mt-1')}
        />
      </label>
      <label className="block text-xs font-bold text-stone-600">
        Your name
        <input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className={cn(inputClass, 'mt-1')} />
      </label>
      <label className="block text-xs font-bold text-stone-600">
        Phone (WhatsApp)
        <input
          type="tel"
          value={f.phone}
          onChange={(e) => set('phone', e.target.value)}
          autoComplete="tel"
          placeholder="024 123 4567"
          className={cn(inputClass, 'mt-1')}
        />
      </label>
      <label className="block text-xs font-bold text-stone-600">
        Message <span className="font-normal text-stone-400">(optional)</span>
        <textarea
          value={f.note}
          onChange={(e) => set('note', e.target.value)}
          rows={2}
          className={cn(inputClass, 'mt-1 h-auto py-2')}
          placeholder="Arrival time, questions…"
        />
      </label>

      {nights > 0 && listing.price !== null && (
        <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
          <span className="text-stone-600">
            {nights} night{nights === 1 ? '' : 's'} × {money(listing.price)}
          </span>
          <span className="font-extrabold text-stone-900">{money(nights * listing.price)}</span>
        </div>
      )}
      {((tried && problem) || send.error) && (
        <p role="alert" className="text-sm font-semibold text-rose-600">
          {problem ?? apiErrorMessage(send.error, 'Couldn’t send your request. Try again.')}
        </p>
      )}
      <button
        type="submit"
        disabled={send.isPending}
        className="h-12 w-full rounded-full text-sm font-extrabold text-white hover:brightness-110 disabled:opacity-60"
        style={{ background: 'var(--accent)' }}
      >
        {send.isPending ? 'Sending…' : 'Request to book'}
      </button>
      <p className="text-center text-[11px] text-stone-500">No payment now — the host confirms first.</p>
    </form>
  )
}

export default function ListingPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const slug = decodeURIComponent(String(params?.slug ?? ''))
  const unitId = Number(params?.unitId)
  const { data, isLoading, error, refetch, isFetching } = usePublicSite(slug)
  const [url, setUrl] = useState('')
  useEffect(() => setUrl(window.location.href), [])

  const listing = data?.listings.find((l) => l.id === unitId)
  const property = listing ? data?.properties.find((p) => p.id === listing.propertyId) : undefined

  useEffect(() => {
    if (listing && data) document.title = `${listing.typeName} · ${property?.name ?? ''} · ${data.site.name || 'to rent'}`
  }, [listing, property, data])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8" aria-busy="true">
        <div className="aspect-[16/10] max-w-3xl animate-pulse rounded-3xl bg-stone-200/70" />
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
  if (!data)
    return <SiteState title="This page isn’t available" body="The link may be old, or the owner has taken the page down for now." />
  if (!listing) {
    return (
      <>
        <SiteHeader site={data.site} locale={locale} slug={slug} />
        <SiteState
          title="This one has been taken"
          body="It’s no longer available — have a look at what else is free."
          action={
            <Link href={sitePath(locale, slug)} className="h-11 rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">
              See what’s available
            </Link>
          }
        />
      </>
    )
  }

  const { site } = data
  const photos = listingPhotos(listing, property)
  const shortStay = listing.rentalMode === 'short-stay'
  const more = data.listings.filter((l) => l.propertyId === listing.propertyId && l.id !== listing.id).slice(0, 3)
  const where = [property?.address, property?.city, property?.region].filter(Boolean).join(', ')

  return (
    <>
      <SiteHeader site={site} locale={locale} slug={slug} />
      <main className="mx-auto max-w-6xl px-4 pb-6 pt-5">
        <Link
          href={sitePath(locale, slug)}
          className="inline-flex h-10 items-center gap-1.5 text-sm font-bold text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" /> All listings
        </Link>

        <div className="mt-2 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0">
            <Gallery photos={photos} alt={`${listing.typeName}, ${property?.name ?? ''}`} />

            <div className="mt-6">
              <AvailabilityBadge listing={listing} />
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900">{listing.typeName}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-stone-600">
                <MapPin className="h-4 w-4 flex-shrink-0 text-stone-400" />
                {property?.name}
                {where ? ` · ${where}` : ''}
              </p>
            </div>

            <ul className="mt-5 flex flex-wrap gap-2 text-sm font-semibold text-stone-700">
              <li className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
                <BedDouble className="h-4 w-4 text-stone-400" /> {layoutLabel(listing)}
              </li>
              {shortStay && listing.maxGuests > 0 && (
                <li className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
                  <Users className="h-4 w-4 text-stone-400" /> Sleeps {listing.maxGuests}
                </li>
              )}
              {property && (
                <li className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
                  {propertyTypeLabel(property.type)}
                </li>
              )}
            </ul>

            {listing.facilities && (
              <section className="mt-7" aria-labelledby="fac">
                <h2 id="fac" className="text-lg font-extrabold text-stone-900">
                  Facilities
                </h2>
                <div className="mt-3">
                  <FacilityList facilities={listing.facilities} />
                </div>
              </section>
            )}
            {listing.amenities.length > 0 && (
              <section className="mt-6" aria-labelledby="ame">
                <h2 id="ame" className="text-lg font-extrabold text-stone-900">
                  Also has
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {listing.amenities.map((a) => (
                    <li key={a} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(listing.description || property?.description) && (
              <section className="mt-7" aria-labelledby="desc">
                <h2 id="desc" className="text-lg font-extrabold text-stone-900">
                  About this place
                </h2>
                {listing.description && <p className="mt-2 whitespace-pre-line text-stone-700">{listing.description}</p>}
                {property?.description && <p className="mt-2 whitespace-pre-line text-stone-700">{property.description}</p>}
              </section>
            )}
            {shortStay && listing.booked.length > 0 && (
              <section className="mt-7" aria-labelledby="taken">
                <h2 id="taken" className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
                  <CalendarDays className="h-5 w-5 text-stone-400" /> Already booked
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {listing.booked.slice(0, 12).map((b) => (
                    <li key={b.from} className="rounded-lg bg-stone-200/70 px-2.5 py-1 text-xs font-semibold text-stone-700">
                      {dayMonth(b.from)} – {dayMonth(b.to)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ── Price & contact ── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
              <p className="text-2xl font-extrabold" style={{ color: listing.price === null ? undefined : 'var(--accent)' }}>
                {priceLabel(listing)}
              </p>
              {!shortStay && site.rentTerms && <p className="mt-1 text-sm text-stone-600">{site.rentTerms}</p>}
              <div className="mt-5">
                {shortStay ? (
                  <BookingForm listing={listing} site={site} slug={slug} on={data.on} />
                ) : (
                  <>
                    <p className="mb-3 text-sm text-stone-600">Ask about it or arrange a viewing:</p>
                    <ContactButtons site={site} size="lg" message={enquiryText(listing, property, site.name, url)} />
                    {!site.phone && !site.whatsapp && !site.email && <p className="text-sm text-stone-500">Contact details coming soon.</p>}
                  </>
                )}
              </div>
              {shortStay && (site.phone || site.whatsapp) && (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <p className="mb-2 text-xs font-semibold text-stone-500">Questions first?</p>
                  <ContactButtons site={site} message={enquiryText(listing, property, site.name, url)} />
                </div>
              )}
            </div>
          </aside>
        </div>

        {more.length > 0 && (
          <section className="mt-14" aria-labelledby="more">
            <h2 id="more" className="text-xl font-extrabold text-stone-900">
              More at {property?.name}
            </h2>
            <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((l) => (
                <li key={l.id}>
                  <ListingCard listing={l} property={property} href={sitePath(locale, slug, l.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter site={site} />
    </>
  )
}
