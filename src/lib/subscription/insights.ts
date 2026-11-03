// Billing figures for the super-admin console. Pure and tested.

import { addDays, format, startOfMonth, subMonths } from 'date-fns'
import { accessFor, monthlyEquivalent, type Access } from './access'
import type { BillingState, Catalog, Subscription } from './types'

export interface BillingRow<T extends { id: number }> {
  tenant: T
  sub: Subscription | null
  access: Access
}

export const billingRows = <T extends { id: number }>(tenants: T[], subs: Subscription[], catalog: Catalog, now: Date): BillingRow<T>[] => {
  const byTenant = new Map(subs.map((s) => [s.tenantId, s]))
  return tenants.map((tenant) => {
    const sub = byTenant.get(tenant.id) ?? null
    return { tenant, sub, access: accessFor(sub, catalog.plans, catalog.settings, now) }
  })
}

// Recurring revenue, as a monthly figure: businesses on a paid period (or in
// grace, expected to pay). Trials and lapsed businesses don't count.
export const mrr = (rows: BillingRow<{ id: number }>[]) =>
  rows.reduce(
    (sum, r) =>
      r.sub && r.access.plan && (r.access.state === 'active' || r.access.state === 'past_due')
        ? sum + monthlyEquivalent(r.access.plan, r.sub.cycle)
        : sum,
    0
  )

export const countByState = (rows: BillingRow<{ id: number }>[]) => {
  const counts: Record<BillingState, number> = { none: 0, trialing: 0, active: 0, past_due: 0, canceled: 0, expired: 0 }
  rows.forEach((r) => counts[r.access.state]++)
  return counts
}

// Payments received per calendar month (by paidAt), oldest first.
export const collectedByMonth = (subs: Subscription[], now: Date, months = 12) => {
  const buckets = Array.from({ length: months }, (_, i) => startOfMonth(subMonths(now, months - 1 - i)))
  const totals = new Map(buckets.map((b) => [format(b, 'yyyy-MM'), 0]))
  for (const s of subs) {
    for (const p of s.payments) {
      const d = new Date(p.paidAt)
      if (Number.isNaN(d.getTime())) continue
      const k = format(d, 'yyyy-MM')
      if (totals.has(k)) totals.set(k, totals.get(k)! + p.amount)
    }
  }
  return buckets.map((b) => {
    const key = format(b, 'yyyy-MM')
    return { key, label: format(b, 'MMM'), detail: format(b, 'MMMM yyyy'), value: totals.get(key) ?? 0 }
  })
}

export const collectedBetween = (subs: Subscription[], from: Date, to: Date) =>
  subs.reduce(
    (sum, s) =>
      sum +
      s.payments.reduce((t, p) => {
        const d = new Date(p.paidAt).getTime()
        return d >= from.getTime() && d < to.getTime() ? t + p.amount : t
      }, 0),
    0
  )

// How many businesses are on each plan (lapsed and canceled ones excluded).
export const planDistribution = (rows: BillingRow<{ id: number }>[], catalog: Catalog) =>
  catalog.plans.map((p) => ({
    plan: p,
    count: rows.filter((r) => r.access.plan?.id === p.id && r.access.hasAccess).length,
  }))

// Subscribers per plan id, any state — a plan with subscribers can't be deleted.
export const plansInUse = (subs: Subscription[]) => new Set(subs.map((s) => s.planId))

export interface Attention<T extends { id: number }> {
  requests: BillingRow<T>[]
  pastDue: BillingRow<T>[]
  expired: BillingRow<T>[]
  trialsEnding: BillingRow<T>[]
  renewals: BillingRow<T>[]
}

// What the console should prompt the operator about, most urgent first in each list.
export const billingAttention = <T extends { id: number }>(rows: BillingRow<T>[], now: Date, windowDays = 7): Attention<T> => {
  const soon = addDays(now, windowDays)
  const byEnd = (a: BillingRow<T>, b: BillingRow<T>) => (a.access.endsAt?.getTime() ?? 0) - (b.access.endsAt?.getTime() ?? 0)
  const ending = (r: BillingRow<T>) => !!r.access.endsAt && r.access.endsAt <= soon && !r.sub?.cancelAtPeriodEnd
  return {
    requests: rows
      .filter((r) => r.sub?.request)
      .sort((a, b) => +new Date(a.sub!.request!.requestedAt) - +new Date(b.sub!.request!.requestedAt)),
    pastDue: rows.filter((r) => r.access.state === 'past_due').sort(byEnd),
    expired: rows.filter((r) => r.access.state === 'expired').sort(byEnd),
    trialsEnding: rows.filter((r) => r.access.state === 'trialing' && ending(r)).sort(byEnd),
    renewals: rows.filter((r) => r.access.state === 'active' && ending(r)).sort(byEnd),
  }
}

export const attentionCount = (a: Attention<{ id: number }>) => a.requests.length + a.pastDue.length + a.expired.length
