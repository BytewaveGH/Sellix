'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { addMonths, startOfMonth } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  Clock,
  CreditCard,
  Inbox,
  Layers,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BarChart, Button, Card, EmptyState, ErrorNote, LoadingGrid, PageHeader, SectionTitle, StatCard } from '@/components/kit/ui'
import { Segmented } from '@/components/kit/form'
import { cedis, cycleLabel, monthlyEquivalent, priceFor } from '@/lib/subscription/access'
import { collectedBetween, collectedByMonth, countByState, mrr, planDistribution, type BillingRow } from '@/lib/subscription/insights'
import type { BillingState } from '@/lib/subscription/types'
import { BillingPill, accessLine } from '@/components/billing/bits'
import { useBillingActions, useBillingBook } from '../_logics/billing'
import type { TenantRecord } from '../_logics/types'
import { AppAvatar, timeAgo } from '../_components/bits'
import { BillingDrawers, type BillingDrawer } from '../_components/billing-forms'

type Row = BillingRow<TenantRecord>
type Filter = 'all' | 'trialing' | 'active' | 'due' | 'none'

const PLAN_TINTS = ['#0865AC', '#0D9488', '#7C3AED', '#D97706', '#DB2777', '#4B5563']

const matches = (r: Row, f: Filter) =>
  f === 'all' ||
  (f === 'due'
    ? r.access.state === 'past_due' || r.access.state === 'expired'
    : f === 'active'
      ? r.access.state === 'active'
      : r.access.state === f)

export default function BillingDashboard() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const base = `/${locale}/super-admin`
  const { view, subs, isLoading, error } = useBillingBook()
  const actions = useBillingActions()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<{ row: Row; drawer: BillingDrawer } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const stats = useMemo(() => {
    if (!view) return null
    const now = new Date()
    const month = startOfMonth(now)
    const counts = countByState(view.rows)
    return {
      mrr: mrr(view.rows),
      counts,
      thisMonth: collectedBetween(subs, month, addMonths(month, 1)),
      lastMonth: collectedBetween(subs, addMonths(month, -1), month),
      byMonth: collectedByMonth(subs, now, 12),
      mix: planDistribution(view.rows, view.catalog),
    }
  }, [view, subs])

  const list = useMemo(() => {
    if (!view) return []
    const q = query.trim().toLowerCase()
    const rank: Record<BillingState, number> = { past_due: 0, expired: 1, trialing: 2, active: 3, canceled: 4, none: 5 }
    return view.rows
      .filter(
        (r) => matches(r, filter) && (!q || `${r.tenant.name} ${r.tenant.slug} ${r.access.plan?.name ?? ''}`.toLowerCase().includes(q))
      )
      .sort(
        (a, b) =>
          rank[a.access.state] - rank[b.access.state] || (a.access.endsAt?.getTime() ?? Infinity) - (b.access.endsAt?.getTime() ?? Infinity)
      )
  }, [view, filter, query])

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

  const header = (
    <PageHeader
      eyebrow="Platform"
      title="Billing"
      description="What businesses pay, what they’re on, and who needs a nudge."
      actions={
        <Link href={`${base}/plans`}>
          <Button variant="secondary" icon={Layers}>
            Plans
          </Button>
        </Link>
      }
    />
  )

  if (isLoading) {
    return (
      <>
        {header}
        <LoadingGrid />
        <LoadingGrid count={2} className="mt-4 xl:grid-cols-2" />
      </>
    )
  }
  if (!view || !stats) {
    return (
      <>
        {header}
        <ErrorNote message={error?.message ?? 'Billing is unavailable right now.'} />
      </>
    )
  }

  const { attention } = view
  const change = stats.lastMonth > 0 ? (stats.thisMonth - stats.lastMonth) / stats.lastMonth : null
  const paying = stats.counts.active + stats.counts.past_due
  const overdue = stats.counts.past_due + stats.counts.expired
  const mixTotal = stats.mix.reduce((s, m) => s + m.count, 0)
  const open = (row: Row, drawer: BillingDrawer) => setTarget({ row, drawer })
  const attentionRows = [
    ...attention.requests.map((r) => ({ r, kind: 'request' as const })),
    ...attention.pastDue.map((r) => ({ r, kind: 'due' as const })),
    ...attention.trialsEnding.map((r) => ({ r, kind: 'trial' as const })),
    ...attention.expired.map((r) => ({ r, kind: 'expired' as const })),
  ]

  return (
    <>
      {header}
      {error && <ErrorNote message={error.message} />}

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          value={cedis(Math.round(stats.mrr), { compact: true })}
          icon={TrendingUp}
          tone="green"
          hint={`${cedis(Math.round(stats.mrr * 12), { compact: true })} a year at this rate`}
        />
        <StatCard
          label="Collected this month"
          value={cedis(stats.thisMonth, { compact: true })}
          icon={Banknote}
          hint={
            change === null
              ? `${cedis(stats.lastMonth)} last month`
              : `${change >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(change) * 100)}% vs last month`
          }
        />
        <StatCard
          label="Paying businesses"
          value={paying}
          icon={Wallet}
          tone="amber"
          hint={`${stats.counts.trialing} on trial · ${stats.counts.none} not on a plan`}
        />
        <button
          type="button"
          onClick={() => setFilter('due')}
          className="block text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-endeavour/40"
        >
          <StatCard
            label="Overdue"
            value={overdue}
            icon={AlertTriangle}
            tone={overdue > 0 ? 'rose' : 'stone'}
            hint={overdue > 0 ? `${stats.counts.expired} locked out · ${stats.counts.past_due} in grace` : 'Everyone is paid up'}
          />
        </button>
      </div>

      {/* Revenue + plan mix */}
      <div className="grid gap-4 xl:grid-cols-3 mt-4">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Collected" hint="Payments recorded per month, last 12 months" />
          <BarChart ariaLabel="Payments collected per month" data={stats.byMonth} format={(n, o) => cedis(n, o)} />
        </Card>
        <Card className="p-5">
          <SectionTitle title="Plan mix" hint={`${mixTotal} business${mixTotal === 1 ? '' : 'es'} with access on a plan`} />
          <div
            className="flex h-3 w-full gap-[2px] rounded-full overflow-hidden bg-stone-100"
            role="img"
            aria-label={stats.mix.map((m) => `${m.plan.name}: ${m.count}`).join(', ')}
          >
            {stats.mix
              .filter((m) => m.count > 0)
              .map((m) => (
                <div
                  key={m.plan.id}
                  style={{
                    width: `${(m.count / Math.max(1, mixTotal)) * 100}%`,
                    background: PLAN_TINTS[stats.mix.indexOf(m) % PLAN_TINTS.length],
                  }}
                />
              ))}
          </div>
          <ul className="mt-5 flex flex-col gap-3">
            {stats.mix.map((m, i) => (
              <li key={m.plan.id} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: PLAN_TINTS[i % PLAN_TINTS.length] }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-stone-900">
                    {m.plan.name}
                    {m.plan.archived && <span className="ml-1.5 text-[10px] font-semibold uppercase text-stone-400">Archived</span>}
                  </span>
                  <span className="block text-[11px] text-stone-500">
                    {cedis(m.plan.monthlyPrice)}/mo · {cedis(m.plan.yearlyPrice)}/yr
                  </span>
                </span>
                <span className="text-sm font-extrabold text-stone-900 tabular-nums">{m.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Attention */}
      <Card className="p-5 mt-4">
        <SectionTitle
          title="Needs attention"
          hint={attentionRows.length ? 'Plan requests, overdue payments and trials ending this week' : undefined}
        />
        {attentionRows.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-stone-900">All clear</p>
            <p className="text-xs text-stone-500 mt-1">No requests, overdue payments or trials ending this week.</p>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {attentionRows.map(({ r, kind }) => {
              const t = r.tenant
              const req = kind === 'request' ? view.catalog.plans.find((p) => p.id === r.sub!.request!.planId) : null
              return (
                <div
                  key={`${kind}-${t.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-2.5',
                    kind === 'request' && 'border-sky-100 bg-sky-50/50',
                    kind === 'due' && 'border-amber-100 bg-amber-50/50',
                    kind === 'expired' && 'border-rose-100 bg-rose-50/50',
                    kind === 'trial' && 'border-stone-200'
                  )}
                >
                  <AppAvatar name={t.name} appType={t.appType} status={t.status} size="sm" />
                  <Link href={`${base}/apps/${t.id}?tab=billing`} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-stone-900 truncate">{t.name}</span>
                    <span className="block text-[11px] text-stone-500 truncate">
                      {kind === 'request' && req ? (
                        <>
                          <Inbox className="inline h-3 w-3 -mt-0.5" /> Wants {req.name} ({r.sub!.request!.cycle}) ·{' '}
                          {timeAgo(r.sub!.request!.requestedAt)}
                        </>
                      ) : kind === 'trial' ? (
                        <>
                          <Sparkles className="inline h-3 w-3 -mt-0.5" /> {accessLine(r.access, r.sub)}
                        </>
                      ) : (
                        <>
                          <Clock className="inline h-3 w-3 -mt-0.5" /> {accessLine(r.access, r.sub)}
                        </>
                      )}
                    </span>
                  </Link>
                  {kind === 'request' ? (
                    <Button
                      size="sm"
                      icon={Check}
                      loading={busy === `approve-${t.id}`}
                      onClick={() =>
                        quick(`approve-${t.id}`, () =>
                          actions.act(t.id, { type: 'approve-request' }, `${t.name} moved to ${req?.name ?? 'the new plan'}`)
                        )
                      }
                    >
                      Approve
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" icon={CreditCard} onClick={() => open(r, 'payment')}>
                      Record payment
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Every business */}
      <div className="mt-8">
        <SectionTitle title="Subscriptions" />
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business or plan"
              aria-label="Search subscriptions"
              className="w-full h-10 rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base sm:text-sm focus:outline-none focus:border-endeavour focus:ring-2 focus:ring-endeavour/15"
            />
          </div>
          <div className="md:w-[30rem] overflow-x-auto">
            <Segmented
              ariaLabel="Billing status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${view.rows.length}` },
                { value: 'trialing', label: `Trial ${stats.counts.trialing}` },
                { value: 'active', label: `Paid ${stats.counts.active}` },
                { value: 'due', label: `Overdue ${overdue}` },
                { value: 'none', label: `No plan ${stats.counts.none}` },
              ]}
            />
          </div>
        </div>
        {view.rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No businesses yet" description="Register an app and assign it a plan to start billing." />
        ) : list.length === 0 ? (
          <Card className="py-10 text-center text-sm text-stone-500">No subscriptions match.</Card>
        ) : (
          <Card className="divide-y divide-stone-100 overflow-hidden">
            {list.map((r) => {
              const t = r.tenant
              return (
                <div key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-stone-50/70">
                  <Link href={`${base}/apps/${t.id}?tab=billing`} className="flex items-center gap-3 min-w-0 flex-1">
                    <AppAvatar name={t.name} appType={t.appType} status={t.status} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-stone-900 truncate">{t.name}</span>
                      <span className="block text-xs text-stone-500 truncate">{accessLine(r.access, r.sub)}</span>
                    </span>
                  </Link>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-xs font-semibold text-stone-700 w-24 sm:text-right">
                      {r.access.plan ? r.access.plan.name : '—'}
                      {r.sub && r.access.plan && (
                        <span className="block text-[11px] font-normal text-stone-400 tabular-nums">
                          {cedis(priceFor(r.access.plan, r.sub.cycle))}/{cycleLabel(r.sub.cycle) === 'year' ? 'yr' : 'mo'}
                        </span>
                      )}
                    </span>
                    <span className="w-28 flex sm:justify-end">
                      <BillingPill state={r.access.state} />
                    </span>
                    <span className="hidden md:block w-24 text-right text-xs font-semibold text-stone-900 tabular-nums">
                      {r.sub && r.access.plan && (r.access.state === 'active' || r.access.state === 'past_due')
                        ? `${cedis(Math.round(monthlyEquivalent(r.access.plan, r.sub.cycle)))}/mo`
                        : '—'}
                    </span>
                    <Link
                      href={`${base}/apps/${t.id}?tab=billing`}
                      aria-label={`Billing for ${t.name}`}
                      className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </div>

      <BillingDrawers
        tenant={target?.row.tenant ?? null}
        sub={target ? (view.rows.find((r) => r.tenant.id === target.row.tenant.id)?.sub ?? null) : null}
        catalog={view.catalog}
        open={target?.drawer ?? null}
        onOpenChange={(d) => setTarget((cur) => (cur && d ? { ...cur, drawer: d } : null))}
      />
    </>
  )
}
