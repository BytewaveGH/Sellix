'use client'

// App detail → Billing: one business's plan, payments and history.

import React, { useState } from 'react'
import { CalendarPlus, Check, CircleDashed, CreditCard, History, Inbox, Receipt, RotateCcw, Repeat, XCircle } from 'lucide-react'
import { Button, Card, ErrorNote, SectionTitle, Skeleton } from '@/components/kit/ui'
import { accessFor, cedis, cycleLabel, priceFor } from '@/lib/subscription/access'
import { BillingPill, METHOD_LABELS, PeriodBar, accessLine, shortDate } from '@/components/billing/bits'
import { useBillingActions, useCatalog, useSubscriptions } from '../_logics/billing'
import type { TenantRecord } from '../_logics/types'
import { BillingDrawers, type BillingDrawer } from './billing-forms'
import { timeAgo } from './bits'

export const SubscriptionPanel = ({ tenant }: { tenant: TenantRecord }) => {
  const catalog = useCatalog()
  const subs = useSubscriptions()
  const actions = useBillingActions()
  const [drawer, setDrawer] = useState<BillingDrawer>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (catalog.isLoading || subs.isLoading) return <Skeleton className="h-64" />
  const error = catalog.error ?? subs.error
  if (error || !catalog.data) return <ErrorNote message={`Billing unavailable: ${error?.message ?? 'no plan catalog'}`} />

  const sub = subs.data.find((s) => s.tenantId === tenant.id) ?? null
  const access = accessFor(sub, catalog.data.plans, catalog.data.settings, new Date())
  const requested = sub?.request ? catalog.data.plans.find((p) => p.id === sub.request!.planId) : null
  const payments = [...(sub?.payments ?? [])].sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt))
  const events = [...(sub?.events ?? [])].reverse()
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0)

  const quick = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
    } catch {
      // toast shown
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sub?.request && requested && (
        <Card className="p-4 border-sky-200 bg-sky-50/60 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
            <Inbox className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-stone-900">
              Asked for {requested.name} ({sub.request.cycle}) · {cedis(priceFor(requested, sub.request.cycle))}/
              {cycleLabel(sub.request.cycle)}
            </p>
            <p className="text-xs text-stone-500">
              {timeAgo(sub.request.requestedAt)}
              {sub.request.note && <> · “{sub.request.note}”</>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'decline'}
              onClick={() => quick('decline', () => actions.act(tenant.id, { type: 'clear-request' }, 'Request declined'))}
            >
              Decline
            </Button>
            <Button
              size="sm"
              icon={Check}
              loading={busy === 'approve'}
              onClick={() =>
                quick('approve', () => actions.act(tenant.id, { type: 'approve-request' }, `${tenant.name} moved to ${requested.name}`))
              }
            >
              Approve
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        {sub && access.plan ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-stone-500">Plan</p>
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
            <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-stone-100">
              <Button icon={CreditCard} onClick={() => setDrawer('payment')}>
                Record payment
              </Button>
              <Button variant="secondary" icon={Repeat} onClick={() => setDrawer('plan')}>
                {access.hasAccess ? 'Change plan' : 'Restart plan'}
              </Button>
              {access.hasAccess && (
                <Button variant="secondary" icon={CalendarPlus} onClick={() => setDrawer('extend')}>
                  Extend
                </Button>
              )}
              {sub.status === 'canceled' || sub.cancelAtPeriodEnd ? (
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  loading={busy === 'resume'}
                  onClick={() => quick('resume', () => actions.act(tenant.id, { type: 'resume' }, 'Cancellation undone'))}
                >
                  Undo cancel
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  icon={XCircle}
                  className="sm:ml-auto text-rose-600 hover:bg-rose-50"
                  onClick={() => setDrawer('cancel')}
                >
                  Cancel…
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="h-11 w-11 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center flex-shrink-0">
              <CircleDashed className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-base font-bold text-stone-900">Not on a plan</p>
              <p className="text-sm text-stone-500">
                Registered before billing, so it has full access for free. Assign a plan to start billing.
              </p>
            </div>
            <Button onClick={() => setDrawer('plan')}>Assign a plan</Button>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Payments" hint={payments.length ? `${cedis(paidTotal)} received in total` : undefined} />
          {payments.length === 0 ? (
            <div className="py-8 text-center">
              <Receipt className="h-6 w-6 text-stone-300 mx-auto" />
              <p className="text-sm text-stone-500 mt-2">No payments recorded.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-stone-400 border-b border-stone-100">
                    <th className="py-2.5 pl-5 pr-4">Paid</th>
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
          <SectionTitle title="History" />
          {events.length === 0 ? (
            <p className="text-sm text-stone-500 py-6 text-center">Nothing yet.</p>
          ) : (
            <ol className="relative flex flex-col gap-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-stone-200">
              {events.slice(0, 12).map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative pl-6">
                  <span className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-white bg-stone-300 ring-1 ring-stone-200" />
                  <p className="text-sm text-stone-800">{e.summary}</p>
                  <p className="text-[11px] text-stone-400">
                    {timeAgo(e.at)} · {e.actor === 'owner' ? 'by the owner' : 'by the platform'}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {events.length > 12 && (
            <p className="text-[11px] text-stone-400 mt-3 inline-flex items-center gap-1">
              <History className="h-3 w-3" /> Showing the latest 12 of {events.length}
            </p>
          )}
        </Card>
      </div>

      <BillingDrawers tenant={tenant} sub={sub} catalog={catalog.data} open={drawer} onOpenChange={setDrawer} />
    </div>
  )
}
