'use client'

// Eatery receipts and the end-of-day report, on the shared thermal-printer
// layout (src/lib/print/receipt.ts).

import QRCode from 'qrcode'
import { formatMoney } from '@/lib/eatery/menu'
import { dayFromKey, dayKey, topItems, totalsOf } from '@/lib/eatery/sales'
import type { Order, Restaurant } from '@/lib/eatery/types'
import { esc, printHtml, printPage, readPaperWidth, receiptPage, type PaperWidth, type ReceiptData } from '@/lib/print/receipt'

// The customer's own tracking link: scanning it on their phone shows the
// order and alerts them when it's ready.
export const trackingUrl = (origin: string, locale: string, slug: string, order: { code: string; accessKey?: string }) =>
  `${origin}/${locale}/eat/${slug}/order/${order.code}${order.accessKey ? `?k=${encodeURIComponent(order.accessKey)}` : ''}`

const business = (r: Restaurant) => ({
  name: r.name,
  logoUrl: r.theme?.imagery?.logoUrl,
  lines: [[r.address, r.city].filter(Boolean).join(', '), r.phone ?? ''],
})

const method = (m: Order['payment']['method']) => (m === 'momo' ? 'MoMo' : m === 'card' ? 'Card' : m === 'cash' ? 'Cash' : 'At the table')

export const receiptData = (order: Order, restaurant: Restaurant, qrSvg = ''): ReceiptData => {
  const m = (n: number) => formatMoney(n, restaurant.currency)
  const f = order.fulfilment
  const how = f.type === 'dine-in' ? `Dine-in${f.table ? ` · Table ${f.table}` : ''}` : f.type === 'delivery' ? 'Delivery' : 'Take-away'
  const paid = order.payment.status === 'paid'
  const change = order.tendered && order.tendered > order.total ? order.tendered - order.total : 0
  return {
    title: `Receipt ${order.code}`,
    business: business(restaurant),
    heading: how.toUpperCase(),
    code: `#${order.code}`,
    meta: [
      [
        'Date',
        new Date(order.createdAt).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      ],
      ...(order.customer.name && order.customer.name !== 'Guest' ? [['Customer', order.customer.name] as [string, string]] : []),
      ...(f.type === 'delivery' && f.address ? [['Deliver to', f.address] as [string, string]] : []),
    ],
    items: order.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      details: [l.summary, l.note ? `“${l.note}”` : ''].filter(Boolean),
      ...(l.quantity > 1 ? { unitPrice: m(l.unitPrice) } : {}),
      total: m(l.lineTotal),
    })),
    totals: [
      ...(order.discount > 0 || order.deliveryFee > 0 ? [{ label: 'Subtotal', value: m(order.subtotal) }] : []),
      ...(order.discount > 0 ? [{ label: 'Deals', value: `−${m(order.discount)}` }] : []),
      ...(order.deliveryFee > 0 ? [{ label: 'Delivery', value: m(order.deliveryFee) }] : []),
      { label: paid ? 'TOTAL' : 'AMOUNT DUE', value: m(order.total), strong: true },
    ],
    payment: [
      [paid ? 'Paid by' : 'Status', paid ? method(order.payment.method) : 'Not paid yet'],
      ...(order.payment.reference ? [['Reference', order.payment.reference] as [string, string]] : []),
      ...(change
        ? ([
            ['Cash given', m(order.tendered!)],
            ['Change', m(change)],
          ] as [string, string][])
        : []),
    ],
    qr: qrSvg ? { svg: qrSvg, caption: 'Scan to follow your order — we’ll tell you when it’s ready' } : undefined,
    footer: order.notes ? `Note: ${order.notes}\nThank you!` : 'Thank you!',
  }
}

// A made-up order for the settings preview and test print.
export const sampleOrder = (r: Restaurant): Order =>
  ({
    id: 0,
    code: 'K7Q2',
    restaurantId: r.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customer: { name: 'Ama', phone: '' },
    fulfilment: { type: 'dine-in', table: '4' },
    payment: { method: 'cash', status: 'paid' },
    lines: [
      {
        itemId: 1,
        quantity: 2,
        choices: {},
        name: 'Jollof rice',
        summary: 'Large · Chicken',
        unitPrice: 65,
        discountPerUnit: 0,
        lineTotal: 130,
      },
      {
        itemId: 2,
        quantity: 1,
        choices: {},
        name: 'Sobolo',
        summary: '',
        unitPrice: 15,
        discountPerUnit: 0,
        lineTotal: 15,
        note: 'No ice',
      },
    ],
    subtotal: 145,
    discount: 0,
    deliveryFee: 0,
    total: 145,
    tendered: 200,
    status: 'completed',
    history: [],
    channel: 'counter',
  }) as Order

export const receiptPreviewHtml = (r: Restaurant, paper: PaperWidth) => receiptPage(receiptData(sampleOrder(r), r), paper)

// Prints on this device's receipt printer (80 mm, 58 mm or A4).
export const printReceipt = async (order: Order, restaurant: Restaurant, trackUrl?: string) => {
  const qr = trackUrl ? await QRCode.toString(trackUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).catch(() => '') : ''
  return printHtml(receiptPage(receiptData(order, restaurant, qr)))
}

// End-of-day (Z) report for one day: totals, how it was paid, where it came
// from, cancellations and what still needs collecting.
export const printDayReport = (day: string, orders: Order[], restaurant: Restaurant) => {
  const list = orders.filter((o) => dayKey(o.createdAt) === day)
  const t = totalsOf(list)
  const m = (n: number) => esc(formatMoney(n, restaurant.currency))
  const row = (label: string, value: string, strong = false) =>
    `<div class="row${strong ? ' total' : ''}"><span>${esc(label)}</span><span class="v">${value}</span></div>`
  const date = dayFromKey(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const top = topItems(list, 8)
    .map((i) => row(`${i.qty}× ${i.name}`, m(i.sales)))
    .join('')
  const unpaid = list.filter((o) => o.status !== 'cancelled' && o.payment.status !== 'paid')
  const b = business(restaurant)
  const body = `
    <header>
      ${b.logoUrl ? `<img class="logo" src="${esc(b.logoUrl)}" alt="">` : ''}
      <div class="biz">${esc(b.name)}</div>
    </header>
    <div class="heading">DAY REPORT</div>
    <div class="c small">${esc(date)}</div><hr>
    ${row('Orders', String(t.orders))}${row('Items sold', String(t.items))}${row('Cancelled', String(t.cancelled))}${row('Average order', m(t.average))}
    <hr>
    ${row('Gross sales', m(t.gross))}${row('Deals', `−${m(t.discounts)}`)}${row('Delivery fees', m(t.delivery))}
    <div class="totals">${row('NET SALES', m(t.net), true)}</div>
    <h2>Payments</h2>${row('Cash', m(t.byMethod.cash))}${row('MoMo', m(t.byMethod.momo))}${row('Card', m(t.byMethod.card))}${row('At table', m(t.byMethod['pay-at-table']))}${row(`Not paid yet (${t.unpaidCount})`, m(t.unpaid))}
    <h2>Where from</h2>${row('Counter', m(t.byChannel.counter))}${row('Online', m(t.byChannel.online))}${row('Dine-in', m(t.byFulfilment['dine-in']))}${row('Take-away', m(t.byFulfilment.pickup))}${row('Delivery', m(t.byFulfilment.delivery))}
    ${top ? `<h2>Best sellers</h2>${top}` : ''}
    ${unpaid.length ? `<h2>To collect</h2>${unpaid.map((o) => row(`#${o.code} ${o.customer.name}`, m(o.total))).join('')}` : ''}
    <hr>${row('Counted cash', '____________')}${row('Difference', '____________')}${row('Signed', '____________')}
    <div class="c small" style="margin-top:3mm">Printed ${esc(new Date().toLocaleString('en-GB'))}</div>
    <div class="powered">Powered by Sellix</div>`
  const paper = readPaperWidth()
  return printHtml(printPage(`Day report ${day}`, body, paper), paper)
}
