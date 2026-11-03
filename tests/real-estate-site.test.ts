import { createLocalPublicSource, createLocalSource } from '@/app/[locale]/(real-estate)/real-estate/_logics/data-source'
import {
  bookingRequestProblem,
  DEFAULT_SITE,
  directoryEntries,
  longTermAvailability,
  publicSite,
  siteCounts,
  type BookingRequest,
  type SiteSettings,
  type SiteSource,
} from '@/app/[locale]/(real-estate)/real-estate/_logics/site'
import { ALL_PRIVATE } from '@/app/[locale]/(real-estate)/real-estate/_logics/constants'
import type { Booking, Lease, Property, Unit, UnitType } from '@/app/[locale]/(real-estate)/real-estate/_logics/types'

const TODAY = '2026-11-03'
const ON: SiteSettings = { ...DEFAULT_SITE, published: true, name: 'Asante Homes', phone: '0241234567' }

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), keys: () => Array.from(m.keys()) }
}

const type: UnitType = {
  id: 1,
  name: 'Chamber & hall (self-contained)',
  bedrooms: 1,
  livingRooms: 1,
  facilities: ALL_PRIVATE,
  amenities: ['Porch'],
  rentalMode: 'long-term',
  defaultMonthlyRent: 600,
  defaultNightlyRate: 0,
  maxGuests: 0,
}
const property = (over: Partial<Property> = {}): Property => ({
  id: 1,
  name: 'Adum House',
  type: 'compound-house',
  address: '12 Prempeh II St',
  city: 'Kumasi',
  listed: true,
  ...over,
})
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 1,
  propertyId: 1,
  unitTypeId: 1,
  name: 'Room 1',
  rentalMode: 'long-term',
  monthlyRent: 600,
  nightlyRate: 0,
  maxGuests: 0,
  availability: 'available',
  ...over,
})
const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 1,
  unitId: 1,
  tenantId: 7,
  startDate: '2026-01-01',
  monthlyRent: 600,
  billingCycleMonths: 12,
  securityDeposit: 600,
  ...over,
})
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 1,
  unitId: 2,
  guestName: 'Kofi Mensah',
  guestPhone: '0200000000',
  guests: 2,
  checkIn: '2026-11-05',
  checkOut: '2026-11-08',
  nightlyRate: 450,
  cleaningFee: 0,
  amountPaid: 0,
  channel: 'direct',
  status: 'confirmed',
  ...over,
})
const data = (over: Partial<SiteSource> = {}): SiteSource => ({
  unitTypes: [type],
  properties: [property()],
  units: [unit()],
  leases: [],
  bookings: [],
  ...over,
})

describe('long-term availability', () => {
  it('is free now with no lease', () => {
    expect(longTermAvailability(unit(), [], TODAY)).toEqual({ state: 'now' })
  })
  it('is free from the move-out date when the tenant has given notice', () => {
    expect(longTermAvailability(unit(), [lease({ terminatedOn: '2026-12-01' })], TODAY)).toEqual({ state: 'from', date: '2026-12-01' })
  })
  it('is free the day after a term ends within 3 months', () => {
    expect(longTermAvailability(unit(), [lease({ endDate: '2026-12-31' })], TODAY)).toEqual({ state: 'from', date: '2027-01-01' })
  })
  it('is not listed when the term ends later, has no end, or someone is moving in', () => {
    expect(longTermAvailability(unit(), [lease({ endDate: '2027-06-30' })], TODAY)).toBeNull()
    expect(longTermAvailability(unit(), [lease()], TODAY)).toBeNull()
    expect(longTermAvailability(unit(), [lease({ startDate: '2026-12-01' })], TODAY)).toBeNull()
  })
  it('ignores leases that have ended', () => {
    expect(longTermAvailability(unit(), [lease({ terminatedOn: '2026-10-01' })], TODAY)).toEqual({ state: 'now' })
  })
})

describe('publicSite', () => {
  it('is null until published', () => {
    expect(publicSite('acme', DEFAULT_SITE, data(), TODAY)).toBeNull()
  })

  it('lists only free, available units of listed properties (never land)', () => {
    const d = data({
      properties: [property(), property({ id: 2, listed: false }), property({ id: 3, type: 'land' })],
      units: [
        unit(),
        unit({ id: 2, name: 'Room 2', availability: 'maintenance' }),
        unit({ id: 3, name: 'Room 3', availability: 'unlisted' }),
        unit({ id: 4, name: 'Room 4' }),
        unit({ id: 5, propertyId: 2 }),
        unit({ id: 6, propertyId: 3 }),
      ],
      leases: [lease({ unitId: 4 })],
    })
    expect(publicSite('acme', ON, d, TODAY)!.listings.map((l) => l.id)).toEqual([1])
    expect(publicSite('acme', ON, d, TODAY)!.properties.map((p) => p.id)).toEqual([1])
  })

  it('never carries tenants, guests, rents agreed or the owner’s notes', () => {
    const d = data({
      units: [unit({ notes: 'meter 12345' }), unit({ id: 2, rentalMode: 'short-stay', nightlyRate: 450, maxGuests: 3 })],
      leases: [lease({ terminatedOn: '2026-12-01', notes: 'late payer' })],
      bookings: [booking()],
      properties: [property({ purchasePrice: 250000, seller: 'Mr Boateng' })],
    })
    const json = JSON.stringify(publicSite('acme', ON, d, TODAY))
    for (const secret of ['Kofi', '0200000000', 'late payer', 'meter 12345', '250000', 'Boateng', 'tenantId'])
      expect(json).not.toContain(secret)
  })

  it('hides prices, street addresses and soon-free rooms when the owner says so', () => {
    const d = data({ units: [unit(), unit({ id: 2 })], leases: [lease({ unitId: 2, terminatedOn: '2026-12-01' })] })
    const open = publicSite('acme', { ...ON, showAddress: true }, d, TODAY)!
    expect(open.listings.map((l) => l.price)).toEqual([600, 600])
    expect(open.properties[0].address).toBe('12 Prempeh II St')
    const closed = publicSite('acme', { ...ON, showPrices: false, showSoon: false }, d, TODAY)!
    expect(closed.listings.map((l) => [l.id, l.price])).toEqual([[1, null]])
    expect(closed.properties[0].address).toBe('')
  })

  it('puts free-now first and uses the room type for the description', () => {
    const d = data({
      units: [unit({ id: 1, name: 'Room 1' }), unit({ id: 2, name: 'Room 2', monthlyRent: 500 })],
      leases: [lease({ unitId: 1, terminatedOn: '2026-11-20' })],
    })
    const s = publicSite('acme', ON, d, TODAY)!
    expect(s.listings.map((l) => l.id)).toEqual([2, 1])
    expect(s.listings[0]).toMatchObject({ typeName: type.name, bedrooms: 1, livingRooms: 1, amenities: ['Porch'] })
  })

  it('publishes a short stay’s booked nights and when it is next free', () => {
    const d = data({
      units: [unit({ id: 2, rentalMode: 'short-stay', nightlyRate: 450, maxGuests: 3 })],
      bookings: [
        booking({ checkIn: '2026-11-01', checkOut: '2026-11-04', status: 'checked-in' }),
        booking({ id: 2, checkIn: '2026-11-04', checkOut: '2026-11-06' }),
        booking({ id: 3, checkIn: '2026-11-10', checkOut: '2026-11-12', status: 'inquiry' }),
        booking({ id: 4, checkIn: '2026-11-15', checkOut: '2026-11-16', status: 'cancelled' }),
      ],
    })
    const [l] = publicSite('acme', ON, d, TODAY)!.listings
    expect(l.booked).toEqual([
      { from: TODAY, to: '2026-11-04' },
      { from: '2026-11-04', to: '2026-11-06' },
    ])
    expect(l.availability).toEqual({ state: 'from', date: '2026-11-06' })
    expect(l.price).toBe(450)
  })

  it('counts what the owner’s site can show', () => {
    const d = data({
      units: [unit(), unit({ id: 2 }), unit({ id: 3, rentalMode: 'short-stay', nightlyRate: 300 })],
      leases: [lease({ unitId: 2, terminatedOn: '2026-12-01' })],
    })
    expect(siteCounts(d, TODAY)).toEqual({ now: 1, soon: 1, stays: 1 })
  })
})

describe('booking requests', () => {
  const listing = { rentalMode: 'short-stay' as const, maxGuests: 3, booked: [{ from: '2026-11-05', to: '2026-11-08' }] }
  const req = (over: Partial<BookingRequest> = {}): BookingRequest => ({
    unitId: 2,
    checkIn: '2026-11-10',
    checkOut: '2026-11-12',
    guests: 2,
    name: 'Ama',
    phone: '024 123 4567',
    ...over,
  })

  it('accepts a good request', () => {
    expect(bookingRequestProblem(req(), listing, TODAY)).toBeNull()
  })
  it.each([
    [{ checkIn: '' }, 'Choose your dates'],
    [{ checkIn: '2026-11-01' }, 'past'],
    [{ checkOut: '2026-11-10' }, 'one night'],
    [{ guests: 4 }, 'Sleeps up to 3'],
    [{ name: ' ' }, 'name'],
    [{ phone: '12' }, 'phone'],
    [{ checkIn: '2026-11-07', checkOut: '2026-11-09' }, 'taken'],
  ])('rejects %o', (over, msg) => {
    expect(bookingRequestProblem(req(over), listing, TODAY)).toContain(msg)
  })
  it('is only for short stays', () => {
    expect(bookingRequestProblem(req(), { ...listing, rentalMode: 'long-term' }, TODAY)).toContain('rented monthly')
  })
})

describe('local public source', () => {
  const seed = async (storage: ReturnType<typeof memory>) => {
    const owner = createLocalSource('acme', storage, null)
    const t = await owner.create('unitTypes', { ...type, rentalMode: 'short-stay', name: 'Studio' })
    const p = await owner.create('properties', property())
    const u = await owner.create(
      'units',
      unit({ propertyId: p.id, unitTypeId: t.id, rentalMode: 'short-stay', nightlyRate: 450, maxGuests: 2 })
    )
    return { owner, u }
  }

  it('shows nothing until the owner publishes, then the business’s own listings', async () => {
    const storage = memory()
    const { owner } = await seed(storage)
    const pub = createLocalPublicSource(storage, () => TODAY)
    expect(await pub.site('acme')).toBeNull()
    await owner.saveSite(ON)
    expect((await pub.site('acme'))!.listings).toHaveLength(1)
    expect(await pub.site('someone-else')).toBeNull()
  })

  it('turns a booking request into an inquiry, and refuses taken nights', async () => {
    const storage = memory()
    const { owner, u } = await seed(storage)
    await owner.saveSite(ON)
    const pub = createLocalPublicSource(storage, () => TODAY)
    const request = {
      unitId: u.id,
      checkIn: '2026-11-10',
      checkOut: '2026-11-12',
      guests: 2,
      name: 'Ama',
      phone: '0241234567',
      note: 'Late arrival',
    }
    await pub.requestBooking('acme', request)
    const [b] = await owner.list('bookings')
    expect(b).toMatchObject({ status: 'inquiry', channel: 'direct', guestName: 'Ama', nightlyRate: 450, unitId: u.id })
    expect(b.notes).toContain('website')
    expect(b.notes).toContain('Late arrival')

    // Once the owner confirms it, the same nights are refused.
    await owner.update('bookings', b.id, { status: 'confirmed' })
    await expect(pub.requestBooking('acme', request)).rejects.toMatchObject({ response: { status: 409 } })
  })
})

describe('Sellix Homes directory', () => {
  it('turns a published site into entries with the business and building, unless it opted out', () => {
    const site = publicSite('acme', { ...ON, logoUrl: 'https://x/logo.webp' }, data(), TODAY)!
    expect(directoryEntries(site)).toEqual([
      {
        slug: 'acme',
        business: { name: 'Asante Homes', accent: ON.accent, logoUrl: 'https://x/logo.webp' },
        listing: site.listings[0],
        property: site.properties[0],
      },
    ])
    expect(directoryEntries(publicSite('acme', { ...ON, showInDirectory: false }, data(), TODAY)!)).toEqual([])
  })

  it('lists every published, opted-in business stored in this browser', async () => {
    const storage = memory()
    const add = async (slug: string, site: SiteSettings) => {
      const owner = createLocalSource(slug, storage, null)
      await owner.create('unitTypes', type)
      await owner.create('properties', property())
      await owner.create('units', unit())
      await owner.saveSite(site)
    }
    await add('acme', ON)
    await add('beta', { ...ON, name: 'Beta Lets' })
    await add('draft', { ...ON, published: false })
    await add('private', { ...ON, showInDirectory: false })
    const pub = createLocalPublicSource(storage, () => TODAY, storage.keys)
    expect((await pub.directory()).map((e) => [e.slug, e.business.name]).sort()).toEqual([
      ['acme', 'Asante Homes'],
      ['beta', 'Beta Lets'],
    ])
  })
})
