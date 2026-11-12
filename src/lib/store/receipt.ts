// Store receipts (counter sales) and invoices, on the shared thermal-printer
// layout (src/lib/print/receipt.ts). Uses the business details from Store settings.

import { printHtml, receiptPage, type PaperWidth, type ReceiptData } from '@/lib/print/receipt'
import type { Order } from './orders'
import { formatPhone, MOMO_NETWORKS, type StoreSettings } from './settings'

const cedi = (n: number) => `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const method = (t: string) => (t === 'momo' ? 'MoMo' : t === 'cash' ? 'Cash' : t || '—')

const when = (iso: string, withTime: boolean) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export const receiptData = (order: Order, s: StoreSettings, now = new Date()): ReceiptData => {
  const b = s.business
  const isInvoice = order.kind === 'invoice'
  const due = order.status === 'pending'
  const network = MOMO_NETWORKS.find((n) => n.value === s.payments.momoNetwork)?.label ?? 'MoMo'
  const count = order.lines.reduce((n, l) => n + l.quantity, 0)
  const showMomo = s.payments.momo && !!s.payments.momoNumber && (due || order.paymentType === 'momo')
  return {
    title: `${isInvoice ? 'Invoice' : 'Receipt'} ${order.ref}`,
    business: {
      name: b.name,
      logoUrl: b.logoUrl || undefined,
      lines: [b.address, [b.phone && formatPhone(b.phone), b.email].filter(Boolean).join(' · '), b.taxId],
    },
    heading: isInvoice ? (due ? 'INVOICE · PAYMENT DUE' : 'INVOICE · PAID') : 'RECEIPT',
    meta: [
      [isInvoice ? 'Invoice no.' : 'Receipt no.', order.ref],
      ['Date', when(order.date || now.toISOString(), !isInvoice)],
      ...(isInvoice && order.customerName ? [['Customer', order.customerName] as [string, string]] : []),
      ...(isInvoice && order.customerPhone ? [['Phone', formatPhone(order.customerPhone)] as [string, string]] : []),
      ...(!isInvoice && s.receipt.showCashier && order.cashier ? [['Served by', order.cashier] as [string, string]] : []),
      ...(order.receiptNo && order.receiptNo !== order.ref ? [['Till no.', order.receiptNo] as [string, string]] : []),
      ...(order.offline ? [['Note', 'Made offline · syncs later'] as [string, string]] : []),
    ],
    items: order.lines.map((l) => ({
      name: l.productName,
      quantity: l.quantity,
      // Always "qty × price / unit", so the amounts line up down the receipt.
      unitPrice: `${cedi(l.unitPrice)}${l.unitName ? ` / ${l.unitName}` : ''}`,
      total: cedi(l.subtotal),
    })),
    totals: [
      { label: `${count} item${count === 1 ? '' : 's'}`, value: '' },
      { label: due ? 'AMOUNT DUE' : 'TOTAL', value: cedi(order.total), strong: true },
    ],
    payment: due
      ? [['Status', 'Not paid yet']]
      : [
          ['Paid by', method(order.paymentType)],
          ...(isInvoice && order.paidAt ? [['Paid on', when(order.paidAt, false)] as [string, string]] : []),
        ],
    box: showMomo
      ? [
          `${due ? 'Pay with' : 'Paid by'} ${network}`,
          formatPhone(s.payments.momoNumber),
          ...(s.payments.momoName ? [s.payments.momoName] : []),
          ...(s.payments.momoMerchantId ? [`Merchant ID ${s.payments.momoMerchantId}`] : []),
        ]
      : undefined,
    footer: s.receipt.footer,
  }
}

export const receiptHtml = (order: Order, s: StoreSettings, paper?: PaperWidth) => receiptPage(receiptData(order, s), paper)

// Prints on this device's receipt printer (80 mm, 58 mm or A4).
export const printOrder = (order: Order, s: StoreSettings) => printHtml(receiptHtml(order, s))
