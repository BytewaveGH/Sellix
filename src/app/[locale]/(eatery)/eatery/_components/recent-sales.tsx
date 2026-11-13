'use client'

import React, { useState } from 'react'
import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/kit/ui'
import { ConfirmDialog, Drawer } from '@/components/kit/form'
import { useEateryActions } from '@/lib/eatery/hooks'
import { formatMoney } from '@/lib/eatery/menu'
import { dayKey, methodLabel, totalsOf } from '@/lib/eatery/sales'
import type { Order, Restaurant } from '@/lib/eatery/types'
import { OrderDetail } from './order-detail'
import { SyncPill } from './order-bits'
import { printReceipt, trackingUrl } from './receipt'

// The cashier's view of today: every order so far, today's totals by payment,
// and one tap to reprint a receipt or collect an unpaid bill. Works for staff
// who can't open the full Sales page (that needs "view reports").
export const RecentSales = ({
  orders,
  restaurant,
  now,
  locale,
}: {
  orders: Order[]
  restaurant: Restaurant
  now: Date
  locale: string
}) => {
  const actions = useEateryActions()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const today = orders.filter((o) => dayKey(o.createdAt) === dayKey(now)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const t = totalsOf(today)
  const m = (n: number) => formatMoney(n, restaurant.currency)
  const live = detail ? (orders.find((x) => x.id === detail.id) ?? detail) : null

  const markPaid = async (o: Order) => {
    setBusy(true)
    try {
      await actions.update('orders', o.id, { payment: { ...o.payment, status: 'paid' } })
    } catch {
      // toast shown
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50"
      >
        <History className="h-4 w-4 text-endeavour" /> Today · {m(t.net)}
        {t.unpaidCount > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">{t.unpaidCount} unpaid</span>
        )}
      </button>
      <Drawer open={open} onOpenChange={setOpen} title="Today’s sales" description={`${t.orders} orders · ${m(t.net)}`}>
        <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ['Cash', t.byMethod.cash],
              ['MoMo', t.byMethod.momo],
              ['Card', t.byMethod.card],
              ['Not paid', t.unpaid],
            ] as [string, number][]
          ).map(([label, v]) => (
            <div key={label} className={cn('rounded-xl p-3', label === 'Not paid' && v > 0 ? 'bg-amber-50' : 'bg-stone-50')}>
              <dt className="text-[11px] font-semibold text-stone-500">{label}</dt>
              <dd className="text-base font-extrabold tabular-nums text-stone-900">{m(v)}</dd>
            </div>
          ))}
        </dl>
        {today.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">No orders yet today.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {today.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setDetail(o)}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-stone-50"
                  aria-label={`Order ${o.code}`}
                >
                  <span className="w-14 text-xs tabular-nums text-stone-400">
                    {new Date(o.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-extrabold tracking-wider text-stone-900">#{o.code}</span>
                    <SyncPill order={o} />
                    <span className="ml-2 text-xs text-stone-500">{o.customer.name}</span>
                    <span className="block truncate text-xs text-stone-500">
                      {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className={cn(
                        'block font-extrabold tabular-nums',
                        o.status === 'cancelled' ? 'text-stone-400 line-through' : 'text-stone-900'
                      )}
                    >
                      {m(o.total)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        o.status === 'cancelled' ? 'text-stone-400' : o.payment.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'
                      )}
                    >
                      {o.status === 'cancelled'
                        ? 'cancelled'
                        : `${methodLabel(o.payment.method)} · ${o.payment.status === 'paid' ? 'paid' : 'unpaid'}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
            Back to the counter
          </Button>
        </div>
      </Drawer>
      <OrderDetail
        order={live}
        restaurant={restaurant}
        busy={busy}
        onOpenChange={(v) => !v && setDetail(null)}
        onMarkPaid={(o) => void markPaid(o)}
        onCancel={setCancelling}
        onPrint={(o) =>
          void printReceipt(
            o,
            restaurant,
            (o as Order & { accessKey?: string }).accessKey
              ? trackingUrl(window.location.origin, locale, restaurant.slug, o as Order & { accessKey?: string })
              : undefined
          )
        }
      />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title={`Cancel order #${cancelling?.code ?? ''}?`}
        description="It stops counting in sales and its ingredients go back into stock. Refund any payment yourself."
        confirmLabel="Cancel order"
        onConfirm={() => (cancelling ? actions.update('orders', cancelling.id, { status: 'cancelled' }) : undefined)}
      />
    </>
  )
}
