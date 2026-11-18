import { parkDay, trend, type Attraction, type Booking, type LeaderboardEntry, type Ticket } from '@/lib/amusement/park'
import { checkTicket, parseTicketCode, ticketCheck, ticketCode } from '@/lib/amusement/ticket-code'
import { buildBoards, newRecords, wouldRank, formatScore } from '@/lib/amusement/leaderboard'
import { landingRotation, pickPrize, slices, type Prize } from '@/lib/amusement/wheel'
import { ticketsHtml } from '@/lib/amusement/ticket-print'
import { attractionMetric } from '@/app/[locale]/(amusement)/amusement/attractions/_logics/attraction-types'

const NOW = new Date(2026, 10, 14, 15, 30) // Sat 14 Nov 2026, 3:30 pm
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 14 + dayOffset, h, m).toISOString()

const ATTRACTIONS: Attraction[] = [
  { id: 1, name: 'Go-Kart Arena', type: 'go-karting', capacity: 12, ticketPrice: 50, status: 'active' },
  { id: 2, name: 'Trampoline Park', type: 'trampoline', capacity: 30, ticketPrice: 30, status: 'maintenance' },
  { id: 3, name: 'Arcade', type: 'arcade', capacity: 40, ticketPrice: 20, status: 'closed' },
]

const TICKETS: Ticket[] = [
  { id: 10, attractionId: 1, quantity: 2, status: 'redeemed', createdAt: at(10, 15) },
  { id: 11, attractionId: 1, quantity: 1, status: 'valid', createdAt: at(10, 40) },
  { id: 12, attractionId: 2, quantity: 4, status: 'valid', createdAt: at(13, 5) },
  { id: 13, attractionId: null, quantity: 3, status: 'redeemed', createdAt: at(14, 50) },
  // Yesterday: one before 3:30 pm, one after.
  { id: 5, attractionId: 1, quantity: 4, status: 'redeemed', createdAt: at(11, 0, -1) },
  { id: 6, attractionId: 1, quantity: 9, status: 'redeemed', createdAt: at(17, 0, -1) },
]

const BOOKINGS: Booking[] = [
  { id: 1, customerName: 'Ama’s birthday', date: at(16), partySize: 12, attractionId: 1, status: 'confirmed' },
  { id: 2, customerName: 'School trip', date: at(9, 0, 2), partySize: 40, attractionId: null, status: 'pending' },
  { id: 3, customerName: 'Cancelled', date: at(11), partySize: 5, attractionId: null, status: 'cancelled' },
  { id: 4, customerName: 'Next month', date: at(9, 0, 20), partySize: 8, attractionId: null, status: 'confirmed' },
]

describe('the park’s day', () => {
  const day = parkDay(TICKETS, ATTRACTIONS, BOOKINGS, NOW, 15)

  it('counts guests, admissions and takings from today’s tickets', () => {
    expect(day.sold).toBe(10)
    expect(day.admitted).toBe(5)
    // 3 × ₵50 + 4 × ₵30 + 3 × ₵15 general admission
    expect(day.takings).toBe(150 + 120 + 45)
    expect(day.soldYesterdaySoFar).toBe(4)
    expect(trend(day.sold, day.soldYesterdaySoFar)).toBe(150)
    expect(trend(5, 0)).toBeNull()
  })

  it('charts sales per hour from opening to now, and ranks attractions', () => {
    expect(day.hourly[0]).toEqual({ hour: 8, people: 0 })
    expect(day.hourly.at(-1)).toEqual({ hour: 15, people: 0 })
    expect(day.hourly.find((h) => h.hour === 10)!.people).toBe(3)
    expect(day.byAttraction.map((a) => [a.name, a.people])).toEqual([
      ['Trampoline Park', 4],
      ['Go-Kart Arena', 3],
      ['General admission', 3],
    ])
  })

  it('knows which rides are running and who is coming', () => {
    expect(day.status).toEqual({ active: 1, maintenance: 1, closed: 1 })
    expect(day.bookingsToday.map((b) => b.customerName)).toEqual(['Ama’s birthday'])
    expect(day.guestsBookedToday).toBe(12)
    expect(day.upcoming.map((b) => b.customerName)).toEqual(['School trip'])
  })
})

describe('ticket codes at the gate', () => {
  const t = TICKETS[1]
  const code = ticketCode(t)

  it('prints a short code with a check only the system can work out', () => {
    expect(code).toMatch(/^T11-[2-9A-HJ-NP-Z]{3}$/)
    expect(ticketCheck({ id: 11, createdAt: at(10, 41) })).not.toBe(ticketCheck(t))
  })

  it('reads what scanners and people type', () => {
    expect(parseTicketCode(code)).toEqual({ id: 11, check: code.slice(-3) })
    expect(parseTicketCode(`  ${code.toLowerCase().replace('-', ' ')} `)).toEqual({ id: 11, check: code.slice(-3) })
    expect(parseTicketCode('hello')).toBeNull()
  })

  it('lets a valid ticket in once, and catches used, fake and unknown ones', () => {
    expect(checkTicket(code, TICKETS, ATTRACTIONS)).toMatchObject({ kind: 'admit', attraction: { name: 'Go-Kart Arena' } })
    expect(checkTicket(ticketCode(TICKETS[0]), TICKETS, ATTRACTIONS)).toMatchObject({ kind: 'used' })
    const forged = `T11-${code.endsWith('ZZZ') ? 'YYY' : 'ZZZ'}`
    expect(checkTicket(forged, TICKETS, ATTRACTIONS)).toEqual({ kind: 'invalid' })
    expect(checkTicket('T999-ABC', TICKETS, ATTRACTIONS)).toEqual({ kind: 'unknown', id: 999 })
    expect(checkTicket('???', TICKETS, ATTRACTIONS)).toEqual({ kind: 'unreadable' })
  })

  it('prints a stub per ticket with its QR, and no QR for one sold offline', async () => {
    const html = await ticketsHtml(
      [
        { ticket: t, attraction: ATTRACTIONS[0], price: 50 },
        { ticket: { id: -5, attractionId: null, quantity: 3, status: 'valid' }, price: 15, offline: true },
      ],
      'Bambo Park',
      'Have fun!',
      '80'
    )
    expect(html).toContain('ADMIT 1')
    expect(html).toContain(code)
    expect(html).toContain('<svg')
    expect(html).toContain('ADMIT 3')
    expect(html).toContain('Sold offline')
    expect(html.match(/<svg/g)).toHaveLength(1)
  })
})

describe('leaderboards', () => {
  const e = (id: number, attractionId: number, who: string, score: number, dayOffset = 0): LeaderboardEntry => ({
    id,
    attractionId,
    participantName: who,
    score,
    achievedAt: at(12, 0, dayOffset),
  })
  const info = (id: number) => {
    const a = ATTRACTIONS.find((x) => x.id === id)!
    return { name: a.name, type: a.type }
  }
  const entries = [
    e(1, 1, 'Kofi', 41.2, -3),
    e(2, 1, 'Ama', 38.9, -1),
    e(3, 1, 'Kofi', 39.5),
    e(4, 3, 'Yaw', 9200),
    e(5, 3, 'Esi', 12000, -2),
  ]

  it('ranks each attraction its own way, one row per person', () => {
    const [arcade, karts] = buildBoards(entries, info, attractionMetric, NOW)
    // Lap times: lower is better; Kofi's best only.
    expect(karts.rows.map((r) => [r.participantName, r.score])).toEqual([
      ['Ama', 38.9],
      ['Kofi', 39.5],
    ])
    expect(karts.today.map((r) => r.participantName)).toEqual(['Kofi'])
    expect(arcade.rows[0].participantName).toBe('Esi')
    expect(formatScore(38.9, karts.metric)).toBe('38.90 sec')
  })

  it('says where a score would land, and spots a new record', () => {
    const before = buildBoards(entries, info, attractionMetric, NOW)
    const karts = before.find((b) => b.attractionId === 1)!
    expect(wouldRank(karts, 37)).toBe(1)
    expect(wouldRank(karts, 39)).toBe(2)
    const after = buildBoards([...entries, e(6, 1, 'Efua', 37.4)], info, attractionMetric, NOW)
    expect(newRecords(before, after).map((b) => b.name)).toEqual(['Go-Kart Arena'])
    expect(newRecords(after, after)).toEqual([])
  })
})

describe('the prize wheel', () => {
  const prizes: Prize[] = [
    { id: 'a', label: 'A', color: '#000', weight: 1 },
    { id: 'b', label: 'B', color: '#000', weight: 3 },
  ]

  it('sizes slices by their chance and picks fairly', () => {
    expect(slices(prizes).map((s) => [s.start, s.end])).toEqual([
      [0, 90],
      [90, 360],
    ])
    expect(pickPrize(prizes, 0.1)).toBe(0)
    expect(pickPrize(prizes, 0.3)).toBe(1)
    expect(pickPrize(prizes, 0.999)).toBe(1)
  })

  it('stops with the pointer inside the chosen slice, always turning forward', () => {
    for (const [index, jitter] of [
      [0, 0],
      [0, 0.99],
      [1, 0.5],
    ] as const) {
      const r = landingRotation(prizes, index, 725, 5, jitter)
      expect(r).toBeGreaterThan(725 + 360)
      const under = (360 - (r % 360)) % 360
      const s = slices(prizes)[index]
      expect(under).toBeGreaterThanOrEqual(s.start)
      expect(under).toBeLessThan(s.end)
    }
  })
})
