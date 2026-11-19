// Printed tickets: one stub per ticket, cut line between them, on the
// device's receipt printer (lib/print/receipt.ts). Big "ADMIT 4", the ride,
// and a QR the gate scans. Black on white — thermal printers have no colour.

import QRCode from 'qrcode'
import { esc, printHtml, printPage, readPaperWidth, type PaperWidth } from '@/lib/print/receipt'
import { money, type Attraction, type Ticket } from './park'
import { ticketCode } from './ticket-code'

export type PrintableTicket = { ticket: Ticket; attraction?: Attraction; price: number; offline?: boolean }

const when = (iso?: string) =>
  (iso ? new Date(iso) : new Date()).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const stub = async (p: PrintableTicket, parkName: string, note: string) => {
  const code = p.offline ? '' : ticketCode(p.ticket)
  const qr = code ? await QRCode.toString(code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).catch(() => '') : ''
  const ride = p.attraction?.name ?? 'General admission'
  return `<section class="tk">
    ${parkName ? `<div class="park">${esc(parkName)}</div>` : ''}
    <div class="admit">ADMIT ${p.ticket.quantity}</div>
    <div class="ride">${esc(ride)}</div>
    <div class="small c">${p.ticket.quantity} × ${esc(money(p.price))} = <b>${esc(money(p.price * p.ticket.quantity))}</b></div>
    ${qr ? `<div class="qr">${qr}</div><div class="tcode">${esc(code)}</div>` : ''}
    ${
      p.offline
        ? `<div class="box"><b>Sold offline</b><br>Show this ticket at the gate — staff will let you in.</div>`
        : ''
    }
    <div class="meta">
      <div class="row"><span>Sold</span><span class="v">${esc(when(p.ticket.createdAt))}</span></div>
      ${p.ticket.buyerName ? `<div class="row"><span>For</span><span class="v">${esc(p.ticket.buyerName)}</span></div>` : ''}
    </div>
    ${note ? `<div class="footer">${esc(note)}</div>` : ''}
    <div class="powered">Powered by Sellix</div>
  </section>`
}

const STYLE = `<style>
  .tk { text-align: center; padding: 1mm 0 }
  .park { font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 2mm }
  .admit { display: inline-block; border: 2px solid #000; border-radius: 3mm; padding: 1.5mm 4mm; font-size: 24px; font-weight: 900; letter-spacing: .08em; margin: 1mm 0 2mm }
  .ride { font-size: 17px; font-weight: 900; line-height: 1.15; margin-bottom: 1mm; overflow-wrap: anywhere }
  .tcode { font: 700 16px/1 "Courier New", monospace; letter-spacing: .12em; margin: 1mm 0 2mm }
  .tk .meta { text-align: left; margin-top: 2mm }
  .cut { text-align: center; font-size: 10px; letter-spacing: .3em; margin: 4mm 0; border-top: 1px dashed #000; padding-top: 1mm }
</style>`

export const ticketsHtml = async (tickets: PrintableTicket[], parkName: string, note: string, paper: PaperWidth = readPaperWidth()) => {
  const stubs = await Promise.all(tickets.map((t) => stub(t, parkName, note)))
  return printPage(`Tickets ${tickets.map((t) => (t.offline ? 'offline' : `T${t.ticket.id}`)).join(', ')}`, STYLE + stubs.join('<div class="cut">✂ CUT HERE</div>'), paper)
}

export const printTickets = async (tickets: PrintableTicket[], parkName: string, note: string) =>
  printHtml(await ticketsHtml(tickets, parkName, note))
