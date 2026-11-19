// The code printed on a ticket (and in its QR): "T1042-K7Q". Gate staff scan
// or type it to let guests in.
//
// Ticket ids count up, so an id alone could be guessed and a fake ticket
// printed for someone else's. The three-character check comes from the
// ticket's id and the exact moment it was sold, which only the system knows.
// It's an interim guard until the API issues its own random ticket codes
// (BACKEND_REQUIREMENTS §14.1).

import type { Attraction, Ticket } from './park'

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// FNV-1a, 32-bit: small, stable, no dependencies.
const fnv = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export const ticketCheck = (t: Pick<Ticket, 'id' | 'createdAt'>) => {
  let h = fnv(`sellix-ticket|${t.id}|${t.createdAt ?? ''}`)
  let out = ''
  for (let i = 0; i < 3; i++) {
    out += ALPHABET[h % ALPHABET.length]
    h = Math.floor(h / ALPHABET.length)
  }
  return out
}

export const ticketCode = (t: Pick<Ticket, 'id' | 'createdAt'>) => `T${t.id}-${ticketCheck(t)}`

// What a scanner or a person typed: "T1042-K7Q", "t1042 k7q", "1042K7Q"…
export const parseTicketCode = (raw: string): { id: number; check: string } | null => {
  const m = /T?\s*(\d{1,9})\s*[-\s]?\s*([2-9A-HJ-NP-Z]{3})\b/i.exec(raw.trim().toUpperCase())
  return m ? { id: Number(m[1]), check: m[2] } : null
}

export type GateCheck =
  | { kind: 'admit'; ticket: Ticket; attraction?: Attraction }
  | { kind: 'used'; ticket: Ticket; attraction?: Attraction }
  // A code that looks right but isn't one of ours (mistyped, or forged).
  | { kind: 'invalid' }
  // Not in the list this device has: sold elsewhere moments ago? Reload and try again.
  | { kind: 'unknown'; id: number }
  | { kind: 'unreadable' }

export const checkTicket = (raw: string, tickets: Ticket[], attractions: Attraction[]): GateCheck => {
  const code = parseTicketCode(raw)
  if (!code) return { kind: 'unreadable' }
  const ticket = tickets.find((t) => t.id === code.id)
  if (!ticket) return { kind: 'unknown', id: code.id }
  if (ticketCheck(ticket) !== code.check) return { kind: 'invalid' }
  const attraction = ticket.attractionId != null ? attractions.find((a) => a.id === ticket.attractionId) : undefined
  return ticket.status === 'redeemed' ? { kind: 'used', ticket, attraction } : { kind: 'admit', ticket, attraction }
}
