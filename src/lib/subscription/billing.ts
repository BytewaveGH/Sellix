// Every change to a subscription is an action applied here. The local store
// runs these on the Next.js server; the backend implements the same rules
// (BACKEND_REQUIREMENTS.md §8). Pure: time and ids come in through `ctx`.

import { addDays, addMonths, addYears, format } from 'date-fns'
import * as z from 'zod'
import { FEATURE_KEYS } from './features'
import { accessFor, cedis, periodEnd } from './access'
import type { BillingCycle, BillingEvent, Catalog, Plan, Subscription } from './types'
import { isUsagePlan } from './usage'

export class BillingError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

const cycle = z.enum(['monthly', 'yearly'])
const planId = z.string().trim().min(1)

export const ActionSchema = z.discriminatedUnion('type', [
  // Start (or restart) a subscription. trialDays > 0 starts a trial; 0 means
  // payment is due now (record it next).
  z.object({ type: z.literal('assign'), planId, cycle, trialDays: z.number().int().min(0).max(365).default(0) }),
  // Switch plan; the current period's dates are kept. New price applies from the next payment.
  z.object({ type: z.literal('change-plan'), planId, cycle: cycle.optional() }),
  z.object({
    type: z.literal('record-payment'),
    amount: z.number().min(0).max(10_000_000),
    method: z.enum(['momo', 'bank', 'cash', 'card', 'other']),
    reference: z.string().trim().max(120).optional(),
    periods: z.number().int().min(1).max(24).default(1),
    paidAt: z.string().datetime().optional(),
  }),
  // Goodwill days on the trial or the paid period.
  z.object({ type: z.literal('extend'), days: z.number().int().min(1).max(365) }),
  z.object({ type: z.literal('cancel'), atPeriodEnd: z.boolean() }),
  z.object({ type: z.literal('resume') }),
  // Owners ask for a plan change; the platform approves or clears it.
  z.object({ type: z.literal('request-plan'), planId, cycle, note: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal('approve-request') }),
  z.object({ type: z.literal('clear-request') }),
])

export type BillingAction = z.input<typeof ActionSchema>
type ParsedAction = z.output<typeof ActionSchema>

// What a business owner may do to their own subscription.
export const OWNER_ACTIONS: ParsedAction['type'][] = ['request-plan', 'clear-request']

export const parseAction = (input: unknown): ParsedAction => {
  const r = ActionSchema.safeParse(input)
  if (!r.success) throw new BillingError(400, r.error.issues[0]?.message ?? 'Invalid billing action')
  return r.data
}

export interface ActionContext {
  now: Date
  actor: BillingEvent['actor']
  newId?: () => string
}

const day = (d: Date) => format(d, 'd MMM yyyy')
const addCycle = (from: Date, c: BillingCycle, n = 1) => (c === 'yearly' ? addYears(from, n) : addMonths(from, n))
const MAX_EVENTS = 200
const METHOD_LABEL = { momo: 'MoMo', bank: 'bank transfer', cash: 'cash', card: 'card', other: 'other' } as const

const findPlan = (catalog: Catalog, id: string, opts?: { allowArchived?: boolean }): Plan => {
  const plan = catalog.plans.find((p) => p.id === id)
  if (!plan) throw new BillingError(404, 'That plan doesn’t exist')
  if (plan.archived && !opts?.allowArchived) throw new BillingError(409, `${plan.name} is no longer offered`)
  return plan
}

const randomId = () => `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const applyAction = (
  current: Subscription | null,
  tenantId: number,
  input: unknown,
  catalog: Catalog,
  ctx: ActionContext
): Subscription => {
  const action = parseAction(input)
  const now = ctx.now
  const iso = now.toISOString()

  const log = (sub: Subscription, summary: string): Subscription => ({
    ...sub,
    updatedAt: iso,
    events: [...sub.events, { at: iso, type: action.type, summary, actor: ctx.actor }].slice(-MAX_EVENTS),
  })

  if (action.type === 'assign') {
    const plan = findPlan(catalog, action.planId)
    // Pay as you sell is billed after the month, from its sales: it starts
    // active, monthly, with the first bill due a month from now. No trial.
    if (plan.usage) {
      const end = addMonths(now, 1)
      return log(
        {
          tenantId,
          planId: plan.id,
          cycle: 'monthly',
          status: 'active',
          currentPeriodStart: iso,
          currentPeriodEnd: end.toISOString(),
          cancelAtPeriodEnd: false,
          payments: current?.payments ?? [],
          events: current?.events ?? [],
          updatedAt: iso,
        },
        `${plan.name} — first bill on ${day(end)}`
      )
    }
    const trial = action.trialDays > 0
    const end = trial ? addDays(now, action.trialDays) : now
    return log(
      {
        tenantId,
        planId: plan.id,
        cycle: action.cycle,
        status: trial ? 'trialing' : 'active',
        trialEndsAt: trial ? end.toISOString() : undefined,
        currentPeriodStart: iso,
        currentPeriodEnd: end.toISOString(),
        cancelAtPeriodEnd: false,
        payments: current?.payments ?? [],
        events: current?.events ?? [],
        updatedAt: iso,
      },
      trial
        ? `${plan.name} (${action.cycle}) with a ${action.trialDays}-day trial, to ${day(end)}`
        : `${plan.name} (${action.cycle}) — first payment due`
    )
  }

  if (!current) throw new BillingError(404, 'This business has no subscription yet')
  const sub = current
  const access = accessFor(sub, catalog.plans, catalog.settings, now)
  const currentPlan = catalog.plans.find((p) => p.id === sub.planId)
  // Moving onto pay as you sell starts its first month today. Time already
  // paid on a fixed plan isn't carried over (the platform settles it by hand).
  const startUsage = (s: Subscription, plan: Plan): Subscription => ({
    ...s,
    planId: plan.id,
    cycle: 'monthly',
    status: 'active',
    trialEndsAt: undefined,
    currentPeriodStart: iso,
    currentPeriodEnd: addMonths(now, 1).toISOString(),
    cancelAtPeriodEnd: false,
    canceledAt: undefined,
    request: undefined,
  })

  switch (action.type) {
    case 'change-plan': {
      const plan = findPlan(catalog, action.planId, { allowArchived: action.planId === sub.planId })
      const nextCycle = plan.usage ? 'monthly' : (action.cycle ?? sub.cycle)
      if (plan.id === sub.planId && nextCycle === sub.cycle) throw new BillingError(409, `Already on ${plan.name} (${nextCycle})`)
      if (plan.usage && !isUsagePlan(currentPlan)) return log(startUsage(sub, plan), `Plan changed to ${plan.name} — first bill on ${day(addMonths(now, 1))}`)
      return log({ ...sub, planId: plan.id, cycle: nextCycle, request: undefined }, `Plan changed to ${plan.name} (${nextCycle})`)
    }

    case 'record-payment': {
      const end = periodEnd(sub)
      // Paid time continues from the current end while it's still running, in
      // grace, or a trial (the trial's remaining days are kept). After a lapse
      // or a cancellation it starts today.
      const continues = end && (access.state === 'active' || access.state === 'past_due' || access.state === 'trialing')
      const start = continues ? end : now
      // Pay as you sell is paid after the month: the payment settles the
      // month just billed, and the next month runs on from its end.
      const usage = isUsagePlan(currentPlan)
      const until = addCycle(start, sub.cycle, usage ? 1 : action.periods)
      const covers = usage ? { periodStart: sub.currentPeriodStart, periodEnd: (end ?? now).toISOString() } : null
      const payment = {
        id: (ctx.newId ?? randomId)(),
        amount: action.amount,
        method: action.method,
        reference: action.reference || undefined,
        paidAt: action.paidAt ?? iso,
        periodStart: covers?.periodStart ?? start.toISOString(),
        periodEnd: covers?.periodEnd ?? until.toISOString(),
        planId: sub.planId,
        cycle: sub.cycle,
      }
      return log(
        {
          ...sub,
          status: 'active',
          trialEndsAt: undefined,
          currentPeriodStart: start.toISOString(),
          currentPeriodEnd: until.toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: undefined,
          payments: [...sub.payments, payment],
        },
        `${cedis(action.amount)} by ${METHOD_LABEL[action.method]}${action.reference ? ` (${action.reference})` : ''} — ${
          covers ? `bill for ${day(new Date(covers.periodStart))} – ${day(new Date(covers.periodEnd))} paid` : `paid to ${day(until)}`
        }`
      )
    }

    case 'extend': {
      const end = periodEnd(sub) ?? now
      const until = addDays(end > now ? end : now, action.days)
      const trialing = sub.status === 'trialing'
      return log(
        {
          ...sub,
          trialEndsAt: trialing ? until.toISOString() : sub.trialEndsAt,
          currentPeriodEnd: until.toISOString(),
        },
        `${trialing ? 'Trial' : 'Period'} extended by ${action.days} day${action.days === 1 ? '' : 's'}, to ${day(until)}`
      )
    }

    case 'cancel': {
      if (sub.status === 'canceled') throw new BillingError(409, 'Already canceled')
      if (action.atPeriodEnd) {
        const end = periodEnd(sub)
        return log({ ...sub, cancelAtPeriodEnd: true }, `Set to cancel${end ? ` on ${day(end)}` : ''}`)
      }
      return log({ ...sub, status: 'canceled', canceledAt: iso, cancelAtPeriodEnd: false }, 'Canceled — access stopped')
    }

    case 'resume': {
      if (sub.status !== 'canceled' && !sub.cancelAtPeriodEnd) throw new BillingError(409, 'Nothing to resume')
      const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null
      return log(
        {
          ...sub,
          status: sub.status === 'canceled' ? (trialEnd && trialEnd > now ? 'trialing' : 'active') : sub.status,
          cancelAtPeriodEnd: false,
          canceledAt: undefined,
        },
        'Cancellation undone'
      )
    }

    case 'request-plan': {
      const plan = findPlan(catalog, action.planId)
      const wanted = plan.usage ? 'monthly' : action.cycle
      if (plan.id === sub.planId && wanted === sub.cycle) throw new BillingError(409, `You’re already on ${plan.name}`)
      return log(
        { ...sub, request: { planId: plan.id, cycle: wanted, note: action.note || undefined, requestedAt: iso } },
        plan.usage ? `Requested ${plan.name}` : `Requested ${plan.name} (${wanted})`
      )
    }

    case 'approve-request': {
      if (!sub.request) throw new BillingError(409, 'There’s no pending request')
      const plan = findPlan(catalog, sub.request.planId)
      if (plan.usage && !isUsagePlan(currentPlan))
        return log(startUsage(sub, plan), `Request approved — now on ${plan.name}, first bill on ${day(addMonths(now, 1))}`)
      return log(
        { ...sub, planId: plan.id, cycle: sub.request.cycle, request: undefined },
        `Request approved — now on ${plan.name} (${sub.request.cycle})`
      )
    }

    case 'clear-request': {
      if (!sub.request) throw new BillingError(409, 'There’s no pending request')
      return log({ ...sub, request: undefined }, ctx.actor === 'owner' ? 'Request withdrawn' : 'Request declined')
    }
  }
}

// ── Catalog ──────────────────────────────────────────────────────────────────

// Percent of sales: 0–20%.
const rate = z.number().min(0, 'Rates can’t be negative').max(20, 'Rates above 20% aren’t allowed')
const UsageSchema = z
  .object({
    rates: z.object({
      retail: z.object({ zero: rate, staples: rate, general: rate, high: rate }),
      eatery: rate,
      amusement: rate,
      rent: rate,
      shortStays: rate,
    }),
    minimum: z.number().min(0).max(100_000),
    cap: z.number().min(0).max(1_000_000).nullable(),
  })
  .refine((u) => u.cap === null || u.cap >= u.minimum, 'The monthly cap must be at least the minimum')

const PlanSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Plan ids use lowercase letters, numbers and dashes'),
  name: z.string().trim().min(1, 'Every plan needs a name').max(40),
  tagline: z.string().trim().max(120).default(''),
  monthlyPrice: z.number().min(0).max(1_000_000),
  yearlyPrice: z.number().min(0).max(12_000_000),
  limits: z.object({ staff: z.number().int().min(0).max(100_000).nullable() }),
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])).transform((f) => Array.from(new Set(f))),
  trialDays: z.number().int().min(0).max(365),
  highlighted: z.boolean().optional(),
  archived: z.boolean().optional(),
  usage: UsageSchema.optional(),
})

const CatalogSchema = z.object({
  plans: z.array(PlanSchema).min(1, 'Keep at least one plan'),
  settings: z.object({
    currency: z.literal('GHS'),
    graceDays: z.number().int().min(0).max(90),
    paymentInstructions: z.string().trim().max(1000),
    supportContact: z.string().trim().max(200),
  }),
})

// Validates an edited catalog. Plans that businesses are on can be archived,
// never removed, so no subscription ever points at a missing plan.
export const parseCatalog = (input: unknown, inUse: Iterable<string> = []): Catalog => {
  const r = CatalogSchema.safeParse(input)
  if (!r.success) throw new BillingError(400, r.error.issues[0]?.message ?? 'Invalid catalog')
  const parsed = r.data as Catalog
  // Pay as you sell: every feature, unlimited staff, no price or trial.
  const catalog: Catalog = {
    ...parsed,
    plans: parsed.plans.map((p) =>
      p.usage ? { ...p, monthlyPrice: 0, yearlyPrice: 0, limits: { staff: null }, features: [...FEATURE_KEYS], trialDays: 0 } : p
    ),
  }
  const ids = catalog.plans.map((p) => p.id)
  if (new Set(ids).size !== ids.length) throw new BillingError(400, 'Two plans share an id')
  if (!catalog.plans.some((p) => !p.archived)) throw new BillingError(400, 'Keep at least one plan on offer')
  for (const id of Array.from(inUse)) {
    if (!ids.includes(id)) throw new BillingError(409, `Businesses are on “${id}” — archive it instead of deleting it`)
  }
  return catalog
}
