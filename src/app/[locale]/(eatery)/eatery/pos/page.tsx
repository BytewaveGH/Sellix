'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Banknote,
  Bike,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/kit/ui'
import { Segmented, Toggle } from '@/components/kit/form'
import { apiErrorMessage } from '@/lib/api-error'
import { useCart, useCartLines } from '@/lib/eatery/cart'
import { useEateryActions, useNow, type OwnerData } from '@/lib/eatery/hooks'
import { formatMoney, itemAvailability, priceOrder } from '@/lib/eatery/menu'
import type { MenuItem, Order, Restaurant, StorefrontBundle } from '@/lib/eatery/types'
import { ItemSheet } from '@/components/eatery/item-sheet'
import { fromPrice } from '@/components/eatery/menu-view'
import { ItemArt, ThemeScope } from '@/components/eatery/theme-scope'
import { EateryFrame } from '../_components/frame'
import { SoundToggle, useNewOrderAlert } from '../_components/alerts'
import { ago, fulfilmentLabel } from '../_components/order-bits'
import { printReceipt, trackingUrl } from '../_components/receipt'
import { RecentSales } from '../_components/recent-sales'

type Method = 'cash' | 'momo' | 'card'

// Incoming online orders, at the top of the POS: accept or decline in one tap.
// Accepting notifies the customer's phone (their order page is watching).
const Incoming = ({
  orders,
  currency,
  now,
  onAccept,
  onDecline,
  busy,
}: {
  orders: Order[]
  currency: string
  now: Date
  onAccept: (o: Order) => void
  onDecline: (o: Order) => void
  busy: number | null
}) =>
  orders.length === 0 ? null : (
    <section aria-label="Online orders waiting" className="mb-3 min-w-0 max-w-full rounded-2xl border border-rose-200 bg-rose-50/70 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-extrabold text-rose-800">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        {orders.length} online order{orders.length === 1 ? '' : 's'} waiting
      </p>
      <ul className="flex max-w-full snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {orders.map((o) => (
          <li key={o.id} className="w-64 flex-shrink-0 snap-start rounded-xl bg-white p-3 shadow-sm" aria-label={`Online order ${o.code}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-extrabold tracking-wider text-stone-900">#{o.code}</p>
                <p className="text-xs text-stone-500">
                  {o.customer.name} · {ago(o.createdAt, now)}
                </p>
              </div>
              <p className="font-extrabold tabular-nums text-stone-900">{formatMoney(o.total, currency)}</p>
            </div>
            <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-600">
              {o.fulfilment.type === 'delivery' ? (
                <Bike className="h-3 w-3" />
              ) : o.fulfilment.type === 'dine-in' ? (
                <UtensilsCrossed className="h-3 w-3" />
              ) : (
                <ShoppingBag className="h-3 w-3" />
              )}
              {fulfilmentLabel(o)}
            </p>
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs">
              {o.lines.map((l, i) => (
                <li key={i}>
                  <span className="font-bold text-stone-900">
                    {l.quantity}× {l.name}
                  </span>
                  {l.summary && <span className="block text-stone-500">{l.summary}</span>}
                  {l.note && <span className="block italic text-amber-700">“{l.note}”</span>}
                </li>
              ))}
            </ul>
            {o.notes && <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">“{o.notes}”</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => onAccept(o)}
                className="h-10 flex-1 rounded-lg bg-endeavour text-sm font-bold text-white hover:bg-veniceBlue disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => onDecline(o)}
                className="h-10 rounded-lg px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )

const PosScreen = ({ o }: { o: OwnerData & { restaurant: Restaurant } }) => {
  const r = o.restaurant
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const now = useNow(15_000)
  const actions = useEateryActions()
  const key = `__pos__${r.id}`
  const lines = useCartLines(key)
  const { add, setQuantity, removeLine, clear } = useCart()
  const { waiting, sound, toggle } = useNewOrderAlert(o.orders, r.currency)

  const [category, setCategory] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null)
  const [type, setType] = useState<'dine-in' | 'pickup'>(r.fulfilment.dineIn.enabled ? 'dine-in' : 'pickup')
  const [table, setTable] = useState('')
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [paid, setPaid] = useState(true)
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<(Order & { accessKey?: string }) | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)

  const bundle: StorefrontBundle = useMemo(
    () => ({
      restaurant: r,
      categories: o.categories,
      items: o.items.filter((i) => i.status !== 'hidden'),
      promotions: o.promotions.filter((p) => p.active),
    }),
    [r, o.categories, o.items, o.promotions]
  )
  const categoryById = useMemo(() => new Map(o.categories.map((c) => [c.id, c])), [o.categories])
  const priced = priceOrder(bundle, lines, null, now)
  const count = lines.reduce((s, l) => s + l.quantity, 0)
  const cash = method === 'cash' && paid
  const given = Number(tendered) || 0
  const change = cash && given > priced.total ? Math.round((given - priced.total) * 100) / 100 : 0
  const short = cash && tendered !== '' && given < priced.total

  useEffect(() => setError(null), [lines.length])

  const q = query.trim().toLowerCase()
  const shown = bundle.items.filter((i) => (category === 'all' || i.categoryId === category) && (!q || i.name.toLowerCase().includes(q)))

  const tap = (item: MenuItem) => {
    if (item.optionGroups.length || item.combo) setSheetItem(item)
    else add(key, { itemId: item.id, quantity: 1, choices: {} })
  }

  const send = async () => {
    setError(null)
    if (!lines.length) return
    if (short) return setError('Cash given is less than the total')
    setSending(true)
    // Charge → receipt, for DevTools' Performance panel (target: under 200 ms).
    performance.mark('charge:start')
    try {
      const order = await actions.createCounterOrder(r.id, {
        lines: lines.map(({ itemId, quantity, choices, comboPicks, note }) => ({ itemId, quantity, choices, comboPicks, note })),
        fulfilment: { type, table: type === 'dine-in' ? table || undefined : undefined },
        customer: { name: customer || undefined, phone: phone || undefined },
        payment: { method, paid, reference: method === 'momo' ? reference : undefined, tendered: cash && given ? given : undefined },
      })
      performance.mark('charge:saved')
      clear(key)
      setDone(order)
      requestAnimationFrame(() => {
        performance.mark('charge:shown')
        performance.measure('charge', 'charge:start', 'charge:shown')
      })
      setTicketOpen(false)
      setTendered('')
      setReference('')
      setCustomer('')
      setPhone('')
      setTable('')
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t send the order.'))
    } finally {
      setSending(false)
    }
  }

  const respond = async (order: Order, status: 'accepted' | 'cancelled') => {
    setBusy(order.id)
    try {
      await actions.update('orders', order.id, { status })
    } catch {
      // toast shown
    } finally {
      setBusy(null)
    }
  }

  const ticket = (
    <div className="flex h-full flex-col">
      <div className="border-b border-stone-100 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-stone-900">New order</h2>
          {lines.length > 0 && (
            <button type="button" onClick={() => clear(key)} className="text-xs font-semibold text-stone-400 hover:text-rose-600">
              Clear
            </button>
          )}
        </div>
        <div className="mt-3">
          <Segmented
            ariaLabel="Order type"
            value={type}
            onChange={setType}
            options={[
              { value: 'dine-in', label: 'Dine-in' },
              { value: 'pickup', label: 'Take-away' },
            ]}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {type === 'dine-in' ? (
            <select
              aria-label="Table"
              value={table}
              onChange={(e) => setTable(e.target.value)}
              className="col-span-2 h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm"
            >
              <option value="">No table</option>
              {r.fulfilment.dineIn.tables.map((t) => (
                <option key={t} value={t}>
                  Table {t}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                aria-label="Customer name"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Name (optional)"
                className="h-10 rounded-xl border border-stone-200 px-3 text-sm"
              />
              <input
                aria-label="Customer phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                type="tel"
                className="h-10 rounded-xl border border-stone-200 px-3 text-sm"
              />
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">Tap items to add them.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {lines.map((l) => {
              const p = priceOrder(bundle, [l], null, now).lines[0]
              return (
                <li key={l.key} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900">{p?.name ?? 'Removed item'}</p>
                      {p?.summary && <p className="text-xs text-stone-500">{p.summary}</p>}
                      {l.note && <p className="text-xs italic text-amber-700">“{l.note}”</p>}
                    </div>
                    <p className="text-sm font-bold tabular-nums text-stone-900">{p ? formatMoney(p.lineTotal, r.currency) : '—'}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`One less ${p?.name ?? ''}`}
                      onClick={() => setQuantity(key, l.key, l.quantity - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-50"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-extrabold tabular-nums">{l.quantity}</span>
                    <button
                      type="button"
                      aria-label={`One more ${p?.name ?? ''}`}
                      onClick={() => setQuantity(key, l.key, l.quantity + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${p?.name ?? 'item'}`}
                      onClick={() => removeLine(key, l.key)}
                      className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-stone-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-stone-100 p-4">
        <dl className="text-sm">
          {priced.discount > 0 && (
            <div className="flex justify-between text-teal-700">
              <dt>Deals</dt>
              <dd className="tabular-nums">−{formatMoney(priced.discount, r.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-extrabold text-stone-900">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="pos-total">
              {formatMoney(priced.total, r.currency)}
            </dd>
          </div>
        </dl>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
          {(
            [
              ['cash', 'Cash', Banknote],
              ['momo', 'MoMo', Smartphone],
              ['card', 'Card', CreditCard],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                'flex h-12 flex-col items-center justify-center rounded-xl border text-xs font-bold',
                method === m ? 'border-endeavour bg-endeavour/[0.06] text-endeavour' : 'border-stone-200 text-stone-600'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Toggle
            checked={paid}
            onChange={setPaid}
            label={paid ? 'Paid now' : 'Pay later'}
            hint={paid ? undefined : 'e.g. a table settling at the end'}
          />
        </div>
        {cash && (
          <div className="mt-3">
            <div className="flex gap-1.5">
              <input
                aria-label="Cash given"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder="Cash given"
                className="h-10 min-w-0 flex-1 rounded-xl border border-stone-200 px-3 text-sm"
              />
              {[priced.total, 50, 100, 200]
                .filter((v, i, a) => v > 0 && (i === 0 || v > priced.total) && a.indexOf(v) === i)
                .slice(0, 3)
                .map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTendered(String(v))}
                    className="h-10 rounded-xl border border-stone-200 px-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                  >
                    {i === 0 ? 'Exact' : formatMoney(v, r.currency)}
                  </button>
                ))}
            </div>
            {change > 0 && (
              <p className="mt-1.5 text-sm font-extrabold text-teal-700" aria-live="polite">
                Change: {formatMoney(change, r.currency)}
              </p>
            )}
            {short && <p className="mt-1.5 text-sm font-bold text-rose-600">Short by {formatMoney(priced.total - given, r.currency)}</p>}
          </div>
        )}
        {method === 'momo' && paid && (
          <input
            aria-label="MoMo reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transaction ID (optional)"
            className="mt-3 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm"
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-bold text-rose-600">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={!lines.length || sending}
          onClick={() => void send()}
          className="mt-3 h-14 w-full rounded-xl bg-endeavour text-base font-extrabold text-white hover:bg-veniceBlue disabled:opacity-40"
        >
          {paid ? `Charge ${formatMoney(priced.total, r.currency)}` : 'Send to kitchen'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="-m-3 md:-m-4 flex min-h-[calc(100dvh-64px)] min-w-0 flex-col lg:flex-row">
      <div className="min-w-0 flex-1 p-3 md:p-4 pb-28 lg:pb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-2xl font-extrabold tracking-tight text-stone-900">
            Counter <span className="text-base font-semibold text-stone-400">· {r.name}</span>
          </h1>
          <RecentSales orders={o.orders} restaurant={r} now={now} locale={locale} />
          <SoundToggle sound={sound} onToggle={() => void toggle()} />
        </div>
        <Incoming
          orders={waiting}
          currency={r.currency}
          now={now}
          busy={busy}
          onAccept={(x) => void respond(x, 'accepted')}
          onDecline={(x) => void respond(x, 'cancelled')}
        />

        <div className="sticky top-0 z-10 -mx-3 md:-mx-4 bg-stone-50/95 px-3 md:px-4 py-2 backdrop-blur">
          <label className="relative block">
            <span className="sr-only">Find an item</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an item"
              type="search"
              className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base sm:text-sm"
            />
          </label>
          <div className="mt-2 flex max-w-full gap-1.5 overflow-x-auto" role="group" aria-label="Menu sections">
            {[{ id: 'all' as const, name: 'All' }, ...o.categories].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'h-10 whitespace-nowrap rounded-xl px-3.5 text-sm font-bold',
                  category === c.id ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* ThemeScope only so photo-less items get the brand's initials art, as on the menu page. */}
        <ThemeScope theme={r.theme} className="!bg-transparent ![background-image:none] !text-inherit">
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((item) => {
              const a = itemAvailability(item, categoryById.get(item.categoryId), now)
              const inTicket = lines.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.quantity, 0)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!a.orderable}
                    onClick={() => tap(item)}
                    aria-label={`${item.name}${a.orderable ? '' : ` — ${a.label}`}`}
                    className="relative flex w-full flex-col rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition active:scale-[0.98] hover:border-endeavour/50 disabled:opacity-40"
                    style={{ fontFamily: 'var(--font-mulish), system-ui, sans-serif', color: '#1c1917' }}
                  >
                    <ItemArt
                      name={item.name}
                      imageUrl={item.imageUrl}
                      theme={r.theme}
                      size="sm"
                      className="h-20 w-full rounded-t-2xl sm:h-24"
                    />
                    <span className="line-clamp-2 min-h-[2.5rem] px-3 pt-2 text-sm font-bold leading-tight text-stone-900">
                      {item.name}
                    </span>
                    <span className="flex items-center justify-between gap-1 px-3 pb-2.5 pt-1">
                      <span className="text-sm font-extrabold tabular-nums text-endeavour">{formatMoney(fromPrice(item), r.currency)}</span>
                      {!a.orderable ? (
                        <span className="text-[10px] font-bold text-rose-600">{a.reason === 'not-now' ? 'Not now' : a.label}</span>
                      ) : item.optionGroups.length || item.combo ? (
                        <span className="text-[10px] font-semibold text-stone-400">options</span>
                      ) : null}
                    </span>
                    {inTicket > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-endeavour px-1.5 text-xs font-extrabold text-white">
                        {inTicket}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </ThemeScope>
      </div>

      {/* Ticket: side panel on large screens, bottom sheet on phones and tablets in portrait. */}
      <aside className="hidden lg:block w-[380px] flex-shrink-0 border-l border-stone-200 bg-white lg:sticky lg:top-0 lg:h-[calc(100dvh-64px)]">
        {ticket}
      </aside>
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-stone-900 px-5 text-white shadow-xl"
        >
          <span className="font-bold">{count ? `${count} item${count === 1 ? '' : 's'}` : 'Ticket'}</span>
          <span className="font-extrabold tabular-nums">{formatMoney(priced.total, r.currency)}</span>
        </button>
      </div>
      {ticketOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col bg-black/40" role="dialog" aria-modal="true" aria-label="Ticket">
          <div className="mt-auto max-h-[92dvh] overflow-hidden rounded-t-3xl bg-white">
            <div className="flex justify-end p-2">
              <button
                type="button"
                aria-label="Close ticket"
                onClick={() => setTicketOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(92dvh-56px)]">{ticket}</div>
          </div>
        </div>
      )}

      <ItemSheet
        bundle={bundle}
        item={sheetItem}
        now={now}
        onClose={() => setSheetItem(null)}
        onAdd={(line) => {
          add(key, line)
          setSheetItem(null)
        }}
      />

      {done && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sent-title"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
            <p id="sent-title" className="mt-2 text-lg font-extrabold text-stone-900">
              Order #{done.code} sent to the kitchen
            </p>
            <p className="text-sm text-stone-500">
              {done.fulfilment.type === 'dine-in' ? (done.fulfilment.table ? `Table ${done.fulfilment.table}` : 'Dine-in') : 'Take-away'} ·{' '}
              {formatMoney(done.total, r.currency)} · {done.payment.status === 'paid' ? 'paid' : 'to pay'}
            </p>
            {done.tendered && done.tendered > done.total && (
              <p className="mt-3 rounded-xl bg-teal-50 py-2 text-xl font-extrabold text-teal-800">
                Change {formatMoney(Math.round((done.tendered - done.total) * 100) / 100, r.currency)}
              </p>
            )}
            {done.id < 0 ? (
              <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Saved on this till and on its way to the server — other screens get it in a moment, or as soon as the connection
                is back. Find it later by its receipt number.
              </p>
            ) : (
              <p className="mt-3 text-xs text-stone-500">
                The receipt has a QR code — the customer can scan it to follow the order and get a ping when it’s ready.
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => void printReceipt(done, r, trackingUrl(window.location.origin, locale, r.slug, done))}
              >
                Receipt
              </Button>
              <Button onClick={() => setDone(null)}>New order</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PosPage() {
  return <EateryFrame>{(o) => <PosScreen o={o} />}</EateryFrame>
}
