// Pay as you sell: no monthly price, every feature, a service fee on each
// month's sales, billed after the month (src/lib/subscription/usage.ts).
import { accessFor, canAddStaff, canUseFeature, cheapestPlanWith, staffLimit } from '@/lib/subscription/access'
import { applyAction, parseCatalog, type BillingAction } from '@/lib/subscription/billing'
import { FEATURE_KEYS } from '@/lib/subscription/features'
import { DEFAULT_CATALOG } from '@/lib/subscription/plans'
import type { Catalog, Subscription } from '@/lib/subscription/types'
import {
  DEFAULT_USAGE_PRICING,
  EMPTY_SALES,
  feeClassOf,
  ratesFor,
  salesOf,
  usageBill,
  type UsageSales,
} from '@/lib/subscription/usage'

const TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'UTC'
})
afterAll(() => {
  process.env.TZ = TZ
})

const catalog: Catalog = structuredClone(DEFAULT_CATALOG)
const usagePlan = catalog.plans.find((p) => p.id === 'pay-as-you-sell')!
const at = (iso: string) => new Date(iso)
let n = 0
const run = (sub: Subscription | null, action: BillingAction, now: string) =>
  applyAction(sub, 1, action, catalog, { now: at(now), actor: 'platform', newId: () => `p${++n}` })

const sales = (over: Partial<Omit<UsageSales, 'retail'>> & { retail?: Partial<UsageSales['retail']> }): UsageSales => ({
  ...EMPTY_SALES,
  ...over,
  retail: { ...EMPTY_SALES.retail, ...over.retail },
})

describe('the bill', () => {
  it('charges each kind of sale at its rate', () => {
    const bill = usageBill(sales({ retail: { staples: 20_000, general: 30_000, high: 10_000, zero: 50_000 } }), DEFAULT_USAGE_PRICING)
    // 0.5% of 20,000 + 1% of 30,000 + 1.5% of 10,000 + 0% of 50,000
    expect(bill.lines.map((l) => [l.key, l.fee])).toEqual([
      ['retail.zero', 0],
      ['retail.staples', 100],
      ['retail.general', 300],
      ['retail.high', 150],
    ])
    expect(bill).toMatchObject({ sales: 110_000, fees: 550, total: 550, adjustment: null })
  })

  it('every module has its own rate', () => {
    const bill = usageBill(sales({ eatery: 40_000, amusement: 10_000, rent: 60_000, shortStays: 5_000 }), DEFAULT_USAGE_PRICING)
    expect(Object.fromEntries(bill.lines.map((l) => [l.key, l.fee]))).toEqual({ eatery: 400, amusement: 150, rent: 300, shortStays: 100 })
    expect(bill.total).toBe(950)
  })

  it('a quiet month pays the ₵50 minimum', () => {
    const bill = usageBill(sales({ eatery: 1_200 }), DEFAULT_USAGE_PRICING)
    expect(bill).toMatchObject({ fees: 12, total: 50, adjustment: 'minimum' })
    expect(usageBill(EMPTY_SALES, DEFAULT_USAGE_PRICING)).toMatchObject({ lines: [], fees: 0, total: 50, adjustment: 'minimum' })
  })

  it('a big month stops at the ₵1,000 cap', () => {
    const bill = usageBill(sales({ retail: { general: 250_000 } }), DEFAULT_USAGE_PRICING)
    expect(bill).toMatchObject({ fees: 2500, total: 1000, adjustment: 'cap' })
    expect(usageBill(sales({ retail: { general: 250_000 } }), { ...DEFAULT_USAGE_PRICING, cap: null }).total).toBe(2500)
  })

  it('rounds each line to the pesewa', () => {
    expect(usageBill(sales({ retail: { general: 12_345.67 } }), { ...DEFAULT_USAGE_PRICING, minimum: 0 }).total).toBe(123.46)
  })

  it('fills gaps in what the backend reports, and ignores nonsense', () => {
    expect(salesOf({ sales: { eatery: 500, retail: { high: -3 } } as any })).toEqual(sales({ eatery: 500 }))
    expect(salesOf(null)).toEqual(EMPTY_SALES)
  })

  it('products without a fee type count as general goods', () => {
    expect(feeClassOf(undefined)).toBe('general')
    expect(feeClassOf('nonsense')).toBe('general')
    expect(feeClassOf('zero')).toBe('zero')
  })

  it('shows each module only its own rates', () => {
    expect(ratesFor('eatery', DEFAULT_USAGE_PRICING.rates)).toEqual([{ label: 'Orders (counter and online)', rate: 1 }])
    expect(ratesFor('retail', DEFAULT_USAGE_PRICING.rates).map((r) => r.rate)).toEqual([0, 0.5, 1, 1.5])
    expect(ratesFor('real-estate', DEFAULT_USAGE_PRICING.rates).map((r) => r.rate)).toEqual([0.5, 2])
  })
})

describe('the plan', () => {
  it('includes every feature and unlimited staff', () => {
    const access = accessFor(run(null, { type: 'assign', planId: usagePlan.id, cycle: 'yearly', trialDays: 14 }, '2026-11-01T10:00:00Z'), catalog.plans, catalog.settings, at('2026-11-02'))
    for (const f of FEATURE_KEYS) expect(canUseFeature(access, f)).toBe(true)
    expect(staffLimit(access)).toBeNull()
    expect(canAddStaff(access, 500)).toBe(true)
  })

  it('is never suggested as the cheapest upgrade (it has no price to compare)', () => {
    expect(cheapestPlanWith(catalog.plans, 'retail.analytics')?.id).toBe('growth')
  })

  it('starts active and monthly with the first bill a month later — no trial, nothing due now', () => {
    const sub = run(null, { type: 'assign', planId: usagePlan.id, cycle: 'yearly', trialDays: 14 }, '2026-11-01T10:00:00Z')
    expect(sub).toMatchObject({ status: 'active', cycle: 'monthly', currentPeriodEnd: '2026-12-01T10:00:00.000Z' })
    expect(sub.trialEndsAt).toBeUndefined()
    expect(accessFor(sub, catalog.plans, catalog.settings, at('2026-11-20')).state).toBe('active')
    expect(sub.events.at(-1)?.summary).toMatch(/first bill on 1 Dec 2026/)
  })

  it('after the month the bill is due, with the usual grace period, then locks', () => {
    const sub = run(null, { type: 'assign', planId: usagePlan.id, cycle: 'monthly', trialDays: 0 }, '2026-11-01T10:00:00Z')
    expect(accessFor(sub, catalog.plans, catalog.settings, at('2026-12-03')).state).toBe('past_due')
    expect(accessFor(sub, catalog.plans, catalog.settings, at('2026-12-09')).state).toBe('expired')
  })

  it('a payment settles the month just billed, and the next month runs on', () => {
    const sub = run(null, { type: 'assign', planId: usagePlan.id, cycle: 'monthly', trialDays: 0 }, '2026-11-01T10:00:00Z')
    const paid = run(sub, { type: 'record-payment', amount: 412.5, method: 'momo', periods: 6 }, '2026-12-03T10:00:00Z')
    expect(paid.payments.at(-1)).toMatchObject({
      amount: 412.5,
      periodStart: '2026-11-01T10:00:00.000Z',
      periodEnd: '2026-12-01T10:00:00.000Z',
    })
    // One month at a time, whatever "periods" says.
    expect(paid).toMatchObject({ currentPeriodStart: '2026-12-01T10:00:00.000Z', currentPeriodEnd: '2027-01-01T10:00:00.000Z' })
    expect(paid.events.at(-1)?.summary).toMatch(/bill for 1 Nov 2026 – 1 Dec 2026 paid/)
  })

  it('moving onto it from a fixed plan starts its first month that day', () => {
    const growth = run(null, { type: 'assign', planId: 'growth', cycle: 'yearly', trialDays: 14 }, '2026-10-01T10:00:00Z')
    const moved = run(growth, { type: 'change-plan', planId: usagePlan.id, cycle: 'yearly' }, '2026-10-05T10:00:00Z')
    expect(moved).toMatchObject({
      planId: usagePlan.id,
      cycle: 'monthly',
      status: 'active',
      currentPeriodStart: '2026-10-05T10:00:00.000Z',
      currentPeriodEnd: '2026-11-05T10:00:00.000Z',
    })
    expect(moved.trialEndsAt).toBeUndefined()
  })

  it('owners can ask for it; the request is always monthly', () => {
    const growth = run(null, { type: 'assign', planId: 'growth', cycle: 'yearly', trialDays: 14 }, '2026-10-01T10:00:00Z')
    const asked = applyAction(growth, 1, { type: 'request-plan', planId: usagePlan.id, cycle: 'yearly' }, catalog, {
      now: at('2026-10-02T10:00:00Z'),
      actor: 'owner',
    })
    expect(asked.request).toMatchObject({ planId: usagePlan.id, cycle: 'monthly' })
    const approved = run(asked, { type: 'approve-request' }, '2026-10-03T10:00:00Z')
    expect(approved).toMatchObject({ planId: usagePlan.id, currentPeriodEnd: '2026-11-03T10:00:00.000Z' })
  })
})

describe('the catalog', () => {
  it('normalises a pay-as-you-sell plan: no price, every feature, unlimited staff, no trial', () => {
    const edited = structuredClone(catalog)
    const p = edited.plans.find((x) => x.id === usagePlan.id)!
    Object.assign(p, { monthlyPrice: 99, yearlyPrice: 999, features: [], limits: { staff: 2 }, trialDays: 30 })
    const saved = parseCatalog(edited).plans.find((x) => x.id === usagePlan.id)!
    expect(saved).toMatchObject({ monthlyPrice: 0, yearlyPrice: 0, limits: { staff: null }, trialDays: 0 })
    expect(saved.features).toEqual(FEATURE_KEYS)
  })

  it('rejects rates above 20% and a cap below the minimum', () => {
    const bad = (usage: object) => {
      const edited = structuredClone(catalog)
      Object.assign(edited.plans.find((x) => x.id === usagePlan.id)!, { usage })
      return () => parseCatalog(edited)
    }
    expect(bad({ ...DEFAULT_USAGE_PRICING, rates: { ...DEFAULT_USAGE_PRICING.rates, eatery: 25 } })).toThrow(/20%/)
    expect(bad({ ...DEFAULT_USAGE_PRICING, minimum: 100, cap: 50 })).toThrow(/at least the minimum/)
  })
})
