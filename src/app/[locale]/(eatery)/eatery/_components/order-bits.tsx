'use client'

import React from 'react'
import { Bike, CheckCircle2, ChefHat, Clock, Loader2, PackageCheck, ShoppingBag, Smartphone, UtensilsCrossed, XCircle } from 'lucide-react'
import { differenceInMinutes } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge, type BadgeSpec } from '@/components/kit/ui'
import { clockLabel, formatMoney } from '@/lib/eatery/menu'
import type { Order, OrderStatus } from '@/lib/eatery/types'

// An order rung up on this till that the server doesn't have yet.
export const SyncPill = ({ order }: { order: Pick<Order, 'syncState'> }) =>
  order.syncState ? (
    <span
      className={cn(
        'ml-1.5 inline-flex rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide',
        order.syncState === 'syncing' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'
      )}
      title={order.syncState === 'syncing' ? 'Saved on this till, on its way to the server' : 'The server refused it — see the sync list at the top'}
    >
      {order.syncState === 'syncing' ? 'Syncing' : 'Needs attention'}
    </span>
  ) : null

export const STATUS: Record<OrderStatus, BadgeSpec> = {
  placed: { label: 'New', icon: Clock, className: 'bg-rose-50 text-rose-700 ring-rose-600/15', dot: '#E11D48' },
  accepted: { label: 'Accepted', icon: CheckCircle2, className: 'bg-endeavour/10 text-endeavour ring-endeavour/15', dot: '#0865AC' },
  preparing: { label: 'Preparing', icon: ChefHat, className: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: '#F59E0B' },
  ready: { label: 'Ready', icon: PackageCheck, className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: '#10B981' },
  'out-for-delivery': { label: 'On the way', icon: Bike, className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: '#10B981' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-stone-100 text-stone-600 ring-stone-400/20', dot: '#A8A29E' },
  cancelled: { label: 'Cancelled', icon: XCircle, className: 'bg-stone-100 text-stone-500 ring-stone-400/20', dot: '#D6D3D1' },
}

export const LIVE: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'out-for-delivery']

// The one obvious next step for an order.
export const nextStep = (o: Order): { to: OrderStatus; label: string } | null => {
  switch (o.status) {
    case 'placed':
      return { to: 'accepted', label: 'Accept' }
    case 'accepted':
      return { to: 'preparing', label: 'Start preparing' }
    case 'preparing':
      return o.fulfilment.type === 'delivery' ? { to: 'out-for-delivery', label: 'Send out' } : { to: 'ready', label: 'Mark ready' }
    case 'ready':
      return { to: 'completed', label: o.fulfilment.type === 'dine-in' ? 'Served' : 'Picked up' }
    case 'out-for-delivery':
      return { to: 'completed', label: 'Delivered' }
    default:
      return null
  }
}

export const fulfilmentLabel = (o: Order) =>
  o.fulfilment.type === 'dine-in'
    ? `Table ${o.fulfilment.table}`
    : o.fulfilment.type === 'delivery'
      ? 'Delivery'
      : o.fulfilment.pickupAt && o.fulfilment.pickupAt !== 'asap'
        ? `Pickup ${clockLabel(o.fulfilment.pickupAt)}`
        : 'Pickup ASAP'

const FULFIL_ICON = { 'dine-in': UtensilsCrossed, delivery: Bike, pickup: ShoppingBag }

export const ago = (iso: string, now: Date) => {
  const m = differenceInMinutes(now, new Date(iso))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.floor(m / 60)} h ago` : new Date(iso).toLocaleDateString()
}

// How long an order has been waiting, and how worried to be about it.
export const waitMinutes = (o: Order, now: Date) => Math.max(0, differenceInMinutes(now, new Date(o.createdAt)))
export const WAIT_AMBER = 10
export const WAIT_RED = 20
export const waitTone = (minutes: number) => (minutes >= WAIT_RED ? 'red' : minutes >= WAIT_AMBER ? 'amber' : 'ok')

export const WaitTimer = ({ order, now, className }: { order: Order; now: Date; className?: string }) => {
  const m = waitMinutes(order, now)
  const tone = waitTone(m)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold tabular-nums',
        tone === 'red' ? 'bg-rose-600 text-white' : tone === 'amber' ? 'bg-amber-400 text-stone-900' : 'bg-stone-100 text-stone-700',
        className
      )}
      title={`Waiting ${m} min`}
    >
      <Clock className="h-3.5 w-3.5" /> {m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`}
    </span>
  )
}

export const paymentLabel = (o: Order) =>
  `${o.payment.method === 'momo' ? 'MoMo' : o.payment.method === 'cash' ? 'Cash' : o.payment.method === 'card' ? 'Card' : 'At table'} · ${o.payment.status === 'paid' ? 'paid' : o.payment.status === 'pending' ? 'to confirm' : 'unpaid'}`

export const OrderCard = ({
  order,
  currency,
  now,
  busy,
  onAdvance,
  onCancel,
  onMarkPaid,
  compact,
  timer,
  className,
}: {
  order: Order
  currency: string
  now: Date
  busy?: boolean
  onAdvance?: (to: OrderStatus) => void
  onCancel?: () => void
  onMarkPaid?: () => void
  compact?: boolean
  // Live boards: a waiting-time badge that turns amber, then red.
  timer?: boolean
  className?: string
}) => {
  const step = nextStep(order)
  const Icon = FULFIL_ICON[order.fulfilment.type]
  const waiting = order.status === 'placed' && differenceInMinutes(now, new Date(order.createdAt)) >= 5
  const late = timer && waitTone(waitMinutes(order, now)) === 'red'
  return (
    <article
      className={cn(
        'rounded-2xl border bg-white shadow-sm',
        compact ? 'p-3' : 'p-4',
        waiting || late ? 'border-rose-300 ring-2 ring-rose-100' : 'border-stone-200',
        className
      )}
      aria-label={`Order ${order.code}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold tracking-wider text-stone-900">
            #{order.code}
            <SyncPill order={order} />
          </p>
          <p className="text-xs text-stone-500">
            {order.customer.name} · {ago(order.createdAt, now)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge spec={STATUS[order.status]} />
          {timer && <WaitTimer order={order} now={now} />}
        </div>
      </header>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">
        <Icon className="h-3.5 w-3.5" /> {fulfilmentLabel(order)}
        {order.channel === 'counter' && <span className="ml-1 rounded bg-white px-1 text-[10px] text-stone-500">Counter</span>}
      </p>
      {/* Every line with its options (size, toppings, sauces…) — compact cards too. */}
      {
        <ul className={cn('mt-3 space-y-1.5', compact ? 'text-xs' : 'text-sm')}>
          {order.lines.map((l, i) => (
            <li key={i}>
              <span className="font-bold text-stone-900">
                {l.quantity}× {l.name}
              </span>
              {l.summary && <span className={cn('block text-stone-500', compact ? 'text-[11px]' : 'text-xs')}>{l.summary}</span>}
              {l.note && <span className="block text-xs italic text-amber-700">“{l.note}”</span>}
            </li>
          ))}
        </ul>
      }
      {!compact && order.fulfilment.type === 'delivery' && (
        <p className="mt-2 text-xs text-stone-600">
          {order.fulfilment.address}
          {order.fulfilment.landmark ? ` · ${order.fulfilment.landmark}` : ''} ·{' '}
          <a href={`tel:${order.customer.phone.replace(/\s/g, '')}`} className="font-semibold text-endeavour">
            {order.customer.phone}
          </a>
        </p>
      )}
      {/* The customer's note always shows: cooks need it on compact tickets too. */}
      {order.notes && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">“{order.notes}”</p>}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
        <div>
          <p className="text-base font-extrabold tabular-nums text-stone-900">{formatMoney(order.total, currency)}</p>
          <p
            className={cn(
              'text-[11px] font-semibold inline-flex items-center gap-1',
              order.payment.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'
            )}
          >
            {order.payment.method === 'momo' && <Smartphone className="h-3 w-3" />}
            {paymentLabel(order)}
            {order.payment.reference ? ` · ref ${order.payment.reference}` : ''}
          </p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>
      {(onAdvance || onCancel || onMarkPaid) && (step || order.payment.status !== 'paid') && order.status !== 'cancelled' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {step && onAdvance && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdvance(step.to)}
              className="h-10 flex-1 rounded-xl bg-endeavour px-3 text-sm font-bold text-white hover:bg-veniceBlue disabled:opacity-50"
            >
              {step.label}
            </button>
          )}
          {onMarkPaid && order.payment.status !== 'paid' && (
            <button
              type="button"
              disabled={busy}
              onClick={onMarkPaid}
              className="h-10 rounded-xl border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Mark paid
            </button>
          )}
          {onCancel && ['placed', 'accepted'].includes(order.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="h-10 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {order.status === 'placed' ? 'Decline' : 'Cancel'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}
