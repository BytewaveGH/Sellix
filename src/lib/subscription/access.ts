// What a subscription allows right now. Pure — every rule about access lives
// here so the dashboard, the console and the server agree.

import { addDays, differenceInCalendarDays } from 'date-fns'
import type { BillingCycle, BillingSettings, BillingState, Plan, Subscription } from './types'
import type { FeatureKey } from './features'

export interface Access {
  state: BillingState
  // Signed-in users may use the dashboard. False only for canceled/expired.
  hasAccess: boolean
  plan: Plan | null
  // End of the trial or paid period.
  endsAt: Date | null
  // Whole days until endsAt (negative once past).
  daysLeft: number | null
  // Past due: when the grace period runs out and access stops.
  lockAt: Date | null
}

const date = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

export const periodEnd = (sub: Subscription) =>
  date(sub.status === 'trialing' ? (sub.trialEndsAt ?? sub.currentPeriodEnd) : sub.currentPeriodEnd)

export const accessFor = (
  sub: Subscription | null | undefined,
  plans: Plan[],
  settings: Pick<BillingSettings, 'graceDays'>,
  now: Date
): Access => {
  // No record: a business registered before billing existed. Never lock it out.
  if (!sub) return { state: 'none', hasAccess: true, plan: null, endsAt: null, daysLeft: null, lockAt: null }

  const plan = plans.find((p) => p.id === sub.planId) ?? null
  const end = periodEnd(sub)
  const daysLeft = end ? differenceInCalendarDays(end, now) : null
  const base = { plan, endsAt: end, daysLeft, lockAt: null }

  if (sub.status === 'canceled') return { ...base, state: 'canceled', hasAccess: false }
  if (!end) return { ...base, state: 'expired', hasAccess: false }
  if (now < end) return { ...base, state: sub.status === 'trialing' ? 'trialing' : 'active', hasAccess: true }
  if (sub.cancelAtPeriodEnd) return { ...base, state: 'canceled', hasAccess: false }

  const lockAt = addDays(end, Math.max(0, settings.graceDays))
  if (now < lockAt) return { ...base, state: 'past_due', hasAccess: true, lockAt }
  return { ...base, state: 'expired', hasAccess: false, lockAt }
}

// Features: with no plan (no record, or a plan that was removed) nothing is gated.
export const canUseFeature = (access: Pick<Access, 'plan'>, feature: FeatureKey) => !access.plan || access.plan.features.includes(feature)

export const staffLimit = (access: Pick<Access, 'plan'>): number | null => access.plan?.limits.staff ?? null

export const canAddStaff = (access: Pick<Access, 'plan'>, used: number) => {
  const limit = staffLimit(access)
  return limit === null || used < limit
}

// The cheapest plan that includes a feature (for "Available on Growth").
export const cheapestPlanWith = (plans: Plan[], feature: FeatureKey) =>
  plans.filter((p) => !p.archived && p.features.includes(feature)).sort((a, b) => a.monthlyPrice - b.monthlyPrice)[0] ?? null

// ── Money ────────────────────────────────────────────────────────────────────

export const priceFor = (plan: Pick<Plan, 'monthlyPrice' | 'yearlyPrice'>, cycle: BillingCycle) =>
  cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice

export const monthlyEquivalent = (plan: Pick<Plan, 'monthlyPrice' | 'yearlyPrice'>, cycle: BillingCycle) =>
  cycle === 'yearly' ? plan.yearlyPrice / 12 : plan.monthlyPrice

export const yearlySavings = (plan: Pick<Plan, 'monthlyPrice' | 'yearlyPrice'>) => Math.max(0, plan.monthlyPrice * 12 - plan.yearlyPrice)

export const cedis = (n: number, opts?: { compact?: boolean }) =>
  `₵${new Intl.NumberFormat('en-GH', opts?.compact && Math.abs(n) >= 10_000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)}`

export const cycleLabel = (cycle: BillingCycle) => (cycle === 'yearly' ? 'year' : 'month')
