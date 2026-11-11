// Printable receipts for thermal roll printers (80 mm and 58 mm) and normal
// printers, shared by the store POS, orders and the eatery.
//
// Why receipts used to come out cut off: the page was ~90 mm wide and never
// told the printer its paper size, so the browser laid it out for A4 and the
// printer cropped it. Here the page is exactly the roll's width with no
// margins, the content sits inside the printable area, and the page is as long
// as the receipt.
//
// Thermal heads print black or nothing: no greys or backgrounds (they come
// out speckled), bold weights for emphasis, dashed rules for sections.

export type PaperWidth = '80' | '58' | 'a4'

export const PAPER_OPTIONS: { value: PaperWidth; label: string; hint: string }[] = [
  { value: '80', label: '80 mm roll', hint: 'Most receipt printers' },
  { value: '58', label: '58 mm roll', hint: 'Small and mobile printers' },
  { value: 'a4', label: 'A4 / Letter', hint: 'An ordinary office printer' },
]

// Page width and printable width, in mm. Thermal heads can't print the last
// few mm at each edge, so content stays inside them.
const PAPER: Record<PaperWidth, { page: number; content: number }> = {
  '80': { page: 80, content: 72 },
  '58': { page: 58, content: 48 },
  a4: { page: 210, content: 80 },
}

// ── This device's printer ────────────────────────────────────────────────────
// The printer belongs to the till, not the business, so it's kept per device.

const KEY = 'sellix:printer'

export const readPaperWidth = (): PaperWidth => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')?.paper
    return v === '58' || v === 'a4' ? v : '80'
  } catch {
    return '80'
  }
}

export const writePaperWidth = (paper: PaperWidth) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ paper }))
  } catch {
    // Not remembered: 80 mm next time.
  }
}

// ── Building blocks ──────────────────────────────────────────────────────────

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export interface ReceiptItem {
  name: string
  // Options, notes, unit: printed small under the name.
  details?: string[]
  quantity: number
  // "₵48.00 / Tin" — omitted for a single item at its plain price.
  unitPrice?: string
  total: string
}

export interface ReceiptData {
  // Window/tab title, e.g. "Receipt S-1042".
  title: string
  business: { name: string; lines?: string[]; logoUrl?: string }
  // Under the business: "RECEIPT", "INVOICE · PAYMENT DUE".
  heading?: string
  // A big order number the customer calls out (eatery), e.g. "#K7Q2".
  code?: string
  // Receipt no, date, cashier, table…
  meta?: [string, string][]
  items: ReceiptItem[]
  // Subtotal, discounts…, then the total (the last `strong` row).
  totals: { label: string; value: string; strong?: boolean }[]
  // Paid by…, cash given, change.
  payment?: [string, string][]
  // A boxed message, e.g. "Pay with MTN MoMo 024 123 4567".
  box?: string[]
  qr?: { svg: string; caption: string }
  footer?: string
}

const row = (left: string, right: string, cls = '') => `<div class="row ${cls}"><span>${left}</span><span class="v">${right}</span></div>`

const itemHtml = (i: ReceiptItem) => {
  const single = i.quantity === 1 && !i.unitPrice
  const details = (i.details ?? []).filter(Boolean)
  return `<div class="item">
    ${single ? row(`<b>${esc(i.name)}</b>`, esc(i.total)) : `<div class="name"><b>${esc(i.name)}</b></div>`}
    ${details.length ? `<div class="sub">${details.map(esc).join('<br>')}</div>` : ''}
    ${single ? '' : row(`<span class="qty">${i.quantity} × ${esc(i.unitPrice ?? '')}</span>`, esc(i.total))}
  </div>`
}

export const receiptBody = (r: ReceiptData) => `
  <header>
    ${r.business.logoUrl ? `<img class="logo" src="${esc(r.business.logoUrl)}" alt="">` : ''}
    <div class="biz">${esc(r.business.name || 'Receipt')}</div>
    ${(r.business.lines ?? [])
      .filter(Boolean)
      .map((l) => `<div class="small">${esc(l)}</div>`)
      .join('')}
  </header>
  ${r.heading ? `<div class="heading">${esc(r.heading)}</div>` : '<hr>'}
  ${r.code ? `<div class="code">${esc(r.code)}</div>` : ''}
  ${r.meta?.length ? `<div class="meta">${r.meta.map(([k, v]) => row(esc(k), esc(v))).join('')}</div><hr>` : ''}
  <div class="items">${r.items.map(itemHtml).join('')}</div>
  <hr>
  <div class="totals">${r.totals.map((t) => row(esc(t.label), esc(t.value), t.strong ? 'total' : '')).join('')}</div>
  ${r.payment?.length ? `<hr class="thin"><div class="pay">${r.payment.map(([k, v]) => row(esc(k), esc(v))).join('')}</div>` : ''}
  ${r.box?.length ? `<div class="box">${r.box.map((l, i) => (i === 1 ? `<b>${esc(l)}</b>` : esc(l))).join('<br>')}</div>` : ''}
  ${r.qr ? `<div class="qr">${r.qr.svg}</div><div class="small c">${esc(r.qr.caption)}</div>` : ''}
  ${r.footer ? `<hr><div class="footer">${esc(r.footer)}</div>` : ''}
  <div class="powered">Powered by Sellix</div>`

// A whole printable page around `body` (a receipt, a day report…).
export const printPage = (title: string, body: string, paper: PaperWidth = '80') => {
  const p = PAPER[paper]
  const small = paper === '58'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: ${paper === 'a4' ? 'A4' : `${p.page}mm 300mm`}; margin: 0 }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  html, body { margin: 0; padding: 0; background: #fff; color: #000 }
  body { width: ${paper === 'a4' ? 'auto' : `${p.page}mm`}; font: ${small ? 11 : 12}px/1.35 Arial, Helvetica, sans-serif; font-variant-numeric: tabular-nums }
  .receipt { width: ${p.content}mm; margin: 0 auto; padding: 4mm 0 ${paper === 'a4' ? 4 : 12}mm }
  header { text-align: center }
  .logo { display: block; max-width: ${small ? 30 : 40}mm; max-height: 18mm; margin: 0 auto 2mm; filter: grayscale(1) contrast(1.3) }
  .biz { font-size: ${small ? 15 : 18}px; font-weight: 800; line-height: 1.15; margin-bottom: 1mm; word-wrap: break-word }
  .small { font-size: ${small ? 10 : 11}px }
  .c { text-align: center }
  hr { border: 0; border-top: 1px dashed #000; margin: 2.5mm 0 }
  hr.thin { border-top-style: dotted; margin: 1.5mm 0 }
  .heading { margin: 2.5mm 0; padding: 1mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; text-align: center; font-weight: 800; letter-spacing: .12em; font-size: ${small ? 11 : 12}px }
  .code { text-align: center; font-size: ${small ? 26 : 32}px; font-weight: 900; letter-spacing: .08em; margin: 1mm 0 2mm }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm }
  .row > span:first-child { min-width: 0; overflow-wrap: anywhere }
  .row .v { white-space: nowrap; text-align: right }
  .meta .row { font-size: ${small ? 10 : 11}px }
  .item { padding: 1mm 0; break-inside: avoid }
  .item .name { overflow-wrap: anywhere }
  .item .sub { font-size: ${small ? 10 : 11}px; padding-left: 2mm }
  .item .qty { display: block; padding-left: 2mm }
  .totals .row { padding: .5mm 0 }
  .totals .total { font-size: ${small ? 15 : 18}px; font-weight: 900; border-top: 1px solid #000; margin-top: 1mm; padding-top: 1.5mm }
  .totals .total:first-child { border-top: 0; margin-top: 0; padding-top: 0 }
  .box { border: 1.5px solid #000; border-radius: 2mm; padding: 2mm; margin: 3mm 0; text-align: center; font-size: ${small ? 11 : 12}px }
  .qr { width: ${small ? 28 : 34}mm; margin: 3mm auto 1mm }
  .qr svg { display: block; width: 100%; height: auto }
  .footer { text-align: center; font-size: ${small ? 11 : 12}px; white-space: pre-line }
  .powered { text-align: center; font-size: 9px; margin-top: 3mm }
  h2 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin: 3mm 0 1mm }
</style></head><body><div class="receipt">${body}</div></body></html>`
}

export const receiptPage = (r: ReceiptData, paper: PaperWidth = readPaperWidth()) => printPage(r.title, receiptBody(r), paper)

// ── Printing ─────────────────────────────────────────────────────────────────

const waitForImages = (doc: Document, ms = 3000) =>
  Promise.race([
    Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((done) => ((img.onload = () => done()), (img.onerror = () => done())))
      )
    ),
    new Promise((done) => setTimeout(done, ms)),
  ])

// Prints a page from a hidden frame: no pop-up window (nothing for a blocker
// to stop), and only once images have loaded. On a roll printer the page is
// cut to the receipt's length so no blank paper feeds out.
export const printHtml = async (html: string, paper: PaperWidth = readPaperWidth()): Promise<boolean> => {
  if (typeof document === 'undefined') return false
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(frame)
  const win = frame.contentWindow
  const doc = frame.contentDocument
  if (!win || !doc) {
    frame.remove()
    return false
  }
  doc.open()
  doc.write(html)
  doc.close()
  await waitForImages(doc)
  await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready
  if (paper !== 'a4') {
    // As long as the receipt (plus a little), so the roll stops where it ends.
    const mm = Math.ceil(((doc.body.scrollHeight || 0) * 25.4) / 96) + 6
    const style = doc.createElement('style')
    style.textContent = `@page { size: ${PAPER[paper].page}mm ${Math.max(mm, 60)}mm; margin: 0 }`
    doc.head.appendChild(style)
  }
  const cleanup = () => setTimeout(() => frame.remove(), 500)
  win.addEventListener('afterprint', cleanup, { once: true })
  win.focus()
  win.print()
  // Browsers that don't fire afterprint: remove it later anyway.
  setTimeout(() => frame.isConnected && frame.remove(), 60_000)
  return true
}
