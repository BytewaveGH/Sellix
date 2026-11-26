'use client'

// One business's usage in the console (Apps → business → Usage): daily
// figures, who on the team uses it, its devices (desktop/offline), and which
// screens they use. Backend: BACKEND_REQUIREMENTS.md §15.

import React, { useMemo, useState } from 'react'
import { Activity, Clock, Info, Laptop, MonitorDown, Receipt, TrendingUp, Users, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BarChart, Card, EmptyState, ErrorNote, LoadingGrid, SectionTitle, StatCard } from '@/components/kit/ui'
import { Segmented } from '@/components/kit/form'
import { areaLabel, deviceStatus, engagement, fillDays, latestVersion, weekdayProfile, type DailyUsage } from '@/lib/platform/analytics'
import { useTenantActivity } from '../_logics/analytics'
import type { TenantRecord } from '../_logics/types'
import { fullDate, timeAgo } from './bits'
import { HealthPill, TrendChip, cedis, hours, percent } from './usage-bits'

const PERIODS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

type Metric = 'revenue' | 'sales' | 'signIns' | 'activeMinutes'
const METRICS: { value: Metric; label: string }[] = [
  { value: 'revenue', label: 'Sales ₵' },
  { value: 'sales', label: 'Transactions' },
  { value: 'signIns', label: 'Sign-ins' },
  { value: 'activeMinutes', label: 'Minutes used' },
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dayLabel = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  return days <= 7 ? WEEKDAYS[d.getUTCDay()] : `${d.getUTCDate()}`
}

// 90 days of bars is unreadable: weekly totals instead.
const bucket = (daily: DailyUsage[], metric: Metric, days: number) => {
  if (days <= 30)
    return daily.map((d) => ({
      key: d.date,
      label: dayLabel(d.date, days),
      detail: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      value: d[metric],
    }))
  const weeks: { key: string; label: string; detail: string; value: number }[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    const start = new Date(`${chunk[0].date}T12:00:00Z`)
    weeks.push({
      key: chunk[0].date,
      label: `${start.getUTCDate()}/${start.getUTCMonth() + 1}`,
      detail: `Week of ${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
      value: Math.round(chunk.reduce((n, d) => n + d[metric], 0) * 100) / 100,
    })
  }
  return weeks
}

export const TenantUsage = ({ tenant, lastActivityAt }: { tenant: TenantRecord; lastActivityAt?: string | null }) => {
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<Metric>('revenue')
  const q = useTenantActivity(tenant.id, days)
  const a = q.data

  const view = useMemo(() => {
    if (!a) return null
    const now = new Date()
    const daily = fillDays(a.daily, new Date(a.to), days)
    const latest = latestVersion(a.devices)
    return {
      e: engagement(a.summary, days, now, tenant.createdAt),
      daily,
      weekdays: weekdayProfile(daily),
      devices: a.devices.map((d) => ({ d, s: deviceStatus(d, now, latest) })),
      latest,
      areas: [...a.areas].sort((x, y) => y.activeMinutes - x.activeMinutes || y.views - x.views),
      staff: [...a.staff].sort((x, y) => y.activeMinutes - x.activeMinutes || y.sales - x.sales),
    }
  }, [a, days, tenant.createdAt])

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <p className="text-[15px] font-bold text-stone-900">Usage</p>
        {view && <HealthPill health={view.e.health} score={view.e.score} />}
      </div>
      <div className="w-[260px]">
        <Segmented ariaLabel="Usage period" value={days} onChange={setDays} options={PERIODS} />
      </div>
    </div>
  )

  if (q.isLoading)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <LoadingGrid />
      </div>
    )
  if (q.error)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorNote message={q.error.message} />
      </div>
    )
  if (!a || !view)
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState
          icon={Info}
          title="Usage isn’t counted yet"
          description={`The server doesn’t send this business’s activity yet (backend §15). Last activity: ${lastActivityAt ? timeAgo(lastActivityAt) : 'not reported'}.`}
        />
      </div>
    )

  const s = a.summary
  const maxArea = Math.max(1, ...view.areas.map((x) => x.activeMinutes || x.views))
  const maxWeekday = Math.max(1, ...view.weekdays.map((w) => w.average))
  const records = Object.entries(a.records ?? {})

  return (
    <div className="flex flex-col gap-4">
      {header}
      {view.e.reasons.length > 0 && <p className="-mt-2 text-xs text-stone-500">{view.e.reasons.join(' · ')}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Sales · ${days} days`}
          value={cedis(s.revenue)}
          icon={TrendingUp}
          tone="green"
          hint={<TrendChip current={s.revenue} previous={s.previous.revenue} />}
        />
        <StatCard
          label="Transactions"
          value={s.sales.toLocaleString()}
          icon={Receipt}
          tone="amber"
          hint={`${s.sales && s.activeDays ? Math.round(s.sales / s.activeDays) : 0} a day when open · ${s.sales ? percent(s.offlineSales / s.sales) : '0%'} offline`}
        />
        <StatCard
          label="Active days"
          value={`${s.activeDays} / ${days}`}
          icon={Activity}
          hint={`${hours(s.activeMinutes)} of use · ${s.signIns} sign-ins`}
        />
        <StatCard
          label="Team using it"
          value={`${s.activeStaff} / ${s.staffCount}`}
          icon={Users}
          tone="stone"
          hint={s.lastActivityAt ? `Last activity ${timeAgo(s.lastActivityAt)}` : 'No activity yet'}
        />
      </div>

      <Card className="p-5">
        <SectionTitle
          title={days > 30 ? 'Week by week' : 'Day by day'}
          action={
            <div className="w-[360px] max-w-full">
              <Segmented ariaLabel="Chart" value={metric} onChange={setMetric} options={METRICS} />
            </div>
          }
        />
        <BarChart
          data={bucket(view.daily, metric, days)}
          format={metric === 'revenue' ? cedis : metric === 'activeMinutes' ? (n) => hours(n) : (n) => n.toLocaleString()}
          ariaLabel={`${METRICS.find((m) => m.value === metric)!.label} over ${days} days`}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2 overflow-hidden">
          <SectionTitle title="Team" hint="Who signs in and sells" />
          {view.staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">No staff activity in this period.</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    <th className="py-2 pl-5 pr-4">Name</th>
                    <th className="py-2 pr-4 text-right">Sales</th>
                    <th className="py-2 pr-4 text-right">₵</th>
                    <th className="py-2 pr-4 text-right">Use</th>
                    <th className="py-2 pr-5">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {view.staff.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pl-5 pr-4">
                        <span className="block font-semibold text-stone-900">{p.name}</span>
                        <span className="block text-[11px] text-stone-400 capitalize">{p.role}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{p.sales.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{cedis(p.revenue)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{hours(p.activeMinutes)}</td>
                      <td className="py-2.5 pr-5 text-xs text-stone-500 whitespace-nowrap">
                        {p.lastSeenAt ? timeAgo(p.lastSeenAt) : 'Not in this period'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Busiest days" hint="Average transactions per weekday" />
          <ul className="flex flex-col gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
              const w = view.weekdays[wd]
              return (
                <li key={wd} className="flex items-center gap-2 text-xs">
                  <span className="w-8 font-semibold text-stone-600">{WEEKDAYS[wd]}</span>
                  <span className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                    <span className="block h-full rounded-full bg-endeavour" style={{ width: `${(w.average / maxWeekday) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right tabular-nums text-stone-700">{w.average}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5 overflow-hidden">
          <SectionTitle
            title="Devices"
            hint={view.latest ? `Newest desktop version seen: ${view.latest}` : 'Tills and browsers that used the app'}
          />
          {view.devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">No devices in this period.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {view.devices.map(({ d, s: st }) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
                      d.kind === 'desktop' ? 'bg-endeavour/10 text-endeavour' : 'bg-stone-100 text-stone-500'
                    )}
                  >
                    {d.kind === 'desktop' ? <MonitorDown className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-stone-900">
                      {d.kind === 'desktop' ? 'Desktop app' : 'Web browser'}
                      {d.appVersion && <span className="ml-1 text-xs font-normal text-stone-400">v{d.appVersion}</span>}
                      <span className="ml-1 font-mono text-[11px] font-normal text-stone-400">{d.id}</span>
                    </span>
                    <span className="block text-xs text-stone-500">
                      Seen {d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'never'}
                      {d.lastSyncAt ? ` · synced ${timeAgo(d.lastSyncAt)}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {st.unsynced && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        <WifiOff className="h-3 w-3" /> {d.pending} unsent
                      </span>
                    )}
                    {!st.unsynced && d.pending > 0 && <span className="text-[11px] text-stone-500">{d.pending} waiting</span>}
                    {st.outdated && <span className="text-[11px] font-semibold text-amber-700">Update available</span>}
                    {st.idle && <span className="text-[11px] text-stone-400">Quiet 7+ days</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Screens used" hint="Where the time goes" />
          {view.areas.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">Shown once the app has reported screen use.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {view.areas.slice(0, 10).map((x) => (
                <li key={x.area} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-700">{areaLabel(x.area)}</span>
                    <span className="text-stone-500 tabular-nums">
                      {hours(x.activeMinutes)} · {x.views.toLocaleString()} opens
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-endeavour"
                      style={{ width: `${((x.activeMinutes || x.views) / maxArea) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {records.length > 0 && (
        <Card className="p-5">
          <SectionTitle title="Set up so far" hint="What this business has added" />
          <dl className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
            {records.map(([label, n]) => (
              <div key={label} className="rounded-xl bg-stone-50 p-3">
                <dt className="text-[11px] font-semibold text-stone-500">{label}</dt>
                <dd className="text-lg font-extrabold text-stone-900 tabular-nums">{n.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <p className="text-[11px] text-stone-400 inline-flex items-center gap-1">
        <Clock className="h-3 w-3" /> Counted {timeAgo(a.updatedAt)} · {fullDate(a.from)} – {fullDate(a.to)}
      </p>
    </div>
  )
}
