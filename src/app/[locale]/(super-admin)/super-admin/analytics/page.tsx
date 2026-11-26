'use client'

// Usage & engagement across every business: who uses the app, how much, on
// which devices, and who needs a call (BACKEND_REQUIREMENTS.md §15).

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Activity, AlertTriangle, Download, Info, MonitorDown, Receipt, Search, TrendingUp, Users, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Card, EmptyState, ErrorNote, LoadingGrid, PageHeader, SectionTitle, StatCard } from '@/components/kit/ui'
import { Input, Segmented, Select } from '@/components/kit/form'
import {
  HEALTH,
  healthCounts,
  platformTotals,
  sortUsage,
  usageAlerts,
  usageToCsv,
  type Health,
  type UsageSort,
} from '@/lib/platform/analytics'
import { downloadCsv } from '@/lib/eatery/sales'
import { useUsageBook } from '../_logics/analytics'
import { VERTICALS, verticalMeta } from '../_logics/verticals'
import { AppAvatar, VerticalBadge, timeAgo } from '../_components/bits'
import { HealthPill, TrendChip, cedis, hours, percent } from '../_components/usage-bits'

const PERIODS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

const SORTS: { value: UsageSort; label: string }[] = [
  { value: 'score', label: 'Most engaged' },
  { value: 'revenue', label: 'Highest sales (₵)' },
  { value: 'sales', label: 'Most transactions' },
  { value: 'trend', label: 'Fastest growing' },
  { value: 'recent', label: 'Recently active' },
  { value: 'name', label: 'Name' },
]

export default function AnalyticsPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const base = `/${locale}/super-admin`
  const [days, setDays] = useState(30)
  const [query, setQuery] = useState('')
  const [vertical, setVertical] = useState('all')
  const [health, setHealth] = useState<Health | 'all'>('all')
  const [sort, setSort] = useState<UsageSort>('score')
  const { rows, usage, waiting, isLoading, error } = useUsageBook(days)

  const totals = useMemo(() => (usage ? platformTotals(usage.tenants, usage.days) : null), [usage])
  const counts = useMemo(() => healthCounts(rows), [rows])
  const alerts = useMemo(() => usageAlerts(rows).slice(0, 8), [rows])
  const byVertical = useMemo(
    () =>
      VERTICALS.map((v) => {
        const list = rows.filter((r) => r.tenant.appType === v.value)
        return {
          v,
          businesses: list.length,
          active: list.filter((r) => (r.usage?.activeDays ?? 0) > 0).length,
          revenue: list.reduce((n, r) => n + (r.usage?.revenue ?? 0), 0),
          sales: list.reduce((n, r) => n + (r.usage?.sales ?? 0), 0),
        }
      }).filter((x) => x.businesses > 0),
    [rows]
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortUsage(
      rows.filter(
        (r) =>
          (vertical === 'all' || r.tenant.appType === vertical) &&
          (health === 'all' || r.engagement.health === health) &&
          (!q || `${r.tenant.name} ${r.tenant.slug} ${r.tenant.ownerName}`.toLowerCase().includes(q))
      ),
      sort
    )
  }, [rows, query, vertical, health, sort])

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Usage & engagement" />
        <LoadingGrid />
        <LoadingGrid count={2} className="mt-4 xl:grid-cols-2" />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Usage & engagement"
        description="How each business uses the app: sales, active days, staff, devices and who needs a follow-up."
        actions={
          <>
            <div className="w-[260px]">
              <Segmented ariaLabel="Period" value={days} onChange={setDays} options={PERIODS} />
            </div>
            <Button
              variant="secondary"
              icon={Download}
              disabled={!rows.length}
              onClick={() => downloadCsv(`business-usage-${days}d.csv`, usageToCsv(shown, days))}
            >
              Export
            </Button>
          </>
        }
      />
      {error && <ErrorNote message={error.message} />}
      {waiting && (
        <div role="note" className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            The server doesn’t send usage figures yet (backend §15). Until it does, health below comes from each business’s last activity
            only, and sales, staff and device columns stay empty.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="No businesses yet" description="Usage appears here once businesses are registered." />
      ) : (
        <>
          {totals && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Active businesses"
                value={`${totals.active} / ${totals.businesses}`}
                icon={Activity}
                hint={`${totals.regular} used on half the days or more`}
              />
              <StatCard
                label={`Sales processed · ${days} days`}
                value={cedis(totals.revenue, { compact: true })}
                icon={TrendingUp}
                tone="green"
                hint={<TrendChip current={totals.revenue} previous={totals.previousRevenue} />}
              />
              <StatCard
                label="Transactions"
                value={totals.sales.toLocaleString()}
                icon={Receipt}
                tone="amber"
                hint={
                  <>
                    <TrendChip current={totals.sales} previous={totals.previousSales} /> · {percent(totals.offlineShare)} rung up offline
                  </>
                }
              />
              <StatCard
                label="Desktop app"
                value={percent(totals.desktopShare)}
                icon={MonitorDown}
                tone="stone"
                hint={`of businesses use it · ${hours(totals.activeMinutes)} of use by ${totals.activeStaff} staff`}
              />
            </div>
          )}

          <div className="grid gap-4 mt-4 xl:grid-cols-3">
            {/* Health */}
            <Card className="p-5">
              <SectionTitle title="Health" hint={`From active days, staff, recency and sales trend over ${days} days`} />
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-100" aria-hidden>
                {counts.map((c) =>
                  c.count ? (
                    <span key={c.health} className={HEALTH[c.health].dot} style={{ width: `${(c.count / rows.length) * 100}%` }} />
                  ) : null
                )}
              </div>
              <ul className="mt-3 flex flex-col gap-1">
                {counts.map((c) => (
                  <li key={c.health}>
                    <button
                      type="button"
                      onClick={() => setHealth(health === c.health ? 'all' : c.health)}
                      aria-pressed={health === c.health}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50',
                        health === c.health && 'bg-stone-100'
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', HEALTH[c.health].dot)} aria-hidden />
                      <span className="flex-1 text-left font-semibold text-stone-700">{HEALTH[c.health].label}</span>
                      <span className="text-xs text-stone-400">{HEALTH[c.health].hint}</span>
                      <span className="w-8 text-right font-bold tabular-nums text-stone-900">{c.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Follow up */}
            <Card className="p-5 xl:col-span-2">
              <SectionTitle title="Follow up" hint="Businesses worth a call this week" />
              {alerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  {waiting ? 'Shown once the server sends usage figures.' : 'Nothing needs attention.'}
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {alerts.map((a) => (
                    <li key={`${a.kind}-${a.row.tenant.id}`}>
                      <Link
                        href={`${base}/apps/${a.row.tenant.id}?tab=usage`}
                        className="flex items-center gap-3 py-2.5 hover:bg-stone-50 rounded-lg px-1"
                      >
                        <AppAvatar name={a.row.tenant.name} appType={a.row.tenant.appType} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-stone-900">{a.row.tenant.name}</span>
                          <span className="block truncate text-xs text-stone-500">{a.message}</span>
                        </span>
                        {a.kind === 'unsent' ? (
                          <WifiOff className="h-4 w-4 text-rose-500" aria-label="Unsent sales" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {usage && byVertical.length > 1 && (
            <Card className="p-5 mt-4">
              <SectionTitle title="By business type" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {byVertical.map((x) => (
                  <div key={x.v.value} className="rounded-xl border border-stone-200 p-3">
                    <VerticalBadge appType={x.v.value} />
                    <p className="mt-2 text-lg font-extrabold text-stone-900 tabular-nums">{cedis(x.revenue, { compact: true })}</p>
                    <p className="text-xs text-stone-500">
                      {x.sales.toLocaleString()} transactions · {x.active} of {x.businesses} active
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Every business */}
          <Card className="mt-4 overflow-hidden">
            <div className="p-5 pb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <SectionTitle title="Every business" hint={`${shown.length} of ${rows.length}`} />
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input
                    aria-label="Search businesses"
                    placeholder="Search…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9 w-[200px]"
                  />
                </div>
                <Select
                  aria-label="Business type"
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  options={[{ value: 'all', label: 'All types' }, ...VERTICALS.map((v) => ({ value: v.value, label: v.short }))]}
                  className="w-[150px]"
                />
                <Select
                  aria-label="Health"
                  value={health}
                  onChange={(e) => setHealth(e.target.value as Health | 'all')}
                  options={[
                    { value: 'all', label: 'Any health' },
                    ...counts.map((c) => ({ value: c.health, label: HEALTH[c.health].label })),
                  ]}
                  className="w-[150px]"
                />
                <Select
                  aria-label="Sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as UsageSort)}
                  options={SORTS}
                  className="w-[180px]"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-stone-100 bg-stone-50/60 text-left text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    <th className="py-2.5 pl-5 pr-4">Business</th>
                    <th className="py-2.5 pr-4">Health</th>
                    <th className="py-2.5 pr-4 text-right">Sales (₵)</th>
                    <th className="py-2.5 pr-4 text-right">Transactions</th>
                    <th className="py-2.5 pr-4 text-right">Active days</th>
                    <th className="py-2.5 pr-4 text-right">Staff</th>
                    <th className="py-2.5 pr-4">Devices</th>
                    <th className="py-2.5 pr-4">Last activity</th>
                    <th className="py-2.5 pr-5">Plan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {shown.map((r) => {
                    const u = r.usage
                    return (
                      <tr key={r.tenant.id} className="hover:bg-stone-50/60">
                        <td className="py-3 pl-5 pr-4">
                          <Link href={`${base}/apps/${r.tenant.id}?tab=usage`} className="flex items-center gap-3 min-w-[180px]">
                            <AppAvatar name={r.tenant.name} appType={r.tenant.appType} status={r.tenant.status} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-stone-900">{r.tenant.name}</span>
                              <span className="block truncate text-[11px] text-stone-400">{verticalMeta(r.tenant.appType).short}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <HealthPill health={r.engagement.health} score={u ? r.engagement.score : undefined} />
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums whitespace-nowrap">
                          {u ? (
                            <>
                              <span className="font-semibold text-stone-900">{cedis(u.revenue)}</span>{' '}
                              <TrendChip current={u.revenue} previous={u.previous.revenue} />
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">{u ? u.sales.toLocaleString() : '—'}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{u ? `${u.activeDays}/${usage?.days ?? days}` : '—'}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{u ? `${u.activeStaff}/${u.staffCount}` : '—'}</td>
                        <td className="py-3 pr-4 whitespace-nowrap text-xs text-stone-600">
                          {u ? (
                            <span className="inline-flex items-center gap-1">
                              {u.devices}
                              {u.desktopDevices > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-endeavour/10 px-1 text-[10px] font-bold text-endeavour">
                                  <MonitorDown className="h-3 w-3" /> {u.desktopDevices}
                                </span>
                              )}
                              {u.stuckDevices > 0 && <WifiOff className="h-3.5 w-3.5 text-rose-500" aria-label="Unsent sales" />}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap text-xs text-stone-500">
                          {u?.lastActivityAt ? timeAgo(u.lastActivityAt) : u ? 'Never' : '—'}
                        </td>
                        <td className="py-3 pr-5 whitespace-nowrap text-xs text-stone-600">
                          {r.billing?.planName ?? '—'}
                          {r.billing?.state === 'trialing' && <span className="ml-1 text-violet-600">trial</span>}
                          {r.billing?.state === 'past_due' && <span className="ml-1 text-amber-700">due</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {shown.length === 0 && <p className="py-10 text-center text-sm text-stone-400">No businesses match.</p>}
            </div>
          </Card>
          <p className="mt-3 text-[11px] text-stone-400 inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> Usage counts sales, sign-ins and minutes of real use (a tap or key press in that minute). No
            customer details are collected.
          </p>
        </>
      )}
    </>
  )
}
