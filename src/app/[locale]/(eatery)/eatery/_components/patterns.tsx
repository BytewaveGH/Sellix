'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Clock, Flame, Lightbulb, Moon, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BarChart, Card, SectionTitle } from '@/components/kit/ui'
import { Segmented } from '@/components/kit/form'
import { formatMoney } from '@/lib/eatery/menu'
import {
  HEAT_RAMP,
  WEEK_ORDER,
  WEEKDAYS,
  WEEKDAY_NAMES,
  heatColor,
  hourLabel,
  hourRange,
  salesPatterns,
  type DayPoint,
  type Metric,
  type Patterns,
} from '@/lib/eatery/patterns'
import type { OwnerData } from '@/lib/eatery/hooks'
import type { Restaurant } from '@/lib/eatery/types'

// Sequential blue (one hue): daily values as quiet context, the 7-day average as the read.
const DAILY = '#6da7ec'
// Validated pair (dataviz validator: lightness, chroma, CVD ΔE 23.9); the daily line's
// low contrast is relieved by the table view.
const AVERAGE = '#1c5cab'

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth || 640)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 640))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

const dayName = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

// Daily line + 7-day average, best and slowest days marked, crosshair tooltip.
const TrendChart = ({ p, fmt }: { p: Patterns; fmt: (n: number) => string }) => {
  const { ref, w } = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const H = 200
  const pad = { l: 52, r: 12, t: 16, b: 26 }
  const n = p.days.length
  const max = Math.max(1, ...p.days.map((d) => Math.max(d.value, d.avg7)))
  const nice = (() => {
    const pow = 10 ** Math.floor(Math.log10(max))
    return Math.ceil(max / pow) * pow
  })()
  const x = (i: number) => pad.l + (n <= 1 ? (w - pad.l - pad.r) / 2 : (i / (n - 1)) * (w - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b)
  const path = (key: 'value' | 'avg7') => p.days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('')
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - pad.l) / 64))))
  const marks = [p.best && { d: p.best, label: 'Best' }, p.worst && { d: p.worst, label: 'Slowest' }].filter(Boolean) as {
    d: DayPoint
    label: string
  }[]
  const h = hover !== null ? p.days[hover] : null

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={H} role="img" aria-label={`Daily ${p.metric} with 7-day average`} className="block">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(nice * t)} y2={y(nice * t)} className="stroke-stone-200" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(nice * t) + 4} textAnchor="end" className="fill-stone-400 text-[10px] tabular-nums">
              {fmt(nice * t)}
            </text>
          </g>
        ))}
        {p.days.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.key} x={x(i)} y={H - 8} textAnchor="middle" className="fill-stone-400 text-[10px]">
              {d.date.toLocaleDateString(undefined, n > 14 ? { day: 'numeric', month: 'short' } : { weekday: 'short' })}
            </text>
          ) : null
        )}
        <path d={path('value')} fill="none" stroke={DAILY} strokeWidth={1.5} strokeLinejoin="round" />
        <path d={path('avg7')} fill="none" stroke={AVERAGE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {marks.map((m) => {
          const i = p.days.indexOf(m.d)
          const above = m.label === 'Best'
          return (
            <g key={m.label}>
              <circle cx={x(i)} cy={y(m.d.value)} r={5} fill="#fff" stroke={AVERAGE} strokeWidth={2} />
              <text
                x={Math.min(w - pad.r - 2, Math.max(pad.l + 2, x(i)))}
                y={y(m.d.value) + (above ? -10 : 18)}
                textAnchor="middle"
                className="fill-stone-700 text-[10px] font-bold"
              >
                {m.label} {fmt(m.d.value)}
              </text>
            </g>
          )
        })}
        {h && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={H - pad.b} className="stroke-stone-400" strokeDasharray="2 3" />
            <circle cx={x(hover!)} cy={y(h.value)} r={4} fill={DAILY} style={{ stroke: 'rgb(var(--bc-white))' }} strokeWidth={2} />
            <circle cx={x(hover!)} cy={y(h.avg7)} r={4} fill={AVERAGE} style={{ stroke: 'rgb(var(--bc-white))' }} strokeWidth={2} />
          </g>
        )}
        {/* Hit areas wider than the marks */}
        {p.days.map((d, i) => (
          <rect
            key={d.key}
            x={x(i) - (w - pad.l - pad.r) / Math.max(1, n - 1) / 2}
            y={pad.t}
            width={Math.max(8, (w - pad.l - pad.r) / Math.max(1, n - 1))}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(0, x(hover!) - 80), w - 170) }}
          role="status"
        >
          <p className="font-bold text-stone-900">{dayName(h.date)}</p>
          <p className="mt-1 flex items-center gap-2 text-stone-600">
            <span className="h-0.5 w-3" style={{ background: DAILY }} /> That day{' '}
            <strong className="ml-auto tabular-nums text-stone-900">{fmt(h.value)}</strong>
          </p>
          <p className="flex items-center gap-2 text-stone-600">
            <span className="h-[3px] w-3" style={{ background: AVERAGE }} /> 7-day average{' '}
            <strong className="ml-auto tabular-nums text-stone-900">{fmt(h.avg7)}</strong>
          </p>
          <p className="text-stone-400">{h.orders} orders</p>
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-stone-600" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: DAILY }} /> Each day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded" style={{ background: AVERAGE }} /> 7-day average
        </span>
      </div>
    </div>
  )
}

// Weekday × hour: when the money comes in. One hue, darker = more.
const Heatmap = ({ p, fmt, hoursShown }: { p: Patterns; fmt: (n: number) => string; hoursShown: number[] }) => {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  const cell = hover ? p.heat[hover.d][hover.h] : 0
  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="inline-grid min-w-full gap-[2px]"
          style={{ gridTemplateColumns: `40px repeat(${hoursShown.length}, minmax(22px, 1fr))` }}
          role="grid"
          aria-label={`Average ${p.metric} by weekday and hour`}
        >
          <span />
          {hoursShown.map((h, i) => (
            <span key={h} className="pb-1 text-center text-[10px] text-stone-400" aria-hidden>
              {i % 2 === 0 ? hourLabel(h).replace('m', '') : ''}
            </span>
          ))}
          {WEEK_ORDER.map((d) => (
            <React.Fragment key={d}>
              <span className="flex items-center text-[11px] font-semibold text-stone-500">{WEEKDAYS[d]}</span>
              {hoursShown.map((h) => {
                const v = p.heat[d][h]
                return (
                  <button
                    key={h}
                    type="button"
                    role="gridcell"
                    aria-label={`${WEEKDAY_NAMES[d]} ${hourRange(h)}: ${fmt(v)} on average`}
                    onMouseEnter={() => setHover({ d, h })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ d, h })}
                    onBlur={() => setHover(null)}
                    className={cn(
                      'h-7 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-stone-900',
                      hover?.d === d && hover?.h === h && 'ring-2 ring-stone-900'
                    )}
                    style={{ background: heatColor(v, p.heatMax) }}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600">
        <p aria-live="polite" className="min-h-[1rem]">
          {hover ? (
            <>
              <strong className="text-stone-900">
                {WEEKDAY_NAMES[hover.d]} {hourRange(hover.h)}
              </strong>{' '}
              · {fmt(cell)} on average
            </>
          ) : (
            'Hover or tap a square for details'
          )}
        </p>
        <span className="inline-flex items-center gap-1.5" aria-hidden>
          Less
          {HEAT_RAMP.map((c) => (
            <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}

const Tile = ({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'stone',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'stone' | 'up' | 'down'
}) => (
  <div className="rounded-xl bg-stone-50 p-3">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
      <Icon className={cn('h-3.5 w-3.5', tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-600' : 'text-stone-400')} />{' '}
      {label}
    </p>
    <p className="mt-1 text-lg font-extrabold leading-tight text-stone-900">{value}</p>
    {hint && <p className="text-[11px] text-stone-500">{hint}</p>}
  </div>
)

type Range = '7' | '30' | '90'

export const SalesPatterns = ({ o, now }: { o: OwnerData & { restaurant: Restaurant }; now: Date }) => {
  const r = o.restaurant
  const [range, setRange] = useState<Range>('30')
  const [metric, setMetric] = useState<Metric>('sales')
  const [table, setTable] = useState(false)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - Number(range))
  const money = (n: number) => formatMoney(n, r.currency)
  const fmt = (n: number) => (metric === 'sales' ? money(Math.round(n)) : `${Math.round(n * 10) / 10}`)
  const p = useMemo(
    () => salesPatterns(o.orders, from, to, r.hours, metric, money),
    [o.orders, from.getTime(), to.getTime(), r.hours, metric]
  ) // eslint-disable-line react-hooks/exhaustive-deps
  // Only the hours that matter: open hours plus any hour with sales, as one span.
  const active = Array.from({ length: 24 }, (_, h) => h).filter((h) => p.byHour[h] > 0 || WEEK_ORDER.some((d) => p.heat[d][h] > 0))
  const openSpan = (() => {
    const hrs = Object.values(r.hours).flatMap((ps) =>
      (ps ?? []).flatMap((x) => [Number(x.open.split(':')[0]), Number(x.close.split(':')[0])])
    )
    return hrs.length ? [Math.min(...hrs), Math.max(...hrs)] : [8, 22]
  })()
  const lo = Math.min(openSpan[0], ...(active.length ? active : [openSpan[0]]))
  const hi = Math.max(openSpan[1] - 1, ...(active.length ? active : [openSpan[1] - 1]))
  const hoursShown = Array.from({ length: Math.max(1, hi - lo + 1) }, (_, i) => (lo + i) % 24)
  const noun = metric === 'sales' ? 'sales' : 'orders'

  return (
    <Card className="mb-4 p-5" aria-labelledby="patterns-title">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="patterns-title" className="text-base font-extrabold text-stone-900">
            Sales patterns
          </h2>
          <p className="text-xs text-stone-500">Which days and hours bring the business — and how it’s changing</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-56">
            <Segmented
              ariaLabel="Patterns period"
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
            />
          </div>
          <div className="w-44">
            <Segmented
              ariaLabel="Measure"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'sales', label: 'Sales' },
                { value: 'orders', label: 'Orders' },
              ]}
            />
          </div>
        </div>
      </div>

      {p.total === 0 ? (
        <p className="py-10 text-center text-sm text-stone-500">
          No sales in the last {range} days yet — patterns appear as orders come in.
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Tile
              icon={p.change === null ? TrendingUp : p.change >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={p.change === null ? 'stone' : p.change >= 0 ? 'up' : 'down'}
              label={`Last ${range} days`}
              value={<span data-testid="patterns-total">{fmt(p.total)}</span>}
              hint={
                p.change === null
                  ? 'Nothing to compare with yet'
                  : `${p.change >= 0 ? '+' : '−'}${Math.abs(Math.round(p.change * 100))}% vs previous ${range} days`
              }
            />
            <Tile
              icon={TrendingUp}
              label="Average open day"
              value={fmt(p.dailyAverage)}
              hint={p.best ? `Best ${dayName(p.best.date)} · ${fmt(p.best.value)}` : undefined}
              tone="up"
            />
            <Tile
              icon={Flame}
              label="Strongest day · peak hour"
              value={p.bestWeekday !== undefined ? `${WEEKDAY_NAMES[p.bestWeekday]}s` : '—'}
              hint={p.peakHour !== undefined ? `Busiest ${hourRange(p.peakHour)}` : undefined}
            />
            <Tile
              icon={Moon}
              label="Quietest day · hour"
              value={p.slowWeekday !== undefined ? `${WEEKDAY_NAMES[p.slowWeekday]}s` : '—'}
              hint={p.quietHour !== undefined ? `Slowest ${hourRange(p.quietHour)}` : undefined}
              tone="down"
            />
          </div>

          {p.insights.length > 0 && (
            <ul className="mb-5 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3" aria-label="Insights">
              {p.insights.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-stone-700">
                  <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" /> {t}
                </li>
              ))}
            </ul>
          )}

          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionTitle title={`Daily ${noun}`} hint={`Last ${range} days`} />
            <button
              type="button"
              onClick={() => setTable((v) => !v)}
              aria-pressed={table}
              className="h-8 rounded-lg border border-stone-200 px-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              {table ? 'Show charts' : 'View as table'}
            </button>
          </div>

          {table ? (
            <div className="max-h-80 overflow-auto rounded-xl border border-stone-100">
              <table className="w-full text-sm" aria-label={`Daily ${noun}`}>
                <thead className="sticky top-0 bg-stone-50 text-[11px] uppercase tracking-wide text-stone-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">
                      Day
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Orders
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Sales
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      7-day average
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {[...p.days].reverse().map((d) => (
                    <tr key={d.key} className={cn(d === p.best && 'bg-emerald-50/60', d === p.worst && 'bg-rose-50/60')}>
                      <td className="px-3 py-1.5">
                        {dayName(d.date)}
                        {d === p.best && <span className="ml-2 text-[10px] font-bold text-emerald-700">BEST</span>}
                        {d === p.worst && <span className="ml-2 text-[10px] font-bold text-rose-700">SLOWEST</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.orders}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(d.sales)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.avg7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <TrendChart p={p} fmt={fmt} />
              <div className="mt-6">
                <SectionTitle title="When it’s busy" hint={`Average ${noun} for each weekday and hour`} />
                <Heatmap p={p} fmt={fmt} hoursShown={hoursShown} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <SectionTitle title="By day of the week" hint={`Average ${noun} per day`} />
                  <BarChart
                    data={WEEK_ORDER.map((d) => ({ key: String(d), label: WEEKDAYS[d], detail: WEEKDAY_NAMES[d], value: p.byWeekday[d] }))}
                    format={(n) => fmt(n)}
                    ariaLabel={`Average ${noun} by day of the week`}
                  />
                </div>
                <div>
                  <SectionTitle title="By hour of the day" hint={`Average ${noun} per day`} />
                  <BarChart
                    data={hoursShown.map((h) => ({
                      key: String(h),
                      label: hourLabel(h).replace('m', ''),
                      detail: hourRange(h),
                      value: p.byHour[h],
                    }))}
                    format={(n) => fmt(n)}
                    ariaLabel={`Average ${noun} by hour of the day`}
                  />
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-stone-400">
                <Clock className="h-3 w-3" /> Cancelled orders are left out. Times are when the order was placed.
              </p>
            </>
          )}
        </>
      )}
    </Card>
  )
}
