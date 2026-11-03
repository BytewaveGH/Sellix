// The public website: what a landlord shows to people looking for a place.
//
// Everything public is built here from the portfolio by publicSite(), which
// copies only what's safe to show — never tenants, leases, payments or guest
// names. The backend's public endpoint must return the same shape
// (BACKEND_REQUIREMENTS.md §12).

import { addDays, differenceInCalendarDays } from 'date-fns'
import { findBookingConflict, leaseState, parseDate, toISODate } from './calc'
import type { Booking, FacilityAccess, FacilityKey, Lease, Property, PropertyType, RentalMode, Unit, UnitType } from './types'

export interface SiteSettings {
  // Off: the link shows "not available" and nothing else.
  published: boolean
  name: string
  tagline: string
  about: string
  phone: string
  // Number enquiries go to on WhatsApp; the phone is used when empty.
  whatsapp: string
  email: string
  // Hex colour for buttons and highlights.
  accent: string
  showPrices: boolean
  // Street address on the site; off shows only the area and city.
  showAddress: boolean
  // Also list let rooms whose tenant leaves within SOON_DAYS, as "Available from …".
  showSoon: boolean
  // e.g. "1 year advance · 1 month deposit"
  rentTerms: string
  // Square logo (also the browser-tab icon) and a wide cover photo for the top of the site.
  logoUrl?: string
  coverUrl?: string
  // Also list the free rooms on Sellix Homes, the directory of every landlord's site.
  showInDirectory: boolean
}

export const DEFAULT_SITE: SiteSettings = {
  published: false,
  name: '',
  tagline: 'Rooms and apartments to rent',
  about: '',
  phone: '',
  whatsapp: '',
  email: '',
  accent: '#0865AC',
  showPrices: true,
  showAddress: false,
  showSoon: true,
  rentTerms: '',
  showInDirectory: true,
}

export const ACCENTS = ['#0865AC', '#0F766E', '#15803D', '#B45309', '#BE123C', '#7C3AED', '#1C1917']

// Fills missing fields, so settings saved by an older version keep working.
export const withSiteDefaults = (raw: unknown): SiteSettings => ({
  ...DEFAULT_SITE,
  ...(raw && typeof raw === 'object' ? (raw as Partial<SiteSettings>) : {}),
})

export const sitePath = (locale: string, slug: string, unitId?: number) =>
  `/${locale}/rentals/${encodeURIComponent(slug)}${unitId ? `/${unitId}` : ''}`

// How far ahead a let room counts as "available soon".
export const SOON_DAYS = 90
// Booked nights published for short stays.
const CALENDAR_DAYS = 365
export const MAX_PHOTOS = { property: 8, unit: 4 }

// ── Public shape ─────────────────────────────────────────────────────────────

export type PublicAvailability = { state: 'now' } | { state: 'from'; date: string }

export interface PublicProperty {
  id: number
  name: string
  type: PropertyType
  // Empty unless the owner shows addresses.
  address: string
  city: string
  region?: string
  description?: string
  gpsAddress?: string
  photos: string[]
}

export interface PublicListing {
  id: number
  propertyId: number
  name: string
  typeName: string
  description?: string
  rentalMode: RentalMode
  // Per month (long-term) or per night (short stay); null when prices are hidden.
  price: number | null
  bedrooms: number
  livingRooms: number
  facilities: Record<FacilityKey, FacilityAccess> | null
  amenities: string[]
  maxGuests: number
  photos: string[]
  availability: PublicAvailability
  // Short stays: nights already taken, as [from, to) ranges.
  booked: { from: string; to: string }[]
}

export interface PublicSite {
  slug: string
  site: Omit<SiteSettings, 'published'>
  properties: PublicProperty[]
  listings: PublicListing[]
  // The day availability was worked out for.
  on: string
}

export interface SiteSource {
  unitTypes: UnitType[]
  properties: Property[]
  units: Unit[]
  leases: Lease[]
  bookings: Booking[]
}

const LIVE_BOOKING = new Set(['confirmed', 'checked-in'])

const dayAfter = (iso: string) => toISODate(addDays(parseDate(iso), 1))

// When a long-term unit can be moved into, or null when it isn't free within SOON_DAYS.
export const longTermAvailability = (unit: Unit, leases: Lease[], on: string): PublicAvailability | null => {
  const mine = leases.filter((l) => l.unitId === unit.id && leaseState(l, on) !== 'ended')
  // Someone has already agreed to move in.
  if (mine.some((l) => leaseState(l, on) === 'upcoming')) return null
  const active = mine.find((l) => leaseState(l, on) === 'active')
  if (!active) return { state: 'now' }
  // A notice to leave (move-out date set) beats the agreed end of the term.
  const free = active.terminatedOn ?? (active.endDate ? dayAfter(active.endDate) : null)
  if (!free) return null
  const days = differenceInCalendarDays(parseDate(free), parseDate(on))
  return days <= 0 ? { state: 'now' } : days <= SOON_DAYS ? { state: 'from', date: free } : null
}

export const bookedRanges = (unitId: number, bookings: Booking[], on: string) => {
  const until = toISODate(addDays(parseDate(on), CALENDAR_DAYS))
  return bookings
    .filter((b) => b.unitId === unitId && LIVE_BOOKING.has(b.status) && b.checkOut > on && b.checkIn < until)
    .map((b) => ({ from: b.checkIn > on ? b.checkIn : on, to: b.checkOut }))
    .sort((a, b) => (a.from < b.from ? -1 : 1))
}

// The day a short-stay unit is next free: today, or the end of the stay running now
// (back-to-back stays chained).
const nextFreeNight = (ranges: { from: string; to: string }[], on: string) => {
  let day = on
  for (const r of ranges) if (r.from <= day && day < r.to) day = r.to
  return day
}

// Whether a property is offered at all: listed, and not bare land.
export const isListed = (p: Property) => !!p.listed && p.type !== 'land'

export const publicSite = (slug: string, settings: SiteSettings, d: SiteSource, on: string): PublicSite | null => {
  if (!settings.published) return null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { published, ...site } = settings
  const types = new Map(d.unitTypes.map((t) => [t.id, t]))
  const properties = d.properties.filter(isListed)
  const shown = new Set(properties.map((p) => p.id))

  const listings: PublicListing[] = []
  for (const unit of d.units) {
    if (!shown.has(unit.propertyId) || unit.availability !== 'available') continue
    const type = unit.unitTypeId !== null ? types.get(unit.unitTypeId) : undefined
    const booked = unit.rentalMode === 'short-stay' ? bookedRanges(unit.id, d.bookings, on) : []
    let availability: PublicAvailability | null
    if (unit.rentalMode === 'short-stay') {
      const free = nextFreeNight(booked, on)
      availability = free === on ? { state: 'now' } : { state: 'from', date: free }
    } else {
      availability = longTermAvailability(unit, d.leases, on)
      if (availability?.state === 'from' && !settings.showSoon) availability = null
    }
    if (!availability) continue
    listings.push({
      id: unit.id,
      propertyId: unit.propertyId,
      name: unit.name,
      typeName: type?.name ?? (unit.rentalMode === 'short-stay' ? 'Short stay' : 'Room'),
      description: type?.description,
      rentalMode: unit.rentalMode,
      price: settings.showPrices ? (unit.rentalMode === 'short-stay' ? unit.nightlyRate : unit.monthlyRent) || null : null,
      bedrooms: type?.bedrooms ?? 0,
      livingRooms: type?.livingRooms ?? 0,
      facilities: type?.facilities ?? null,
      amenities: type?.amenities ?? [],
      maxGuests: unit.rentalMode === 'short-stay' ? unit.maxGuests : 0,
      photos: unit.photos ?? [],
      availability,
      booked,
    })
  }

  return {
    slug,
    site,
    on,
    properties: properties.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      address: settings.showAddress ? p.address : '',
      city: p.city,
      region: p.region,
      description: p.description,
      gpsAddress: settings.showAddress ? p.land?.gpsAddress : undefined,
      photos: propertyPhotos(p),
    })),
    // Free now first, then soonest; cheapest first within that.
    listings: listings.sort(
      (a, b) =>
        availableOn(a).localeCompare(availableOn(b)) ||
        (a.price ?? 0) - (b.price ?? 0) ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
    ),
  }
}

const availableOn = (l: PublicListing) => (l.availability.state === 'now' ? '' : l.availability.date)

// The gallery, with an older cover-image link counted as the first photo.
export const propertyPhotos = (p: Pick<Property, 'photos' | 'coverImageUrl'>) => {
  const photos = p.photos ?? []
  return p.coverImageUrl && !photos.includes(p.coverImageUrl) ? [p.coverImageUrl, ...photos] : photos
}

// A listing's own photos, then its building's.
export const listingPhotos = (l: PublicListing, property?: PublicProperty) => [...l.photos, ...(property?.photos ?? [])]

// What the site can show, for the owner's page.
export const siteCounts = (d: SiteSource, on: string) => {
  const s = publicSite('', { ...DEFAULT_SITE, published: true, showSoon: true }, d, on)!
  return {
    now: s.listings.filter((l) => l.rentalMode === 'long-term' && l.availability.state === 'now').length,
    soon: s.listings.filter((l) => l.rentalMode === 'long-term' && l.availability.state === 'from').length,
    stays: s.listings.filter((l) => l.rentalMode === 'short-stay').length,
  }
}

// ── Sellix Homes (the directory of every published site) ────────────────────

export interface DirectoryListing {
  slug: string
  business: { name: string; accent: string; logoUrl?: string }
  listing: PublicListing
  property?: PublicProperty
}

export const directoryPath = (locale: string) => `/${locale}/rentals`

// A site's free rooms as directory entries; none if the owner opted out.
export const directoryEntries = (s: PublicSite): DirectoryListing[] => {
  if (!s.site.showInDirectory) return []
  const props = new Map(s.properties.map((p) => [p.id, p]))
  const business = { name: s.site.name, accent: s.site.accent, logoUrl: s.site.logoUrl }
  return s.listings.map((listing) => ({ slug: s.slug, business, listing, property: props.get(listing.propertyId) }))
}

// ── Booking requests (short stays) ───────────────────────────────────────────

export interface BookingRequest {
  unitId: number
  checkIn: string
  checkOut: string
  guests: number
  name: string
  phone: string
  note?: string
}

export const MAX_NIGHTS = 90

const ISO = /^\d{4}-\d{2}-\d{2}$/

// Why a request can't be sent, or null. Checked in the browser and again by the source.
export const bookingRequestProblem = (
  r: BookingRequest,
  listing: Pick<PublicListing, 'rentalMode' | 'maxGuests' | 'booked'>,
  on: string
) => {
  if (listing.rentalMode !== 'short-stay') return 'This place is rented monthly — send a message instead'
  if (!ISO.test(r.checkIn) || !ISO.test(r.checkOut)) return 'Choose your dates'
  if (r.checkIn < on) return 'Arrival can’t be in the past'
  if (r.checkOut <= r.checkIn) return 'Leave at least one night after you arrive'
  if (differenceInCalendarDays(parseDate(r.checkOut), parseDate(r.checkIn)) > MAX_NIGHTS)
    return `Book up to ${MAX_NIGHTS} nights — message us for longer stays`
  if (r.guests < 1) return 'Add at least one guest'
  if (listing.maxGuests > 0 && r.guests > listing.maxGuests) return `Sleeps up to ${listing.maxGuests}`
  if (!r.name.trim()) return 'Add your name'
  if (r.phone.replace(/\D/g, '').length < 9) return 'Add a phone number we can reach you on'
  if (listing.booked.some((b) => b.from < r.checkOut && r.checkIn < b.to)) return 'Some of those nights are taken — try other dates'
  return null
}

// The booking a request becomes: an inquiry the owner confirms on the Bookings page.
export const bookingFromRequest = (r: BookingRequest, unit: Unit, receivedOn: string): Omit<Booking, 'id'> => ({
  unitId: unit.id,
  guestName: r.name.trim(),
  guestPhone: r.phone.trim(),
  guests: r.guests,
  checkIn: r.checkIn,
  checkOut: r.checkOut,
  nightlyRate: unit.nightlyRate,
  cleaningFee: 0,
  amountPaid: 0,
  channel: 'direct',
  status: 'inquiry',
  notes: [`Requested on the website on ${receivedOn}.`, r.note?.trim()].filter(Boolean).join(' '),
})

// Re-checks a request against live data (the visitor's page may be stale).
export const acceptBookingRequest = (slug: string, settings: SiteSettings, d: SiteSource, r: BookingRequest, on: string) => {
  const site = publicSite(slug, settings, d, on)
  const listing = site?.listings.find((l) => l.id === r.unitId)
  const unit = d.units.find((u) => u.id === r.unitId)
  if (!site || !listing || !unit) return { ok: false as const, status: 404, message: 'This place is no longer listed' }
  const problem = bookingRequestProblem(r, listing, on)
  if (problem) return { ok: false as const, status: problem.includes('taken') ? 409 : 422, message: problem }
  // Pending requests don't block the calendar, but two for the same nights would.
  if (
    findBookingConflict(
      { unitId: unit.id, checkIn: r.checkIn, checkOut: r.checkOut },
      d.bookings.filter((b) => LIVE_BOOKING.has(b.status))
    )
  )
    return { ok: false as const, status: 409, message: 'Some of those nights are taken — try other dates' }
  return { ok: true as const, booking: bookingFromRequest(r, unit, on) }
}

// ── Messages ────────────────────────────────────────────────────────────────

export const enquiryText = (l: PublicListing, property: PublicProperty | undefined, siteName: string, link: string) =>
  [
    `Hello${siteName ? ` ${siteName}` : ''}, I saw this on your website and I’m interested:`,
    `${l.typeName} — ${l.name}${property ? `, ${property.name}${property.city ? ` (${property.city})` : ''}` : ''}`,
    l.availability.state === 'from' ? `Available from ${l.availability.date}` : '',
    'Is it still available? When can I come and see it?',
    link,
  ]
    .filter(Boolean)
    .join('\n')
