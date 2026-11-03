'use client'

// Billing presentation shared by the console and business dashboards.

import React from 'react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, Sparkles, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge, type BadgeSpec } from '@/components/kit/ui'
import type { Access } from '@/lib/subscription/access'
import type { BillingState, Subscription } from '@/lib/subscription/types'

export const BILLING_STATES: Record<BillingState, BadgeSpec> = {
  none: { label: 'No plan', icon: CircleDashed, className: 'bg-stone-100 text-stone-600 ring-stone-500/15', dot: 'bg-stone-400' },
  trialing: { label: 'Trial', icon: Sparkles, className: 'bg-sky-50 text-sky-700 ring-sky-600/20', dot: 'bg-sky-500' },
  active: { label: 'Paid', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  past_due: { label: 'Payment due', icon: AlertTriangle, className: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: 'bg-amber-500' },
  canceled: { label: 'Canceled', icon: XCircle, className: 'bg-stone-100 text-stone-600 ring-stone-500/20', dot: 'bg-stone-500' },
  expired: { label: 'Expired', icon: Ban, className: 'bg-rose-50 text-rose-700 ring-rose-600/15', dot: 'bg-rose-500' },
}

export const BillingPill = ({ state, className }: { state: BillingState; className?: string }) => (
  <Badge spec={BILLING_STATES[state]} className={className} />
)

export const shortDate = (d: Date | string) => format(typeof d === 'string' ? new Date(d) : d, 'd MMM yyyy')

const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

// One line saying where a subscription stands, e.g. "Trial ends in 5 days".
export const accessLine = (access: Access, sub?: Subscription | null): string => {
  const { state, endsAt, daysLeft, lockAt } = access
  switch (state) {
    case 'none':
      return 'Not on a plan — full access'
    case 'trialing':
      return `Trial ends ${inDays(Math.max(0, daysLeft ?? 0))}`
    case 'active':
      return sub?.cancelAtPeriodEnd ? `Ends ${shortDate(endsAt!)} — won’t renew` : `Paid to ${shortDate(endsAt!)}`
    case 'past_due':
      return `Overdue since ${shortDate(endsAt!)} — locks ${lockAt ? formatDistanceToNowStrict(lockAt, { addSuffix: true }) : 'soon'}`
    case 'canceled':
      return sub?.canceledAt ? `Canceled ${shortDate(sub.canceledAt)}` : endsAt ? `Ended ${shortDate(endsAt)}` : 'Canceled'
    case 'expired':
      return endsAt ? `Expired ${shortDate(lockAt ?? endsAt)}` : 'Expired'
  }
}

// How far through the current trial or paid period we are.
export const PeriodBar = ({ sub, access, className }: { sub: Subscription; access: Access; className?: string }) => {
  const start = new Date(sub.currentPeriodStart).getTime()
  const end = access.endsAt?.getTime() ?? start
  const span = Math.max(1, end - start)
  const done = Math.min(1, Math.max(0, (Date.now() - start) / span))
  const tone =
    access.state === 'past_due'
      ? 'bg-amber-500'
      : access.hasAccess
        ? access.state === 'trialing'
          ? 'bg-sky-500'
          : 'bg-endeavour'
        : 'bg-rose-500'
  return (
    <div className={className}>
      <div
        className="h-2 rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-label="Current period"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done * 100)}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${done * 100}%` }} />
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-stone-500 tabular-nums">
        <span>{shortDate(sub.currentPeriodStart)}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {access.endsAt ? shortDate(access.endsAt) : '—'}
        </span>
      </div>
    </div>
  )
}

export const METHOD_LABELS = { momo: 'MoMo', bank: 'Bank transfer', cash: 'Cash', card: 'Card', other: 'Other' } as const
