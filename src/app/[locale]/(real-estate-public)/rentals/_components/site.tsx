'use client'

/* eslint-disable @next/next/no-img-element -- owner-uploaded photos (any host, or data URLs) */
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { BedDouble, CalendarClock, Home, Mail, MessageCircle, Phone, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { layoutLabel } from '@/app/[locale]/(real-estate)/real-estate/_logics/calc'
import { money, shortDate } from '@/app/[locale]/(real-estate)/real-estate/_logics/format'
import { whatsAppLink } from '@/app/[locale]/(real-estate)/real-estate/_logics/share'
import {
  listingPhotos,
  sitePath,
  type PublicListing,
  type PublicProperty,
  type PublicSite,
} from '@/app/[locale]/(real-estate)/real-estate/_logics/site'
import { FacilitySummaryPill } from '@/app/[locale]/(real-estate)/real-estate/_components/facilities'
import { SellixLogo } from '@/components/brand/sellix-logo'

// The site's colour, as a CSS variable every accent below reads.
export const accentStyle = (accent: string) => ({ ['--accent' as string]: accent }) as React.CSSProperties

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

// Browser-tab icon: the business's logo, or its initials on its colour.
export const useSiteFavicon = (site: PublicSite['site'] | undefined) => {
  useEffect(() => {
    if (!site) return
    const link = document.createElement('link')
    link.rel = 'icon'
    link.dataset.site = 'rentals'
    document.head.appendChild(link)
    if (site.logoUrl) {
      link.href = site.logoUrl
      return () => link.remove()
    }
    const text = (initialsOf(site.name) || 'R').replace(/[<>&'"]/g, '')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${site.accent}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${text.length > 1 ? 28 : 34}" fill="#fff">${text}</text></svg>`
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    return () => link.remove()
  }, [site])
}

export const priceLabel = (l: Pick<PublicListing, 'price' | 'rentalMode'>) =>
  l.price === null ? 'Ask for price' : `${money(l.price)} / ${l.rentalMode === 'short-stay' ? 'night' : 'month'}`

export const availabilityLabel = (l: PublicListing) =>
  l.availability.state === 'now'
    ? l.rentalMode === 'short-stay'
      ? 'Free tonight'
      : 'Available now'
    : l.rentalMode === 'short-stay'
      ? `Free from ${shortDate(l.availability.date)}`
      : `Available ${shortDate(l.availability.date)}`

export const AvailabilityBadge = ({ listing, className }: { listing: PublicListing; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
      listing.availability.state === 'now' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-stone-900',
      className
    )}
  >
    {listing.availability.state === 'now' ? <Sparkles className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
    {availabilityLabel(listing)}
  </span>
)

// A photo that falls back to a plain tile if the link is broken.
export const Photo = ({ src, alt, className }: { src?: string; alt: string; className?: string }) => {
  const [failed, setFailed] = useState(false)
  if (src && !failed)
    return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('object-cover', className)} />
  return (
    <div className={cn('flex items-center justify-center bg-stone-100 text-stone-300', className)} aria-hidden>
      <Home className="h-10 w-10" strokeWidth={1.5} />
    </div>
  )
}

export const ListingCard = ({
  listing,
  property,
  href,
  business,
}: {
  listing: PublicListing
  property?: PublicProperty
  href: string
  // On the directory: whose room it is.
  business?: { name: string; accent: string; logoUrl?: string }
}) => {
  const photos = listingPhotos(listing, property)
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Photo
          src={photos[0]}
          alt={`${listing.typeName}, ${property?.name ?? ''}`}
          className="h-full w-full transition duration-300 group-hover:scale-[1.03]"
        />
        <AvailabilityBadge listing={listing} className="absolute left-3 top-3 shadow" />
        {photos.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
            {photos.length} photos
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-lg font-extrabold text-stone-900" style={{ color: listing.price === null ? undefined : 'var(--accent)' }}>
          {priceLabel(listing)}
        </p>
        <p className="mt-0.5 font-bold text-stone-900">{listing.typeName}</p>
        <p className="text-sm text-stone-500">
          {property?.name}
          {property?.city ? ` · ${property.city}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-stone-600">
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5">
            <BedDouble className="h-3 w-3" /> {layoutLabel(listing)}
          </span>
          {listing.facilities && <FacilitySummaryPill facilities={listing.facilities} />}
          {listing.rentalMode === 'short-stay' && listing.maxGuests > 0 && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Sleeps {listing.maxGuests}</span>
          )}
        </div>
        {business && (
          <p className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-xs font-semibold text-stone-600">
            <BusinessMark business={business} className="h-6 w-6 rounded-lg text-[10px]" />
            <span className="truncate">{business.name || 'Private landlord'}</span>
          </p>
        )}
      </div>
    </Link>
  )
}

export const contactNumber = (site: PublicSite['site']) => site.whatsapp || site.phone

export const ContactButtons = ({
  site,
  message,
  className,
  size = 'md',
}: {
  site: PublicSite['site']
  message: string
  className?: string
  size?: 'md' | 'lg'
}) => {
  const wa = contactNumber(site)
  const base = cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-bold',
    size === 'lg' ? 'h-12 px-5 text-sm' : 'h-10 px-4 text-sm'
  )
  if (!wa && !site.phone && !site.email) return null
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {wa && (
        <a
          href={whatsAppLink(message, wa)}
          target="_blank"
          rel="noreferrer"
          className={cn(base, 'bg-[#25D366] text-white hover:brightness-95')}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      )}
      {site.phone && (
        <a
          href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}
          className={cn(base, 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50')}
        >
          <Phone className="h-4 w-4" /> Call
        </a>
      )}
      {!wa && !site.phone && site.email && (
        <a href={`mailto:${site.email}`} className={cn(base, 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50')}>
          <Mail className="h-4 w-4" /> Email
        </a>
      )}
    </div>
  )
}

// The business's logo, or its initials on its colour.
export const BusinessMark = ({
  business,
  className,
}: {
  business: { name: string; accent: string; logoUrl?: string }
  className?: string
}) => {
  const [failed, setFailed] = useState(false)
  if (business.logoUrl && !failed)
    return (
      <img
        src={business.logoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={cn('flex-shrink-0 rounded-xl bg-white object-cover', className ?? 'h-9 w-9')}
      />
    )
  return (
    <span
      className={cn('flex flex-shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white', className ?? 'h-9 w-9')}
      style={{ background: business.accent }}
      aria-hidden
    >
      {initialsOf(business.name) || <Home className="h-4 w-4" />}
    </span>
  )
}

export const SiteHeader = ({ site, locale, slug }: { site: PublicSite['site']; locale: string; slug: string }) => (
  <nav className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/90 backdrop-blur" aria-label={site.name || 'Rentals'}>
    <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
      <Link href={sitePath(locale, slug)} className="mr-auto flex min-w-0 items-center gap-2.5">
        <BusinessMark business={site} />
        <span className="truncate text-[15px] font-extrabold text-stone-900">{site.name || 'Rooms to rent'}</span>
      </Link>
      {site.phone && (
        <a
          href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}
          className="hidden h-10 items-center gap-1.5 rounded-full border border-stone-300 px-4 text-xs font-bold text-stone-800 hover:bg-stone-50 sm:inline-flex"
        >
          <Phone className="h-3.5 w-3.5" /> {site.phone}
        </a>
      )}
      {contactNumber(site) && (
        <a
          href={whatsAppLink(`Hello${site.name ? ` ${site.name}` : ''}, I’m looking for a place to rent.`, contactNumber(site))}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-xs font-bold text-white hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      )}
    </div>
  </nav>
)

// `showAbout` off where the page already has an About section.
export const SiteFooter = ({ site, showAbout = true }: { site: PublicSite['site']; showAbout?: boolean }) => (
  <footer className="mt-16 border-t border-stone-200 bg-white">
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-[1.5fr_1fr]">
      <div>
        <p className="text-lg font-extrabold text-stone-900">{site.name || 'Rooms to rent'}</p>
        {showAbout && site.about && <p className="mt-2 max-w-xl whitespace-pre-line text-sm text-stone-600">{site.about}</p>}
      </div>
      <div className="space-y-1.5 text-sm text-stone-600">
        {site.phone && (
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-stone-400" /> {site.phone}
          </p>
        )}
        {site.whatsapp && site.whatsapp !== site.phone && (
          <p className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-stone-400" /> {site.whatsapp}
          </p>
        )}
        {site.email && (
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-stone-400" />
            <a href={`mailto:${site.email}`} className="underline-offset-2 hover:underline">
              {site.email}
            </a>
          </p>
        )}
      </div>
    </div>
    <div className="flex items-center justify-center gap-2 border-t border-stone-100 py-4 text-xs text-stone-400">
      Powered by <SellixLogo size={16} />
    </div>
  </footer>
)

export const SiteState = ({ title, body, action, alert }: { title: string; body: string; action?: React.ReactNode; alert?: boolean }) => (
  <div className="mx-auto max-w-md px-6 py-24 text-center" role={alert ? 'alert' : undefined}>
    <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
      <Home className="h-7 w-7" />
    </span>
    <p className="text-2xl font-extrabold text-stone-900">{title}</p>
    <p className="mt-2 text-stone-600">{body}</p>
    {action && <div className="mt-6 flex justify-center">{action}</div>}
  </div>
)
