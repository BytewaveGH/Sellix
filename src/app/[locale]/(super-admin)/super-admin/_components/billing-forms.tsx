'use client'

// Operator drawers for one business's subscription: plan, payment, extend, cancel.

import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/kit/ui'
import { Drawer, Field, FormGrid, Input, Segmented, Toggle, toNum } from '@/components/kit/form'
import { accessFor, cedis, cycleLabel, priceFor } from '@/lib/subscription/access'
import { applyAction, type BillingAction } from '@/lib/subscription/billing'
import type { BillingCycle, Catalog, PaymentMethod, Plan, Subscription } from '@/lib/subscription/types'
import { METHOD_LABELS, shortDate } from '@/components/billing/bits'
import { useBillingActions } from '../_logics/billing'
import type { TenantRecord } from '../_logics/types'

export type BillingDrawer = 'plan' | 'payment' | 'extend' | 'cancel' | null

interface DrawerProps {
  tenant: TenantRecord
  sub: Subscription | null
  catalog: Catalog
  open: boolean
  onOpenChange: (o: boolean) => void
  // After a plan is assigned with payment due, offer to record it straight away.
  onNext?: (next: BillingDrawer) => void
}

// The resulting subscription if `action` were applied now — previews use the
// same rules as the server, so what you see is what gets saved.
const preview = (sub: Subscription | null, tenantId: number, action: BillingAction, catalog: Catalog) => {
  try {
    return applyAction(sub, tenantId, action, catalog, { now: new Date(), actor: 'platform', newId: () => 'preview' })
  } catch {
    return null
  }
}

const useSaving = () => {
  const [saving, setSaving] = useState(false)
  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setSaving(true)
    try {
      await fn()
      done()
    } catch {
      // toast shown by useBillingActions
    } finally {
      setSaving(false)
    }
  }
  return { saving, run }
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const PlanPicker = ({
  plans,
  value,
  onChange,
  cycle,
}: {
  plans: Plan[]
  value: string
  onChange: (id: string) => void
  cycle: BillingCycle
}) => (
  <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2">
    {plans.map((p) => {
      const on = p.id === value
      return (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(p.id)}
          className={cn(
            'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all',
            on ? 'border-endeavour bg-endeavour/[0.04] ring-2 ring-endeavour/15' : 'border-stone-200 hover:border-stone-300'
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-900">
              {p.name}
              {p.archived && <span className="ml-2 text-[10px] font-semibold text-stone-400 uppercase">Archived</span>}
            </span>
            <span className="block text-xs text-stone-500">
              {p.limits.staff === null ? 'Unlimited staff' : `${p.limits.staff} staff`} · {p.features.length} extra feature
              {p.features.length === 1 ? '' : 's'}
            </span>
          </span>
          <span className="text-sm font-extrabold text-stone-900 tabular-nums">
            {cedis(priceFor(p, cycle))}
            <span className="text-[11px] font-semibold text-stone-400">/{cycleLabel(cycle) === 'year' ? 'yr' : 'mo'}</span>
          </span>
          {on && <Check className="h-4 w-4 text-endeavour flex-shrink-0" />}
        </button>
      )
    })}
  </div>
)

export const PlanDrawer = ({ tenant, sub, catalog, open, onOpenChange, onNext }: DrawerProps) => {
  const actions = useBillingActions()
  const { saving, run } = useSaving()
  const access = accessFor(sub, catalog.plans, catalog.settings, new Date())
  // A running subscription changes plan; none, canceled or expired starts over.
  const restart = !sub || !access.hasAccess
  const offered = catalog.plans.filter((p) => !p.archived || p.id === sub?.planId)
  const [planId, setPlanId] = useState('')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [trial, setTrial] = useState(true)
  const [trialDays, setTrialDays] = useState('14')
  const plan = catalog.plans.find((p) => p.id === planId)

  useEffect(() => {
    if (!open) return
    const initial = sub?.request?.planId ?? sub?.planId ?? offered.find((p) => p.highlighted)?.id ?? offered[0]?.id ?? ''
    setPlanId(initial)
    setCycle(sub?.request?.cycle ?? sub?.cycle ?? 'monthly')
    // A business that has paid before doesn't get a second trial by default.
    setTrial(!sub?.payments.length)
    setTrialDays(String(catalog.plans.find((p) => p.id === initial)?.trialDays ?? 14))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const days = Math.max(0, Math.round(toNum(trialDays)))
  const action: BillingAction = restart
    ? { type: 'assign', planId, cycle, trialDays: trial ? days : 0 }
    : { type: 'change-plan', planId, cycle }
  const unchanged = !restart && planId === sub?.planId && cycle === sub?.cycle

  const save = () =>
    run(
      () => actions.act(tenant.id, action, restart ? `${tenant.name} is on ${plan?.name}` : `${tenant.name} moved to ${plan?.name}`),
      () => {
        onOpenChange(false)
        if (restart && !(trial && days > 0)) onNext?.('payment')
      }
    )

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={restart ? 'Assign a plan' : 'Change plan'}
      description={
        restart
          ? `Start ${tenant.name} on a plan, with a free trial or payment due now.`
          : 'Dates stay the same; the new price applies from the next payment.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!plan || unchanged}>
            {restart ? (trial && days > 0 ? 'Start trial' : 'Assign plan') : 'Change plan'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          ariaLabel="Billing cycle"
          value={cycle}
          onChange={setCycle}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
        />
        <PlanPicker plans={offered} value={planId} onChange={setPlanId} cycle={cycle} />
        {restart && (
          <div className="rounded-2xl border border-stone-200 p-4 flex flex-col gap-3">
            <Toggle checked={trial} onChange={setTrial} label="Start with a free trial" hint="Full access, no payment until it ends" />
            {trial && (
              <Field label="Trial length (days)" htmlFor="trial-days">
                <Input id="trial-days" type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
              </Field>
            )}
            {!trial && <p className="text-xs text-stone-500">Payment is due now — you can record it in the next step.</p>}
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Payment ──────────────────────────────────────────────────────────────────

const METHODS: PaymentMethod[] = ['momo', 'bank', 'cash', 'card', 'other']
const today = () => new Date().toISOString().slice(0, 10)

export const PaymentDrawer = ({ tenant, sub, catalog, open, onOpenChange }: DrawerProps) => {
  const actions = useBillingActions()
  const { saving, run } = useSaving()
  const plan = catalog.plans.find((p) => p.id === sub?.planId)
  const cycle = sub?.cycle ?? 'monthly'
  const periodOptions = cycle === 'yearly' ? [1, 2] : [1, 3, 6, 12]
  const [periods, setPeriods] = useState(1)
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('momo')
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(today())

  useEffect(() => {
    if (!open) return
    setPeriods(1)
    setAmountTouched(false)
    setMethod('momo')
    setReference('')
    setPaidOn(today())
  }, [open])
  // Amount follows the plan price until the operator types their own.
  useEffect(() => {
    if (!amountTouched) setAmount(plan ? String(priceFor(plan, cycle) * periods) : '')
  }, [plan, cycle, periods, amountTouched])

  // Noon local time, so the stored instant stays on the chosen calendar day.
  const paidAt = paidOn ? new Date(`${paidOn}T12:00:00`).toISOString() : undefined
  const action: BillingAction = {
    type: 'record-payment',
    amount: toNum(amount),
    method,
    reference: reference.trim() || undefined,
    periods,
    paidAt,
  }
  const result = useMemo(
    () => (sub ? preview(sub, tenant.id, action, catalog) : null),
    [sub, tenant.id, catalog, periods, amount, method, paidAt]
  ) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = !!sub && amount !== '' && toNum(amount, -1) >= 0 && !!paidOn && !!result

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Record a payment"
      description={`Money received from ${tenant.name}. Their plan renews from it straight away.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              run(
                () => actions.act(tenant.id, action, `Payment recorded for ${tenant.name}`),
                () => onOpenChange(false)
              )
            }
            loading={saving}
            disabled={!valid}
          >
            Record payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={`${cycle === 'yearly' ? 'Years' : 'Months'} paid for`}>
          <Segmented
            ariaLabel="Periods paid for"
            value={periods}
            onChange={setPeriods}
            options={periodOptions.map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>
        <FormGrid>
          <Field
            label="Amount received"
            hint={plan ? `${plan.name}: ${cedis(priceFor(plan, cycle))} per ${cycleLabel(cycle)}` : undefined}
            htmlFor="pay-amount"
          >
            <Input
              id="pay-amount"
              type="number"
              min={0}
              step="0.01"
              prefix="₵"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setAmountTouched(true)
              }}
            />
          </Field>
          <Field label="Paid on" htmlFor="pay-date">
            <Input id="pay-date" type="date" max={today()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </FormGrid>
        <Field label="Method">
          <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  'h-9 px-3.5 rounded-xl border text-xs font-semibold transition-colors',
                  method === m
                    ? 'border-endeavour bg-endeavour/[0.06] text-endeavour'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                )}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Reference" hint="MoMo transaction ID, bank reference or receipt number" htmlFor="pay-ref">
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </Field>
        {result && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2 flex-wrap">
            Covers
            <span className="font-semibold">{shortDate(result.currentPeriodStart)}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-semibold">{shortDate(result.currentPeriodEnd)}</span>
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Extend ───────────────────────────────────────────────────────────────────

export const ExtendDrawer = ({ tenant, sub, catalog, open, onOpenChange }: DrawerProps) => {
  const actions = useBillingActions()
  const { saving, run } = useSaving()
  const [days, setDays] = useState('7')
  useEffect(() => {
    if (open) setDays('7')
  }, [open])
  const n = Math.round(toNum(days))
  const action: BillingAction = { type: 'extend', days: n }
  const result = sub && n >= 1 && n <= 365 ? preview(sub, tenant.id, action, catalog) : null
  const what = sub?.status === 'trialing' ? 'trial' : 'paid period'
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Extend the ${what}`}
      description="Free days — for downtime, a goodwill gesture, or a payment that’s on its way."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              run(
                () => actions.act(tenant.id, action, `${tenant.name} extended by ${n} days`),
                () => onOpenChange(false)
              )
            }
            loading={saving}
            disabled={!result}
          >
            Extend
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {[7, 14, 30].map((d) => (
            <Button key={d} size="sm" variant={n === d ? 'primary' : 'secondary'} onClick={() => setDays(String(d))}>
              {d} days
            </Button>
          ))}
        </div>
        <Field label="Days" htmlFor="extend-days">
          <Input id="extend-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        {result && (
          <p className="text-sm text-stone-600">
            New end date: <span className="font-semibold text-stone-900">{shortDate(result.currentPeriodEnd)}</span>
          </p>
        )}
      </div>
    </Drawer>
  )
}

// ── Cancel ───────────────────────────────────────────────────────────────────

export const CancelDrawer = ({ tenant, sub, catalog, open, onOpenChange }: DrawerProps) => {
  const actions = useBillingActions()
  const { saving, run } = useSaving()
  const [when, setWhen] = useState<'end' | 'now'>('end')
  useEffect(() => {
    if (open) setWhen('end')
  }, [open])
  const access = accessFor(sub, catalog.plans, catalog.settings, new Date())
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel subscription"
      description="The business keeps its data either way, and you can undo this."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep subscription
          </Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={() =>
              run(
                () =>
                  actions.act(
                    tenant.id,
                    { type: 'cancel', atPeriodEnd: when === 'end' },
                    when === 'end' ? `${tenant.name} won’t renew` : `${tenant.name} canceled`
                  ),
                () => onOpenChange(false)
              )
            }
          >
            Cancel subscription
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="When to cancel" className="flex flex-col gap-2">
        {[
          {
            value: 'end' as const,
            title: 'At the end of the period',
            body: access.endsAt ? `Access continues until ${shortDate(access.endsAt)}, then stops.` : 'Access stops when the period ends.',
          },
          { value: 'now' as const, title: 'Immediately', body: 'The owner and staff lose access to the dashboard right away.' },
        ].map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={when === o.value}
            onClick={() => setWhen(o.value)}
            className={cn(
              'rounded-2xl border p-4 text-left transition-all',
              when === o.value ? 'border-rose-300 bg-rose-50/60 ring-2 ring-rose-200/60' : 'border-stone-200 hover:border-stone-300'
            )}
          >
            <span className="block text-sm font-bold text-stone-900">{o.title}</span>
            <span className="block text-xs text-stone-500 mt-0.5">{o.body}</span>
          </button>
        ))}
      </div>
    </Drawer>
  )
}

// ── Host ─────────────────────────────────────────────────────────────────────

// All four drawers for one business; `open` picks which one shows.
export const BillingDrawers = ({
  tenant,
  sub,
  catalog,
  open,
  onOpenChange,
}: {
  tenant: TenantRecord | null
  sub: Subscription | null
  catalog: Catalog | undefined
  open: BillingDrawer
  onOpenChange: (next: BillingDrawer) => void
}) => {
  if (!tenant || !catalog) return null
  const props = (which: Exclude<BillingDrawer, null>) => ({
    tenant,
    sub,
    catalog,
    open: open === which,
    onOpenChange: (o: boolean) => !o && onOpenChange(null),
    onNext: onOpenChange,
  })
  return (
    <>
      <PlanDrawer {...props('plan')} />
      <PaymentDrawer {...props('payment')} />
      <ExtendDrawer {...props('extend')} />
      <CancelDrawer {...props('cancel')} />
    </>
  )
}
