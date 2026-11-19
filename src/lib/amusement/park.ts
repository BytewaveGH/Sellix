// The amusement park's day, worked out from what the API already returns
// (/attractions, /tickets, /bookings). Pure, for tests.
//
// Tickets carry no price of their own yet (BACKEND_REQUIREMENTS §14), so
// takings are an estimate: quantity × the attraction's current price, or the
// park's general admission price for tickets without an attraction.

export type AttractionStatus = 'active' | 'maintenance' | 'closed'

export interface Attraction {
  id: number
  name: string
  type: string
  capacity: number
  ticketPrice: number
  status: AttractionStatus
}

export interface Ticket {
  id: number
  attractionId: number | null
  buyerName?: string | null
  quantity: number
  status: 'valid' | 'redeemed'
  createdAt?: string
}

export interface Booking {
  id: number
  customerName: string
  phone?: string
  date: string
  partySize: number
  attractionId: number | null
  status: 'pending' | 'confirmed' | 'cancelled'
  notes?: string
}

export interface LeaderboardEntry {
  id: number
  attractionId: number
  attractionName?: string
  attractionType?: string
  participantName: string
  teamName?: string | null
  score: number
  achievedAt: string
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameDay = (iso: string | undefined, day: Date) => {
  if (!iso) return false
  const t = new Date(iso)
  return !Number.isNaN(t.getTime()) && dayStart(t).getTime() === dayStart(day).getTime()
}

export const ticketPrice = (t: Pick<Ticket, 'attractionId'>, byId: Map<number, Attraction>, admissionPrice: number) =>
  t.attractionId != null ? (byId.get(t.attractionId)?.ticketPrice ?? 0) : admissionPrice

export type ParkDay = {
  // Tickets sold today (people, not ticket rows).
  sold: number
  soldYesterdaySoFar: number
  // Of those, already through the gate.
  admitted: number
  takings: number
  // Ticket sales per hour today, from opening to now (or the last sale).
  hourly: { hour: number; people: number }[]
  byAttraction: { id: number | null; name: string; type: string; people: number; takings: number }[]
  // Rides open / being fixed / closed.
  status: Record<AttractionStatus, number>
  // Group visits: today and the next 7 days, not cancelled.
  bookingsToday: Booking[]
  upcoming: Booking[]
  guestsBookedToday: number
}

export const parkDay = (
  tickets: Ticket[],
  attractions: Attraction[],
  bookings: Booking[],
  now: Date,
  admissionPrice: number
): ParkDay => {
  const byId = new Map(attractions.map((a) => [a.id, a]))
  const today = tickets.filter((t) => sameDay(t.createdAt, now))
  const yesterday = new Date(now.getTime() - 86_400_000)
  const soldYesterdaySoFar = tickets
    .filter((t) => sameDay(t.createdAt, yesterday) && new Date(t.createdAt!).getTime() <= yesterday.getTime())
    .reduce((n, t) => n + t.quantity, 0)

  const perHour = new Map<number, number>()
  for (const t of today) {
    const h = new Date(t.createdAt!).getHours()
    perHour.set(h, (perHour.get(h) ?? 0) + t.quantity)
  }
  const hours = Array.from(perHour.keys())
  // A sensible window even early in the day: 8:00 until now.
  const from = Math.min(8, ...hours)
  const to = Math.max(now.getHours(), ...hours, from)
  const hourly = Array.from({ length: to - from + 1 }, (_, i) => ({ hour: from + i, people: perHour.get(from + i) ?? 0 }))

  const groups = new Map<number | null, { id: number | null; name: string; type: string; people: number; takings: number }>()
  for (const t of today) {
    const a = t.attractionId != null ? byId.get(t.attractionId) : undefined
    const key = a ? a.id : null
    const g = groups.get(key) ?? { id: key, name: a?.name ?? 'General admission', type: a?.type ?? 'other', people: 0, takings: 0 }
    g.people += t.quantity
    g.takings += t.quantity * ticketPrice(t, byId, admissionPrice)
    groups.set(key, g)
  }

  const start = dayStart(now).getTime()
  const week = start + 8 * 86_400_000
  const live = bookings.filter((b) => b.status !== 'cancelled')
  const at = (b: Booking) => new Date(b.date).getTime()
  const bookingsToday = live.filter((b) => sameDay(b.date, now)).sort((a, b) => at(a) - at(b))
  const upcoming = live.filter((b) => at(b) >= start + 86_400_000 && at(b) < week).sort((a, b) => at(a) - at(b))

  return {
    sold: today.reduce((n, t) => n + t.quantity, 0),
    soldYesterdaySoFar,
    admitted: today.filter((t) => t.status === 'redeemed').reduce((n, t) => n + t.quantity, 0),
    takings: today.reduce((n, t) => n + t.quantity * ticketPrice(t, byId, admissionPrice), 0),
    hourly,
    byAttraction: Array.from(groups.values()).sort((a, b) => b.people - a.people),
    status: {
      active: attractions.filter((a) => a.status === 'active').length,
      maintenance: attractions.filter((a) => a.status === 'maintenance').length,
      closed: attractions.filter((a) => a.status === 'closed').length,
    },
    bookingsToday,
    upcoming,
    guestsBookedToday: bookingsToday.reduce((n, b) => n + b.partySize, 0),
  }
}

// "▲ 12% on yesterday" — null when there's nothing to compare with.
export const trend = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null)

export const money = (n: number) => `₵${n.toLocaleString('en-GH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

export const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)
