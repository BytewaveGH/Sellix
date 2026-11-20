// "Pay as you sell": a plan with no monthly price. The business uses every
// feature, with unlimited staff, and pays a small service fee on what it
// sells, worked out each month (billed in arrears).
//
// The fee is counted by the backend from the sales it has received (offline
// sales count once they sync), never on the till. These rules are pure so the
// owner's page, the console and the backend (BACKEND_REQUIREMENTS.md §8.5)
// agree on the bill.

import type { Plan } from './types'

// ── Fee types (store POS) ────────────────────────────────────────────────────
// Each retail product has one. Owners pick the type; the platform sets what
// each type costs, so nobody types their own rate.

export const FEE_CLASSES = [
  { key: 'zero', label: 'Very thin margin', examples: 'Airtime, MoMo float, fuel, gas refills' },
  { key: 'staples', label: 'Staples', examples: 'Rice, oil, sugar, bread, phones and electronics' },
  { key: 'general', label: 'General goods', examples: 'Most other products' },
  { key: 'high', label: 'High margin', examples: 'Cosmetics, fashion, accessories, perfume' },
] as const

export type FeeClass = (typeof FEE_CLASSES)[number]['key']
export const FEE_CLASS_KEYS = FEE_CLASSES.map((c) => c.key) as FeeClass[]
export const DEFAULT_FEE_CLASS: FeeClass = 'general'

// Anything unknown or missing counts as general goods.
export const feeClassOf = (v: unknown): FeeClass => (FEE_CLASS_KEYS.includes(v as FeeClass) ? (v as FeeClass) : DEFAULT_FEE_CLASS)

// ── Pricing ──────────────────────────────────────────────────────────────────

// Percent of sales, e.g. 1 = 1%.
export interface UsageRates {
  retail: Record<FeeClass, number>
  eatery: number
  amusement: number
  // Real estate: rent recorded as paid, and short-stay bookings.
  rent: number
  shortStays: number
}

export interface UsagePricing {
  rates: UsageRates
  // Whole cedis per month. The bill is at least `minimum` and at most `cap`
  // (null = no cap).
  minimum: number
  cap: number | null
}

export const DEFAULT_USAGE_PRICING: UsagePricing = {
  rates: {
    retail: { zero: 0, staples: 0.5, general: 1, high: 1.5 },
    eatery: 1,
    amusement: 1.5,
    rent: 0.5,
    shortStays: 2,
  },
  minimum: 50,
  cap: 1000,
}

export const isUsagePlan = (plan: Pick<Plan, 'usage'> | null | undefined): plan is Plan & { usage: UsagePricing } => !!plan?.usage

// ── Sales and the bill ───────────────────────────────────────────────────────

// Sales in one billing period, in cedis: completed sales after discounts,
// without cancelled or refunded sales, delivery fees or VAT.
export interface UsageSales {
  retail: Record<FeeClass, number>
  eatery: number
  amusement: number
  rent: number
  shortStays: number
}

// What the backend reports for a business's current billing period.
export interface UsageReport {
  periodStart: string
  periodEnd: string
  sales: Partial<Omit<UsageSales, 'retail'>> & { retail?: Partial<Record<FeeClass, number>> }
  // When the figures were last counted.
  updatedAt: string
}

export const EMPTY_SALES: UsageSales = {
  retail: { zero: 0, staples: 0, general: 0, high: 0 },
  eatery: 0,
  amusement: 0,
  rent: 0,
  shortStays: 0,
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

// Fills gaps in a report's sales with zeros (the backend may leave out modules).
export const salesOf = (report: Pick<UsageReport, 'sales'> | null | undefined): UsageSales => {
  const s = report?.sales ?? {}
  return {
    retail: {
      zero: num(s.retail?.zero),
      staples: num(s.retail?.staples),
      general: num(s.retail?.general),
      high: num(s.retail?.high),
    },
    eatery: num(s.eatery),
    amusement: num(s.amusement),
    rent: num(s.rent),
    shortStays: num(s.shortStays),
  }
}

export interface BillLine {
  key: string
  label: string
  sales: number
  // Percent
  rate: number
  fee: number
}

export interface UsageBill {
  // Only lines with sales, in a fixed order.
  lines: BillLine[]
  sales: number
  // Sum of the line fees, before the minimum and cap.
  fees: number
  total: number
  // Why total differs from fees, if it does.
  adjustment: 'minimum' | 'cap' | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

const LINES: { key: string; label: string; sales: (s: UsageSales) => number; rate: (r: UsageRates) => number }[] = [
  ...FEE_CLASSES.map((c) => ({
    key: `retail.${c.key}`,
    label: `Store · ${c.label}`,
    sales: (s: UsageSales) => s.retail[c.key],
    rate: (r: UsageRates) => r.retail[c.key],
  })),
  { key: 'eatery', label: 'Eatery orders', sales: (s) => s.eatery, rate: (r) => r.eatery },
  { key: 'amusement', label: 'Tickets & counter', sales: (s) => s.amusement, rate: (r) => r.amusement },
  { key: 'rent', label: 'Rent collected', sales: (s) => s.rent, rate: (r) => r.rent },
  { key: 'shortStays', label: 'Short stays', sales: (s) => s.shortStays, rate: (r) => r.shortStays },
]

// The bill for one period. Each line's fee is rounded to the pesewa; then the
// monthly minimum and cap apply to the sum.
export const usageBill = (sales: UsageSales, pricing: UsagePricing): UsageBill => {
  const lines = LINES.map((l) => {
    const amount = round2(l.sales(sales))
    const rate = l.rate(pricing.rates)
    return { key: l.key, label: l.label, sales: amount, rate, fee: round2((amount * rate) / 100) }
  }).filter((l) => l.sales > 0)
  const fees = round2(lines.reduce((s, l) => s + l.fee, 0))
  let total = fees
  let adjustment: UsageBill['adjustment'] = null
  if (pricing.cap !== null && total > pricing.cap) {
    total = pricing.cap
    adjustment = 'cap'
  } else if (total < pricing.minimum) {
    total = pricing.minimum
    adjustment = 'minimum'
  }
  return { lines, sales: round2(lines.reduce((s, l) => s + l.sales, 0)), fees, total: round2(total), adjustment }
}

// "1%", "0.5%", "0%"
export const percent = (n: number) => `${Number(n.toFixed(2))}%`

// The rates that matter to one module, for the owner's page.
export const ratesFor = (module: string, rates: UsageRates): { label: string; rate: number; hint?: string }[] => {
  switch (module) {
    case 'eatery':
      return [{ label: 'Orders (counter and online)', rate: rates.eatery }]
    case 'amusement':
      return [{ label: 'Tickets and counter sales', rate: rates.amusement }]
    case 'real-estate':
      return [
        { label: 'Rent recorded as paid', rate: rates.rent },
        { label: 'Short-stay bookings', rate: rates.shortStays },
      ]
    default:
      return FEE_CLASSES.map((c) => ({ label: c.label, rate: rates.retail[c.key], hint: c.examples }))
  }
}
