'use client'

import React, { useEffect, useRef, useState } from 'react'
import { isSameDay } from 'date-fns'
import { ChefHat, Columns3, Expand, Rows3, Shrink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, PageHeader } from '@/components/kit/ui'
import { ConfirmDialog, Segmented } from '@/components/kit/form'
import { useEateryActions, useNow } from '@/lib/eatery/hooks'
import {
  DEFAULT_BOARD_PREFS,
  itemsToMake,
  kitchenOrder,
  readBoardPrefs,
  writeBoardPrefs,
  type BoardPrefs,
  type BoardView,
} from '@/lib/eatery/kitchen'
import type { FulfilmentType, Order, OrderStatus } from '@/lib/eatery/types'
import { EateryFrame, RestaurantSwitcher } from '../_components/frame'
import { LIVE, OrderCard } from '../_components/order-bits'
import { SoundToggle, useNewOrderAlert } from '../_components/alerts'

const COLUMNS: { key: string; title: string; statuses: OrderStatus[]; empty: string }[] = [
  { key: 'new', title: 'New', statuses: ['placed'], empty: 'New orders land here' },
  { key: 'kitchen', title: 'In the kitchen', statuses: ['accepted', 'preparing'], empty: 'Nothing cooking' },
  { key: 'ready', title: 'Ready & on the way', statuses: ['ready', 'out-for-delivery'], empty: 'Nothing waiting' },
]

// "(2) Orders" in the tab title so a waiting order is noticed from another tab.
const TitleCount = ({ count }: { count: number }) => {
  useEffect(() => {
    document.title = count ? `(${count}) Orders · Sellix` : 'Orders · Sellix'
  }, [count])
  return null
}

const Alerts = ({ orders, currency }: { orders: Order[]; currency: string }) => {
  const { sound, toggle } = useNewOrderAlert(orders, currency)
  return (
    <div className="mb-3 flex justify-end">
      <SoundToggle sound={sound} onToggle={() => void toggle()} />
    </div>
  )
}

const VIEWS: { value: BoardView; label: string; hint: string; icon: typeof Columns3 }[] = [
  { value: 'columns', label: 'Columns', hint: 'Stages side by side; each scrolls on its own', icon: Columns3 },
  { value: 'rows', label: 'Rows', hint: 'Stages stacked; swipe each sideways', icon: Rows3 },
  { value: 'kitchen', label: 'Kitchen', hint: 'Every open order as a ticket, oldest first', icon: ChefHat },
]

const useBoardPrefs = () => {
  const [prefs, setPrefs] = useState<BoardPrefs>(DEFAULT_BOARD_PREFS)
  useEffect(() => setPrefs(readBoardPrefs()), [])
  const set = (p: Partial<BoardPrefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p }
      writeBoardPrefs(next)
      return next
    })
  return [prefs, set] as const
}

const useFullscreen = (ref: React.RefObject<HTMLElement>) => {
  const [on, setOn] = useState(false)
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(!!document.fullscreenEnabled)
    const sync = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void ref.current?.requestFullscreen?.().catch(() => {})
  }
  return { on, toggle, supported }
}

// What the kitchen has to cook right now, added up across tickets.
const ToMakeStrip = ({ orders }: { orders: Order[] }) => {
  const items = itemsToMake(orders)
  if (items.length === 0) return null
  return (
    <section aria-label="To make now" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
        <ChefHat className="h-3.5 w-3.5" /> To make now
      </p>
      <ul className="flex gap-2 overflow-x-auto pb-0.5">
        {items.map((i) => (
          <li key={`${i.name}-${i.summary ?? ''}`} className="flex-shrink-0 rounded-xl bg-white px-3 py-1.5 ring-1 ring-amber-200">
            <span className="text-base font-extrabold tabular-nums text-stone-900">{i.quantity}×</span>{' '}
            <span className="text-sm font-bold text-stone-900">{i.name}</span>
            {i.summary && <span className="block max-w-[220px] truncate text-[11px] text-stone-500">{i.summary}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function OrdersBoard() {
  const now = useNow(15_000)
  const actions = useEateryActions()
  const [type, setType] = useState<FulfilmentType | 'all'>('all')
  const [busy, setBusy] = useState<number | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)
  const [prefs, setPrefs] = useBoardPrefs()
  // Phones show one stage at a time in the columns view.
  const [stage, setStage] = useState(COLUMNS[0].key)
  const boardRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(boardRef)

  const update = async (o: Order, body: Partial<Order>) => {
    setBusy(o.id)
    try {
      await actions.update('orders', o.id, body)
    } catch {
      // toast shown
    } finally {
      setBusy(null)
    }
  }

  return (
    <EateryFrame>
      {(o) => {
        const list = o.orders.filter((x) => type === 'all' || x.fulfilment.type === type)
        const done = list.filter((x) => ['completed', 'cancelled'].includes(x.status) && isSameDay(new Date(x.updatedAt), now))
        const fresh = o.orders.filter((x) => x.status === 'placed').length
        const r = o.restaurant
        return (
          <>
            <TitleCount count={fresh} />
            <Alerts orders={o.orders} currency={r.currency} />
            <PageHeader
              eyebrow={r.name}
              title="Live orders"
              description="Move each order along as it’s made. Customers see every step on their phone."
              actions={<RestaurantSwitcher o={o} />}
            />
            <div className="mb-4 max-w-md">
              <Segmented
                ariaLabel="Order type"
                value={type}
                onChange={setType}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'dine-in', label: 'Dine-in' },
                  { value: 'pickup', label: 'Pickup' },
                  { value: 'delivery', label: 'Delivery' },
                ]}
              />
            </div>
            <div ref={boardRef} className={cn('bg-[rgb(var(--page))]', fullscreen.on && 'overflow-y-auto p-4')}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-xl bg-stone-100 p-1">
                  {VIEWS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      role="radio"
                      aria-checked={prefs.view === v.value}
                      title={v.hint}
                      onClick={() => setPrefs({ view: v.value })}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors',
                        prefs.view === v.value
                          ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-400'
                          : 'text-stone-500 hover:text-stone-800'
                      )}
                    >
                      <v.icon className="h-4 w-4" /> {v.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.compact}
                  onClick={() => setPrefs({ compact: !prefs.compact })}
                  className={cn(
                    'inline-flex h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold',
                    prefs.compact ? 'border-endeavour bg-endeavour/10 text-endeavour' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  )}
                >
                  Compact tickets
                </button>
                {fullscreen.supported && (
                  <button
                    type="button"
                    onClick={fullscreen.toggle}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-bold text-stone-600 hover:bg-stone-50"
                  >
                    {fullscreen.on ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                    {fullscreen.on ? 'Exit full screen' : 'Full screen'}
                  </button>
                )}
              </div>

              <ToMakeStrip orders={list} />

              {(() => {
                const card = (x: Order, extra?: string) => (
                  <OrderCard
                    key={x.id}
                    order={x}
                    currency={r.currency}
                    now={now}
                    busy={busy === x.id}
                    compact={prefs.compact}
                    timer
                    className={extra}
                    onAdvance={(to) => void update(x, { status: to })}
                    onMarkPaid={() => void update(x, { payment: { ...x.payment, status: 'paid' } })}
                    onCancel={() => setCancelling(x)}
                  />
                )
                const columns = COLUMNS.map((c) => ({
                  ...c,
                  orders: list.filter((x) => c.statuses.includes(x.status)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
                }))

                if (prefs.view === 'kitchen') {
                  const open = list.filter((x) => LIVE.includes(x.status)).sort(kitchenOrder)
                  return open.length === 0 ? (
                    <p className="rounded-2xl bg-stone-50 py-16 text-center text-sm text-stone-400">No open orders</p>
                  ) : (
                    <div
                      className={cn(
                        'grid gap-3',
                        prefs.compact
                          ? 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]'
                          : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'
                      )}
                    >
                      {open.map((x) => card(x))}
                    </div>
                  )
                }

                if (prefs.view === 'rows') {
                  return (
                    <div className="flex flex-col gap-4">
                      {columns.map((c) => (
                        <section key={c.key} aria-labelledby={`row-${c.key}`} className="rounded-2xl bg-stone-50 p-3">
                          <h2 id={`row-${c.key}`} className="mb-3 flex items-center gap-2 px-1 text-sm font-extrabold text-stone-800">
                            {c.title}
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-stone-500 ring-1 ring-stone-200">
                              {c.orders.length}
                            </span>
                          </h2>
                          {c.orders.length === 0 ? (
                            <p className="py-4 text-center text-xs text-stone-400">{c.empty}</p>
                          ) : (
                            <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                              {c.orders.map((x) => card(x, cn('flex-shrink-0 snap-start', prefs.compact ? 'w-[230px]' : 'w-[290px]')))}
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  )
                }

                return (
                  <>
                    {/* Phones: one stage at a time instead of three long stacked columns. */}
                    <div role="tablist" aria-label="Stage" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1 lg:hidden">
                      {columns.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          role="tab"
                          aria-selected={stage === c.key}
                          onClick={() => setStage(c.key)}
                          className={cn(
                            'h-10 rounded-lg px-1 text-xs font-bold',
                            stage === c.key ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-400' : 'text-stone-500'
                          )}
                        >
                          {c.title} · {c.orders.length}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      {columns.map((c) => (
                        <section
                          key={c.key}
                          aria-labelledby={`col-${c.key}`}
                          className={cn(
                            'rounded-2xl bg-stone-50 p-3 lg:flex lg:flex-col',
                            // Each column scrolls inside itself, so the page doesn't.
                            fullscreen.on ? 'lg:h-[calc(100dvh-170px)]' : 'lg:h-[calc(100dvh-300px)] lg:min-h-[420px]',
                            stage === c.key ? 'block' : 'hidden'
                          )}
                        >
                          <h2
                            id={`col-${c.key}`}
                            className="mb-3 flex flex-shrink-0 items-center justify-between px-1 text-sm font-extrabold text-stone-800"
                          >
                            {c.title}
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-stone-500 ring-1 ring-stone-200">
                              {c.orders.length}
                            </span>
                          </h2>
                          <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                            {c.orders.length === 0 && <p className="py-8 text-center text-xs text-stone-400">{c.empty}</p>}
                            {c.orders.map((x) => card(x))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
            {done.length > 0 && (
              <Card className="mt-6 p-5">
                <h2 className="text-sm font-extrabold text-stone-800 mb-3">Finished today · {done.length}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {done.map((x) => (
                    <OrderCard
                      key={x.id}
                      order={x}
                      currency={r.currency}
                      now={now}
                      compact
                      onMarkPaid={
                        x.status === 'completed' ? () => void update(x, { payment: { ...x.payment, status: 'paid' } }) : undefined
                      }
                    />
                  ))}
                </div>
              </Card>
            )}
            <ConfirmDialog
              open={!!cancelling}
              onOpenChange={(v) => !v && setCancelling(null)}
              title={`Cancel order #${cancelling?.code ?? ''}?`}
              description="The customer sees it as cancelled. If they paid by MoMo, refund them yourself."
              confirmLabel="Cancel order"
              onConfirm={() => (cancelling ? actions.update('orders', cancelling.id, { status: 'cancelled' }) : undefined)}
            />
          </>
        )
      }}
    </EateryFrame>
  )
}
