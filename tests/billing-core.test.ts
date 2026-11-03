import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { accessFor, canAddStaff, canUseFeature, cheapestPlanWith, monthlyEquivalent } from '@/lib/subscription/access'
import { applyAction, parseAction, parseCatalog, type BillingAction } from '@/lib/subscription/billing'
import { featureForPath } from '@/lib/subscription/features'
import { billingAttention, billingRows, collectedByMonth, countByState, mrr, planDistribution } from '@/lib/subscription/insights'
import { DEFAULT_CATALOG } from '@/lib/subscription/plans'
import type { Catalog, Subscription } from '@/lib/subscription/types'

// Period maths runs in local time (date-fns); pin it so DST can't shift instants.
const TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'UTC'
})
afterAll(() => {
  process.env.TZ = TZ
})

const catalog: Catalog = structuredClone(DEFAULT_CATALOG)
const { plans, settings } = catalog // grace: 7 days
const at = (iso: string) => new Date(iso)

let n = 0
const run = (sub: Subscription | null, action: BillingAction, now: string, actor: 'platform' | 'owner' = 'platform', cat = catalog) =>
  applyAction(sub, 1, action, cat, { now: at(now), actor, newId: () => `p${++n}` })

const trial = () => run(null, { type: 'assign', planId: 'growth', cycle: 'monthly', trialDays: 14 }, '2026-10-01T10:00:00Z')
const paid = () => run(trial(), { type: 'record-payment', amount: 350, method: 'momo' }, '2026-10-20T10:00:00Z')

describe('access', () => {
  it('gives full access with no subscription, and gates nothing', () => {
    const a = accessFor(null, plans, settings, at('2026-10-01'))
    expect(a).toMatchObject({ state: 'none', hasAccess: true, plan: null })
    expect(canUseFeature(a, 'retail.analytics')).toBe(true)
    expect(canAddStaff(a, 999)).toBe(true)
  })

  it('moves trial → past due (grace) → expired by date alone', () => {
    const sub = trial()
    expect(accessFor(sub, plans, settings, at('2026-10-10T00:00:00Z'))).toMatchObject({ state: 'trialing', hasAccess: true, daysLeft: 5 })
    const due = accessFor(sub, plans, settings, at('2026-10-18T00:00:00Z'))
    expect(due).toMatchObject({ state: 'past_due', hasAccess: true })
    expect(due.lockAt?.toISOString()).toBe('2026-10-22T10:00:00.000Z')
    expect(accessFor(sub, plans, settings, at('2026-10-22T10:00:00Z'))).toMatchObject({ state: 'expired', hasAccess: false })
  })

  it('cancel at period end keeps access to the end, then stops with no grace', () => {
    const sub = run(paid(), { type: 'cancel', atPeriodEnd: true }, '2026-11-01T00:00:00Z')
    expect(accessFor(sub, plans, settings, at('2026-11-14T00:00:00Z')).state).toBe('active')
    expect(accessFor(sub, plans, settings, at('2026-11-15T10:00:01Z'))).toMatchObject({ state: 'canceled', hasAccess: false })
  })

  it('gates features and staff seats by plan', () => {
    const starter = run(null, { type: 'assign', planId: 'starter', cycle: 'monthly', trialDays: 14 }, '2026-10-01T00:00:00Z')
    const a = accessFor(starter, plans, settings, at('2026-10-02'))
    expect(canUseFeature(a, 'retail.analytics')).toBe(false)
    expect(canAddStaff(a, 2)).toBe(true)
    expect(canAddStaff(a, 3)).toBe(false)
    expect(cheapestPlanWith(plans, 'retail.analytics')?.id).toBe('growth')
    expect(cheapestPlanWith(plans, 'eatery.branding')?.id).toBe('pro')
  })

  it('maps dashboard URLs to features, ignoring locale; core pages need none', () => {
    expect(featureForPath('/en/stores/analytics')?.key).toBe('retail.analytics')
    expect(featureForPath('/fr/real-estate/bookings/42')?.key).toBe('real-estate.short-stays')
    expect(featureForPath('/en/stores/pos')).toBeNull()
    expect(featureForPath('/en/eatery')).toBeNull()
    expect(featureForPath('/en/stores/analyticsX')).toBeNull()
  })
})

describe('actions', () => {
  it('starts a trial, and a payment during it keeps the remaining trial days', () => {
    const sub = paid()
    expect(sub.status).toBe('active')
    expect(sub.trialEndsAt).toBeUndefined()
    expect(sub.currentPeriodStart).toBe('2026-10-15T10:00:00.000Z')
    expect(sub.currentPeriodEnd).toBe('2026-11-15T10:00:00.000Z')
    expect(sub.payments).toHaveLength(1)
    expect(sub.events.map((e) => e.type)).toEqual(['assign', 'record-payment'])
  })

  it('a late payment within grace continues from the old end; after lapse it starts today', () => {
    const late = run(paid(), { type: 'record-payment', amount: 350, method: 'cash' }, '2026-11-18T00:00:00Z')
    expect(late.currentPeriodStart).toBe('2026-11-15T10:00:00.000Z')
    const lapsed = run(paid(), { type: 'record-payment', amount: 350, method: 'cash' }, '2026-12-01T00:00:00Z')
    expect(lapsed.currentPeriodStart).toBe('2026-12-01T00:00:00.000Z')
    expect(lapsed.currentPeriodEnd).toBe('2027-01-01T00:00:00.000Z')
  })

  it('pays several periods at once, monthly or yearly', () => {
    const three = run(
      paid(),
      { type: 'record-payment', amount: 1050, method: 'bank', periods: 3, reference: 'TX-9' },
      '2026-11-01T00:00:00Z'
    )
    expect(three.currentPeriodEnd).toBe('2027-02-15T10:00:00.000Z')
    expect(three.payments.at(-1)).toMatchObject({ reference: 'TX-9', periodStart: '2026-11-15T10:00:00.000Z' })
    const yearly = run(
      run(null, { type: 'assign', planId: 'pro', cycle: 'yearly' }, '2026-10-01T00:00:00Z'),
      { type: 'record-payment', amount: 7500, method: 'momo' },
      '2026-10-01T00:00:00Z'
    )
    expect(yearly.currentPeriodEnd).toBe('2027-10-01T00:00:00.000Z')
  })

  it('assign without a trial makes payment due at once', () => {
    const sub = run(null, { type: 'assign', planId: 'starter', cycle: 'monthly' }, '2026-10-01T00:00:00Z')
    expect(accessFor(sub, plans, settings, at('2026-10-01T00:00:01Z')).state).toBe('past_due')
  })

  it('extends a trial or a lapsed period from today', () => {
    expect(run(trial(), { type: 'extend', days: 7 }, '2026-10-05T00:00:00Z').trialEndsAt).toBe('2026-10-22T10:00:00.000Z')
    expect(run(paid(), { type: 'extend', days: 3 }, '2026-12-10T00:00:00Z').currentPeriodEnd).toBe('2026-12-13T00:00:00.000Z')
  })

  it('cancels now or at period end, and resumes', () => {
    const now = run(paid(), { type: 'cancel', atPeriodEnd: false }, '2026-10-25T00:00:00Z')
    expect(accessFor(now, plans, settings, at('2026-10-25T00:00:01Z')).hasAccess).toBe(false)
    expect(() => run(now, { type: 'cancel', atPeriodEnd: false }, '2026-10-26T00:00:00Z')).toThrow(/Already canceled/)
    const back = run(now, { type: 'resume' }, '2026-10-26T00:00:00Z')
    expect(accessFor(back, plans, settings, at('2026-10-26T00:00:01Z')).state).toBe('active')
    expect(() => run(paid(), { type: 'resume' }, '2026-10-26T00:00:00Z')).toThrow(/Nothing to resume/)
  })

  it('handles owner plan requests: request, approve, clear', () => {
    const req = run(
      paid(),
      { type: 'request-plan', planId: 'pro', cycle: 'yearly', note: 'paying Friday' },
      '2026-10-21T00:00:00Z',
      'owner'
    )
    expect(req.request).toMatchObject({ planId: 'pro', cycle: 'yearly', note: 'paying Friday' })
    expect(req.events.at(-1)?.actor).toBe('owner')
    const approved = run(req, { type: 'approve-request' }, '2026-10-22T00:00:00Z')
    expect(approved).toMatchObject({ planId: 'pro', cycle: 'yearly', request: undefined, currentPeriodEnd: req.currentPeriodEnd })
    expect(run(req, { type: 'clear-request' }, '2026-10-22T00:00:00Z', 'owner').events.at(-1)?.summary).toBe('Request withdrawn')
    expect(() => run(paid(), { type: 'request-plan', planId: 'growth', cycle: 'monthly' }, '2026-10-21T00:00:00Z')).toThrow(
      /already on Growth/
    )
    expect(() => run(paid(), { type: 'approve-request' }, '2026-10-21T00:00:00Z')).toThrow(/no pending request/)
  })

  it('refuses archived or unknown plans, but keeps a business on its archived plan', () => {
    const cat = structuredClone(catalog)
    cat.plans[1].archived = true
    expect(() => run(null, { type: 'assign', planId: 'growth', cycle: 'monthly' }, '2026-10-01T00:00:00Z', 'platform', cat)).toThrow(
      /no longer offered/
    )
    expect(() => run(null, { type: 'assign', planId: 'nope', cycle: 'monthly' }, '2026-10-01T00:00:00Z')).toThrow(/doesn’t exist/)
    expect(run(paid(), { type: 'change-plan', planId: 'growth', cycle: 'yearly' }, '2026-10-21T00:00:00Z', 'platform', cat).cycle).toBe(
      'yearly'
    )
  })

  it('rejects malformed actions with a 400', () => {
    expect(() => parseAction({ type: 'record-payment', amount: -5, method: 'momo' })).toThrow()
    expect(() => parseAction({ type: 'hack' })).toThrow()
    try {
      parseAction({ type: 'extend', days: 0 })
    } catch (e: any) {
      expect(e.status).toBe(400)
    }
    expect(() => run(null, { type: 'extend', days: 3 }, '2026-10-01T00:00:00Z')).toThrow(/no subscription/)
  })
})

describe('catalog', () => {
  it('validates edits and blocks deleting a plan businesses are on', () => {
    expect(parseCatalog(catalog).plans).toHaveLength(3)
    expect(() => parseCatalog({ ...catalog, plans: [...catalog.plans, catalog.plans[0]] })).toThrow(/share an id/)
    expect(() => parseCatalog({ ...catalog, plans: [{ ...catalog.plans[0], features: ['retail.nope'] }] })).toThrow()
    expect(() => parseCatalog({ ...catalog, plans: catalog.plans.map((p) => ({ ...p, archived: true })) })).toThrow(/on offer/)
    expect(() => parseCatalog({ ...catalog, plans: catalog.plans.slice(1) }, ['starter'])).toThrow(/archive it/)
  })
})

describe('console insights', () => {
  const tenants = [1, 2, 3, 4, 5].map((id) => ({ id }))
  const now = at('2026-11-20T12:00:00Z')
  const mk = (id: number, sub: Subscription) => ({ ...sub, tenantId: id })
  const subs = [
    mk(1, paid()), // paid to 15 Nov → in grace on 20 Nov
    mk(2, run(paid(), { type: 'record-payment', amount: 350, method: 'momo' }, '2026-11-10T00:00:00Z')), // paid to 15 Dec
    mk(3, run(null, { type: 'assign', planId: 'pro', cycle: 'yearly', trialDays: 5 }, '2026-11-18T00:00:00Z')), // trial ends 23 Nov
    mk(4, run(paid(), { type: 'request-plan', planId: 'pro', cycle: 'monthly' }, '2026-11-01T00:00:00Z')),
  ]
  const rows = billingRows(tenants, subs, catalog, now)

  it('counts states and recurring revenue (trials excluded)', () => {
    expect(countByState(rows)).toMatchObject({ none: 1, trialing: 1, active: 1, past_due: 2 })
    expect(mrr(rows)).toBe(350 * 3)
    expect(monthlyEquivalent(plans[2], 'yearly')).toBe(625)
  })

  it('buckets collected money by month and lists what needs attention', () => {
    const months = collectedByMonth(subs, now, 2)
    expect(months.map((m) => [m.key, m.value])).toEqual([
      ['2026-10', 1050],
      ['2026-11', 350],
    ])
    const a = billingAttention(rows, now)
    expect(a.requests.map((r) => r.tenant.id)).toEqual([4])
    expect(a.pastDue.map((r) => r.tenant.id).sort()).toEqual([1, 4])
    expect(a.trialsEnding.map((r) => r.tenant.id)).toEqual([3])
    expect(planDistribution(rows, catalog).map((d) => d.count)).toEqual([0, 3, 1])
  })
})

describe('file store', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'billing-'))
    process.env.BILLING_FILE = path.join(dir, 'billing.json')
  })
  afterEach(async () => {
    delete process.env.BILLING_FILE
    vi.unstubAllGlobals()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('persists actions in order, guards the catalog, and resolves an owner by slug', async () => {
    const { fileStore } = await import('@/lib/subscription/server-store')
    const store = fileStore(() => at('2026-10-01T00:00:00Z'))
    expect((await store.catalog()).plans.map((p) => p.id)).toEqual(['starter', 'growth', 'pro'])

    // Concurrent writes are serialised, none lost.
    await Promise.all([
      store.act(7, { type: 'assign', planId: 'growth', cycle: 'monthly', trialDays: 14 }),
      store.act(8, { type: 'assign', planId: 'starter', cycle: 'monthly', trialDays: 14 }),
    ])
    await store.act(7, { type: 'record-payment', amount: 350, method: 'momo' })
    expect((await store.list()).map((s) => s.tenantId).sort()).toEqual([7, 8])
    expect((await store.get(7))?.payments).toHaveLength(1)

    const cat = await store.catalog()
    await expect(store.saveCatalog({ ...cat, plans: cat.plans.filter((p) => p.id !== 'growth') })).rejects.toThrow(/archive it/)
    await store.saveCatalog({ ...cat, plans: cat.plans.map((p) => (p.id === 'pro' ? { ...p, monthlyPrice: 800 } : p)) })
    expect((await store.catalog()).plans[2].monthlyPrice).toBe(800)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 7, slug: 'belkis' }] }), { status: 200 }))
    )
    const mine = await store.forTenant({ tenant: 'belkis', accessToken: 't' })
    expect(mine.subscription?.tenantId).toBe(7)
    await store.actForTenant({ tenant: 'belkis', accessToken: 't' }, { type: 'request-plan', planId: 'pro', cycle: 'monthly' })
    expect((await store.get(7))?.events.at(-1)).toMatchObject({ actor: 'owner', type: 'request-plan' })
  })
})
