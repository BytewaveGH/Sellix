'use client'

// Pay as you sell, shared by the owner's billing page and the console: the
// bill so far this month, and the rates.

import React from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cedis } from '@/lib/subscription/access'
import { percent, ratesFor, salesOf, usageBill, type UsagePricing, type UsageReport } from '@/lib/subscription/usage'
import { shortDate } from './bits'

// The bill for the current period. `report` null: the backend hasn't counted
// sales yet, so only the minimum and cap are shown.
export const UsageBillCard = ({
  pricing,
  report,
  periodStart,
  periodEnd,
  audience,
  className,
}: {
  pricing: UsagePricing
  report: UsageReport | null | undefined
  periodStart: string
  periodEnd: string | null
  audience: 'owner' | 'platform'
  className?: string
}) => {
  const bill = report ? usageBill(salesOf(report), pricing) : null
  const limits = `Minimum ${cedis(pricing.minimum)}${pricing.cap !== null ? ` · cap ${cedis(pricing.cap)}` : ''} a month`
  return (
    <div className={cn('rounded-2xl border border-stone-200 p-4', className)} aria-label="Bill so far">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-stone-900">
          {audience === 'owner' ? 'This month so far' : 'Bill so far'}
          <span className="font-normal text-stone-500">
            {' '}
            · {shortDate(periodStart)} – {periodEnd ? shortDate(periodEnd) : '—'}
          </span>
        </p>
        {bill && (
          <p className="text-2xl font-extrabold tracking-tight text-stone-900 tabular-nums" aria-label="Fee so far">
            {cedis(bill.total)}
          </p>
        )}
      </div>
      {bill ? (
        <>
          {bill.lines.length > 0 ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-stone-400 border-b border-stone-100">
                  <th className="py-2 pr-3 font-bold">Sales</th>
                  <th className="py-2 pr-3 text-right font-bold">Amount</th>
                  <th className="py-2 pr-3 text-right font-bold">Rate</th>
                  <th className="py-2 text-right font-bold">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {bill.lines.map((l) => (
                  <tr key={l.key}>
                    <td className="py-2 pr-3 text-stone-700">{l.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-stone-700">{cedis(l.sales)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-stone-500">{percent(l.rate)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-stone-900">{cedis(l.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-stone-500">No sales counted yet this month.</p>
          )}
          {bill.adjustment && (
            <p className="mt-2 text-xs text-stone-500">
              {bill.adjustment === 'minimum'
                ? `Fees come to ${cedis(bill.fees)}, so the monthly minimum of ${cedis(pricing.minimum)} applies.`
                : `Fees come to ${cedis(bill.fees)}, capped at ${cedis(pricing.cap ?? 0)} a month.`}
            </p>
          )}
          <p className="mt-2 text-[11px] text-stone-400">
            {limits}. Counted from synced sales, last updated {shortDate(report!.updatedAt)}.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-stone-500 flex gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-stone-400" />
          <span>
            {audience === 'owner'
              ? 'Your fee so far will show here once your sales are counted.'
              : 'Sales for this period haven’t been counted yet.'}{' '}
            {limits}.
          </span>
        </p>
      )}
    </div>
  )
}

// The rates one module pays, e.g. the four store fee types.
export const UsageRates = ({ pricing, module, className }: { pricing: UsagePricing; module: string; className?: string }) => (
  <ul className={cn('flex flex-col gap-1.5 text-sm', className)}>
    {ratesFor(module, pricing.rates).map((r) => (
      <li key={r.label} className="flex items-baseline justify-between gap-3">
        <span className="text-stone-700">
          {r.label}
          {r.hint && <span className="block text-[11px] text-stone-400">{r.hint}</span>}
        </span>
        <span className="font-semibold tabular-nums text-stone-900">{percent(r.rate)}</span>
      </li>
    ))}
  </ul>
)
