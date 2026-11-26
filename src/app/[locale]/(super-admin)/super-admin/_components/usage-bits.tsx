'use client'

import React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HEALTH, trend, type Health } from '@/lib/platform/analytics'

export const HealthPill = ({ health, score, className }: { health: Health; score?: number; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap',
      HEALTH[health].className,
      className
    )}
    title={HEALTH[health].hint}
  >
    <span className={cn('h-1.5 w-1.5 rounded-full', HEALTH[health].dot)} aria-hidden />
    {HEALTH[health].label}
    {score !== undefined && <span className="tabular-nums opacity-70">· {score}</span>}
  </span>
)

// "▲ 12%" against the period before.
export const TrendChip = ({ current, previous, className }: { current: number; previous: number; className?: string }) => {
  const t = trend(current, previous)
  if (t === null) return <span className={cn('text-[11px] font-semibold text-emerald-600', className)}>New</span>
  const Icon = t > 0 ? ArrowUpRight : t < 0 ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
        t > 0 ? 'text-emerald-600' : t < 0 ? 'text-rose-600' : 'text-stone-400',
        className
      )}
      aria-label={`${t > 0 ? 'Up' : t < 0 ? 'Down' : 'No change'} ${Math.abs(t)}% on the period before`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(t)}%
    </span>
  )
}

export const cedis = (n: number, opts?: { compact?: boolean }) =>
  `₵${new Intl.NumberFormat('en-GH', opts?.compact && Math.abs(n) >= 10_000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(n)}`

export const hours = (minutes: number) =>
  minutes >= 60 ? `${new Intl.NumberFormat('en-GH', { maximumFractionDigits: 1 }).format(minutes / 60)} h` : `${Math.round(minutes)} min`

export const percent = (n: number) => `${Math.round(n * 100)}%`
