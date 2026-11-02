// Printable receipt (counter sale) or invoice, sized for 58–80 mm receipt
// printers and fine on A4. Uses the business details from Store settings.

import type { Order } from './orders'
import { formatPhone, MOMO_NETWORKS, type StoreSettings } from './settings'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const cedi = (n: number) => `GH₵ ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const receiptHtml = (order: Order, s: StoreSettings, now = new Date()) => {
  const b = s.business
  const isInvoice = order.kind === 'invoice'
  const title = isInvoice ? (order.status === 'paid' ? 'Invoice · Paid' : 'Invoice · Payment due') : 'Receipt'
  const network = MOMO_NETWORKS.find((n) => n.value === s.payments.momoNetwork)?.label ?? 'MoMo'
  const when = new Date(order.date || now)
  const rows = order.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.productName)}<div class="m">${l.quantity} × ${esc(l.unitName)} @ ${cedi(l.unitPrice)}</div></td><td class="r">${cedi(l.subtotal)}</td></tr>`
    )
    .join('')
  const momoBlock =
    s.payments.momo && s.payments.momoNumber && (order.status === 'pending' || order.paymentType === 'momo')
      ? `<div class="box">${order.status === 'pending' ? 'Pay with' : 'Paid by'} ${esc(network)}<br><b>${esc(formatPhone(s.payments.momoNumber))}</b>${s.payments.momoName ? ` · ${esc(s.payments.momoName)}` : ''}${s.payments.momoMerchantId ? `<br>Merchant ID ${esc(s.payments.momoMerchantId)}` : ''}</div>`
      : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(order.ref)}</title><style>
    *{box-sizing:border-box}body{font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:12px;max-width:340px}
    h1{font-size:17px;margin:0;text-align:center}.c{text-align:center}.m{color:#555;font-size:11px}
    table{width:100%;border-collapse:collapse;margin:8px 0}td{padding:5px 0;vertical-align:top;border-bottom:1px dashed #ccc}.r{text-align:right;white-space:nowrap;padding-left:8px}
    .tot td{border:0;font-size:16px;font-weight:800;padding-top:8px}.hr{border-top:1px dashed #999;margin:8px 0}
    .box{border:1px solid #111;border-radius:6px;padding:6px 8px;margin:8px 0;text-align:center}.due{font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    @media print{body{padding:0}@page{margin:4mm}}
  </style></head><body>
    <h1>${esc(b.name || 'Receipt')}</h1>
    ${b.address ? `<div class="c m">${esc(b.address)}</div>` : ''}
    ${b.phone || b.email ? `<div class="c m">${esc([b.phone && formatPhone(b.phone), b.email].filter(Boolean).join(' · '))}</div>` : ''}
    ${b.taxId ? `<div class="c m">${esc(b.taxId)}</div>` : ''}
    <div class="hr"></div>
    <div><b>${esc(title)}</b> · ${esc(order.ref)}</div>
    <div class="m">${esc(when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: isInvoice ? undefined : 'short' }))}</div>
    ${isInvoice ? `<div>Customer: <b>${esc(order.customerName)}</b>${order.customerPhone ? ` · ${esc(formatPhone(order.customerPhone))}` : ''}</div>` : ''}
    ${!isInvoice && s.receipt.showCashier && order.cashier ? `<div class="m">Served by ${esc(order.cashier)}</div>` : ''}
    <table>${rows}<tr class="tot"><td>Total</td><td class="r">${cedi(order.total)}</td></tr></table>
    <div>${order.status === 'pending' ? `<span class="due">Amount due: ${cedi(order.total)}</span>` : `Paid · ${esc(order.paymentType === 'momo' ? 'MoMo' : 'Cash')}`}</div>
    ${momoBlock}
    ${s.receipt.footer ? `<div class="hr"></div><div class="c">${esc(s.receipt.footer)}</div>` : ''}
    <script>window.onload=()=>{window.print()}</script></body></html>`
}

// Opens the receipt in a small window and starts printing. Returns false if
// the browser blocked the window.
export const printOrder = (order: Order, s: StoreSettings) => {
  const w = window.open('', '_blank', 'width=420,height=720')
  if (!w) return false
  w.document.write(receiptHtml(order, s))
  w.document.close()
  return true
}
