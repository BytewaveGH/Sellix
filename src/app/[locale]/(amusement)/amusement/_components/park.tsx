'use client'

// Shared by the amusement screens: the park's data (same query keys as the
// existing pages, so they share one cache) and the attraction tile.

import React from 'react'
import { useFetchData } from '@/hooks/use-fetch'
import { IGeneric } from '@/types/interfaces'
import { cn } from '@/lib/utils'
import type { Attraction, Booking, LeaderboardEntry, Ticket } from '@/lib/amusement/park'
import { AttractionServices } from '../attractions/_logics/services'
import { TicketServices } from '../tickets/_logics/services'
import { BookingServices } from '../bookings/_logics/services'
import { LeaderboardServices } from '../leaderboard/_logics/services'
import { attractionGradient, attractionTypeIcon, attractionTypeLabel } from '../attractions/_logics/attraction-types'

const list = <T,>(d: unknown) => ((d as T[] | undefined) ?? []) as T[]

export const useAttractions = () => {
  const q = useFetchData('attractions', AttractionServices.FetchAll() as unknown as IGeneric)
  return { ...q, attractions: list<Attraction>(q.data) }
}

export const useTickets = () => {
  const q = useFetchData('tickets', TicketServices.FetchAll() as unknown as IGeneric)
  return { ...q, tickets: list<Ticket>(q.data) }
}

export const useBookings = (enabled = true) => {
  const q = useFetchData('bookings', BookingServices.FetchAll() as unknown as IGeneric, enabled)
  return { ...q, bookings: list<Booking>(q.data) }
}

export const useLeaderboard = () => {
  const q = useFetchData('leaderboard', LeaderboardServices.FetchAll() as unknown as IGeneric)
  return { ...q, entries: list<LeaderboardEntry>(q.data) }
}

export const STATUS: Record<Attraction['status'], { label: string; dot: string; chip: string }> = {
  active: { label: 'Open', dot: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  maintenance: { label: 'Maintenance', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  closed: { label: 'Closed', dot: 'bg-stone-400', chip: 'bg-stone-100 text-stone-600 ring-stone-200' },
}

// The coloured tile for an attraction: its type's gradient and icon.
export const AttractionBadge = ({ type, size = 'md', className }: { type: string; size?: 'sm' | 'md' | 'lg'; className?: string }) => {
  const Icon = attractionTypeIcon(type)
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center text-white shadow-sm',
        size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl',
        className
      )}
      style={{ backgroundImage: attractionGradient(type) }}
      aria-hidden
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={2} />
    </span>
  )
}

export { attractionTypeLabel }
