'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Check, Clock, Gem, Minus, Receipt, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button, Card, EmptyState, ErrorNote, PageHeader, Ring, SectionTitle, Skeleton } from '@/components/kit/ui'
import { Drawer, Field, Segmented, Textarea } from '@/components/kit/form'
import { cedis, cycleLabel, monthlyEquivalent, priceFor, staffLimit, yearlySavings } from '@/lib/subscription/access'
import { featuresFor } from '@/lib/subscription/features'
import { useBilling, useBillingRequest } from '@/lib/subscription/client'
import type { BillingCycle, Plan } from '@/lib/subscription/types'
import { verticalMeta } from '@/lib/verticals'
import { useFetchData } from '@/hooks/use-fetch'
import { EmployeeServices } from '@/lib/account'
import type { IGeneric } from '@/types/interfaces'
import { BillingPill, METHOD_LABELS, PeriodBar, accessLine, shortDate } from '@/components/billing/bits'
import { HowToPay } from '@/components/billing/gate'

export default function BillingPage() {
  const { data: session, status } = useSession()
  const billing = useBilling()
  const { access, subscription: sub, catalog } = billing
  const request = useBillingRequest()
  const appType = session?.user?.appType ?? 'retail'
  const moduleFeatures = featuresFor(appType)
  const [cycle, setCycle] = useState<BillingCycle>(sub?.cycle ?? 'monthly')
  const [asking, setAsking] = useState<Plan | null>(null)
  const [note, setNote] = useState('')
  // Show prices in the business's own cycle once billing has loaded.
  useEffect(() => {
    if (sub?.cycle) setCycle(sub.cycle)
  }, [sub?.cycle])

  const { data: staffRaw, isLoading: staffLoading } = useFetchData('employees', EmployeeServices.FetchAll() as unknown as IGeneric)
  const staffUsed = Array.isArray(staffRaw) ? staffRaw.length : 0
  const seatLimit = staffLimit(access)

  const plans = useMemo(() => catalog.plans.filter((p) => !p.archived || p.id === sub?.planId), [catalog.plans, sub?.planId])
  const bestSaving = Math.max(0, ...plans.map((p) => (p.monthlyPrice ? yearlySavings(p) / (p.monthlyPrice * 12) : 0)))
  const pending = sub?.request ? catalog.plans.find((p) => p.id === sub.request!.planId) : null
  const payments = [...(sub?.payments ?? [])].sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt))

  if (status === 'loading' || !billing.settled) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-72" />
      </div>
    )
  }
  if (!billing.isOwner) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Only the owner manages the plan"
        description="Ask the business owner about plans and payments."
      />
    )
  }

  const sendRequest = async () => {
    if (!asking) return
    try {
      await request.mutateAsync({ type: 'request-plan', planId: asking.id, cycle, note: note.trim() || undefined })
      toast.success(`Request for ${asking.name} sent`)
      setAsking(null)
      setNote('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t send the request')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader eyebrow="Account" title="Plan & billing" description="Your Bytewave plan, what it includes and your payments." />
      {billing.unavailable && <ErrorNote message="Billing details can’t be loaded right now. Your dashboard keeps working as normal." />}

      {/* Current plan + seats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          {sub && access.plan ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-stone-500">Current plan</p>
                  <div className="flex items-center gap-2 mt-1">
                    <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">{access.plan.name}</h2>
                    <BillingPill state={access.state} />
                  </div>
                  <p className="text-sm text-stone-500 mt-1">{accessLine(access, sub)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold text-stone-900 tabular-nums">{cedis(priceFor(access.plan, sub.cycle))}</p>
                  <p className="text-xs text-stone-500">per {cycleLabel(sub.cycle)}</p>
                </div>
              </div>
              <PeriodBar sub={sub} access={access} className="mt-5" />
            </>
          ) : (
            <div className="flex items-start gap-4">
              <span className="h-11 w-11 rounded-xl bg-endeavour/10 text-endeavour flex items-center justify-center flex-shrink-0">
                <Gem className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-stone-900">Early access</h2>
                <p className="text-sm text-stone-500 mt-1 max-w-lg">
                  No plan has been set for your business yet, so every feature is open. Pick a plan below whenever you’re ready.
                </p>
              </div>
            </div>
          )}
          {sub?.request && pending && (
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <Clock className="h-4 w-4 text-sky-700 flex-shrink-0 hidden sm:block" />
              <p className="text-sm text-sky-900 flex-1">
                You asked to move to <span className="font-semibold">{pending.name}</span> ({sub.request.cycle}) on{' '}
                {shortDate(sub.request.requestedAt)}. The Bytewave team will confirm it.
              </p>
              <Button
                size="sm"
                variant="secondary"
                loading={request.isPending}
                onClick={() =>
                  request.mutate(
                    { type: 'clear-request' },
                    {
                      onSuccess: () => toast.success('Request withdrawn'),
                      onError: (e) => toast.error(e.message),
                    }
                  )
                }
              >
                Withdraw
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6 flex items-center gap-5">
          <Ring value={seatLimit ? staffUsed / seatLimit : 0} size={84}>
            <Users className="h-5 w-5 text-endeavour" />
          </Ring>
          <div>
            <p className="text-xs font-semibold text-stone-500">Staff accounts</p>
            <p className="text-[26px] font-extrabold tracking-tight text-stone-900 tabular-nums leading-none mt-1">
              {staffLoading ? '—' : staffUsed}
              <span className="text-base font-bold text-stone-400"> / {seatLimit ?? '∞'}</span>
            </p>
            <p className="text-xs text-stone-500 mt-1.5">
              {seatLimit === null
                ? 'Unlimited on your plan'
                : staffUsed >= seatLimit
                  ? 'All seats used — upgrade to add more'
                  : `${seatLimit - staffUsed} seat${seatLimit - staffUsed === 1 ? '' : 's'} left`}
            </p>
          </div>
        </Card>
      </div>

      {/* Plans */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
          <SectionTitle title="Plans" hint={`What each plan includes for your ${verticalMeta(appType).short.toLowerCase()} business`} />
          <div className="sm:w-72">
            <Segmented
              ariaLabel="Billing cycle"
              value={cycle}
              onChange={setCycle}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: bestSaving > 0 ? `Yearly · save ${Math.round(bestSaving * 100)}%` : 'Yearly' },
              ]}
            />
          </div>
        </div>
        <div className={cn('grid gap-4', plans.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
          {plans.map((p) => {
            const current = p.id === sub?.planId && cycle === sub?.cycle
            const requested = sub?.request?.planId === p.id && sub.request.cycle === cycle
            return (
              <Card
                key={p.id}
                className={cn('p-5 flex flex-col relative', p.highlighted && 'ring-2 ring-endeavour/70 border-transparent')}
                aria-label={`${p.name} plan`}
              >
                {p.highlighted && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-endeavour px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}
                <p className="text-base font-extrabold text-stone-900">{p.name}</p>
                <p className="text-xs text-stone-500 mt-0.5 min-h-[2rem]">{p.tagline}</p>
                <p className="mt-3">
                  <span className="text-3xl font-extrabold tracking-tight text-stone-900 tabular-nums">{cedis(priceFor(p, cycle))}</span>
                  <span className="text-sm text-stone-500"> /{cycleLabel(cycle)}</span>
                </p>
                <p className="text-[11px] text-stone-400 h-4">
                  {cycle === 'yearly' && p.monthlyPrice > 0
                    ? `${cedis(Math.round(monthlyEquivalent(p, 'yearly')))}/month, billed yearly`
                    : ''}
                </p>
                <ul className="mt-4 flex flex-col gap-2 text-sm flex-1">
                  <li className="flex items-center gap-2 text-stone-700">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    {p.limits.staff === null ? 'Unlimited staff accounts' : `Up to ${p.limits.staff} staff accounts`}
                  </li>
                  <li className="flex items-center gap-2 text-stone-700">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" /> Everything in the core{' '}
                    {verticalMeta(appType).short.toLowerCase()} app
                  </li>
                  {moduleFeatures.map((f) => {
                    const on = p.features.includes(f.key)
                    return (
                      <li key={f.key} className={cn('flex items-center gap-2', on ? 'text-stone-700' : 'text-stone-400')}>
                        {on ? <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" /> : <Minus className="h-4 w-4 flex-shrink-0" />}
                        <span className={cn(!on && 'line-through decoration-stone-300')}>{f.label}</span>
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-5">
                  {current ? (
                    <Button variant="secondary" disabled className="w-full">
                      Current plan
                    </Button>
                  ) : requested ? (
                    <Button variant="secondary" disabled className="w-full">
                      Requested
                    </Button>
                  ) : (
                    <Button
                      variant={p.highlighted ? 'primary' : 'secondary'}
                      className="w-full"
                      onClick={() => setAsking(p)}
                      disabled={p.archived}
                    >
                      {sub ? `Switch to ${p.name}` : `Choose ${p.name}`}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Payments + how to pay */}
      <div className="grid gap-4 lg:grid-cols-3 mt-8">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="Payments" hint="Payments the Bytewave team has recorded for your business" />
          {payments.length === 0 ? (
            <div className="py-8 text-center">
              <Receipt className="h-6 w-6 text-stone-300 mx-auto" />
              <p className="text-sm text-stone-500 mt-2">No payments yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-stone-400 border-b border-stone-100">
                    <th className="py-2.5 pl-5 pr-4">Date</th>
                    <th className="py-2.5 pr-4">Amount</th>
                    <th className="py-2.5 pr-4">Method</th>
                    <th className="py-2.5 pr-5">Covers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 pl-5 pr-4 whitespace-nowrap text-stone-700">{shortDate(p.paidAt)}</td>
                      <td className="py-3 pr-4 font-semibold text-stone-900 tabular-nums">{cedis(p.amount)}</td>
                      <td className="py-3 pr-4 text-stone-600 whitespace-nowrap">
                        {METHOD_LABELS[p.method]}
                        {p.reference && <span className="block text-[11px] text-stone-400 font-mono">{p.reference}</span>}
                      </td>
                      <td className="py-3 pr-5 text-stone-500 whitespace-nowrap">
                        {shortDate(p.periodStart)} – {shortDate(p.periodEnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle title="Paying for your plan" />
          <HowToPay className="mt-0" />
          <p className="text-xs text-stone-500 mt-3">Once your payment is confirmed, it appears here and your plan renews automatically.</p>
        </Card>
      </div>

      <Drawer
        open={!!asking}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking ? `Switch to ${asking.name}` : ''}
        description="The Bytewave team confirms plan changes, usually within a day."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button onClick={sendRequest} loading={request.isPending}>
              Send request
            </Button>
          </>
        }
      >
        {asking && (
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-stone-200 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-stone-900">{asking.name}</p>
                <p className="text-xs text-stone-500">Billed {cycle}</p>
              </div>
              <p className="text-lg font-extrabold text-stone-900 tabular-nums">
                {cedis(priceFor(asking, cycle))}
                <span className="text-xs font-semibold text-stone-500"> /{cycleLabel(cycle)}</span>
              </p>
            </div>
            <Segmented
              ariaLabel="Billing cycle for the request"
              value={cycle}
              onChange={setCycle}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            />
            <Field label="Note (optional)" hint="Anything the team should know, e.g. when you’ll pay." htmlFor="plan-note">
              <Textarea id="plan-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>
          </div>
        )}
      </Drawer>
    </div>
  )
}
