'use client'

// The ticket counter: tap a ride (or general admission) to add a guest, sell,
// and the tickets print with a QR the gate scans. Built for a queue: big
// targets, one tap per guest, nothing to type unless you want a name on it.

import React, { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Minus, Plus, Printer, Settings2, Ticket, Trash2, Users, Wrench } from 'lucide-react'
import { Button, Card, EmptyState, LoadingGrid, PageHeader } from '@/components/kit/ui'
import { Drawer, Field, Input, Textarea } from '@/components/kit/form'
import { PrinterChoice, ReceiptPreview, usePaperWidth } from '@/components/print/receipt-setup'
import { useAxios } from '@/hooks/use-axios'
import { apiErrorMessage } from '@/lib/api-error'
import { offlineKind } from '@/lib/offline/adapter'
import { cn } from '@/lib/utils'
import { money, type Attraction, type Ticket as TicketRow } from '@/lib/amusement/park'
import { useParkSettings, type ParkSettings } from '@/lib/amusement/settings'
import { ticketCode } from '@/lib/amusement/ticket-code'
import { printTickets, ticketsHtml, type PrintableTicket } from '@/lib/amusement/ticket-print'
import { TicketServices } from '../tickets/_logics/services'
import { attractionGradient, attractionTypeIcon, attractionTypeLabel } from '../attractions/_logics/attraction-types'
import { STATUS, useAttractions } from '../_components/park'

// null = general admission (a ticket without an attraction).
type Line = { attractionId: number | null; quantity: number }

const GENERAL = { id: null, name: 'General admission', type: 'other' } as const

const PRINT_KEY = 'sellix-amusement:print-tickets'

const SettingsDrawer = ({ open, onClose, settings, save }: { open: boolean; onClose: () => void; settings: ParkSettings; save: (s: ParkSettings) => void }) => {
  const [draft, setDraft] = useState(settings)
  const [paper, setPaper] = usePaperWidth()
  const [preview, setPreview] = useState('')
  React.useEffect(() => {
    if (!open) return
    setDraft(settings)
  }, [open, settings])
  React.useEffect(() => {
    if (!open) return
    const sample: PrintableTicket = {
      ticket: { id: 1042, attractionId: null, quantity: 2, status: 'valid', createdAt: new Date().toISOString(), buyerName: 'Ama' },
      attraction: { id: 0, name: 'Go-Kart Arena', type: 'go-karting', capacity: 0, ticketPrice: 50, status: 'active' },
      price: 50,
    }
    void ticketsHtml([sample], draft.parkName, draft.ticketNote, paper).then(setPreview)
  }, [open, draft.parkName, draft.ticketNote, paper])
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Counter settings"
      description="Saved on this device for your business."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              save(draft)
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Park name" hint="At the top of every ticket and the dashboard.">
            <Input value={draft.parkName} onChange={(e) => setDraft({ ...draft, parkName: e.target.value })} placeholder="e.g. Bambo Adventure Park" />
          </Field>
          <Field label="General admission price" hint="For park-entry tickets that aren’t for one ride.">
            <Input
              prefix="₵"
              inputMode="decimal"
              value={String(draft.admissionPrice)}
              onChange={(e) => setDraft({ ...draft, admissionPrice: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })}
            />
          </Field>
          <Field label="Message on the ticket">
            <Textarea value={draft.ticketNote} onChange={(e) => setDraft({ ...draft, ticketNote: e.target.value })} />
          </Field>
          <Field label="Receipt printer" hint="This device’s printer.">
            <PrinterChoice paper={paper} onChange={setPaper} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-stone-700">Ticket preview</p>
          {preview && <ReceiptPreview html={preview} paper={paper} />}
        </div>
      </div>
    </Drawer>
  )
}

export default function TicketCounter() {
  const request = useAxios()
  const qc = useQueryClient()
  const { attractions, isLoading } = useAttractions()
  const { settings, save } = useParkSettings()
  const [lines, setLines] = useState<Line[]>([])
  const [buyer, setBuyer] = useState('')
  const [selling, setSelling] = useState(false)
  const [error, setError] = useState('')
  const [sold, setSold] = useState<PrintableTicket[] | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Per device; read after mounting so the first render matches the server's.
  const [autoPrint, setAutoPrint] = useState(true)
  React.useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(PRINT_KEY) !== '0')
    } catch {
      // keep printing on
    }
  }, [])

  const byId = useMemo(() => new Map(attractions.map((a) => [a.id, a])), [attractions])
  const price = (id: number | null) => (id === null ? settings.admissionPrice : (byId.get(id)?.ticketPrice ?? 0))
  const total = lines.reduce((n, l) => n + l.quantity * price(l.attractionId), 0)
  const guests = lines.reduce((n, l) => n + l.quantity, 0)
  // Open rides first, then the rest (shown, but can't be sold).
  const ordered = [...attractions].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.name.localeCompare(b.name))

  const add = (attractionId: number | null, by = 1) =>
    setLines((ls) => {
      const at = ls.findIndex((l) => l.attractionId === attractionId)
      if (at < 0) return by > 0 ? [...ls, { attractionId, quantity: by }] : ls
      const next = [...ls]
      next[at] = { ...next[at], quantity: next[at].quantity + by }
      return next.filter((l) => l.quantity > 0)
    })

  const sell = async () => {
    if (!lines.length || selling) return
    setSelling(true)
    setError('')
    const done: PrintableTicket[] = []
    const left = [...lines]
    try {
      // One ticket per line: "ADMIT 3 · Go-Karts". The API takes one attraction per ticket.
      while (left.length) {
        const line = left[0]
        const res = await request(TicketServices.Create({ attractionId: line.attractionId, buyerName: buyer.trim() || undefined, quantity: line.quantity }))
        const ticket = (res?.data?.data ?? res?.data) as TicketRow
        done.push({
          ticket: { ...ticket, quantity: ticket.quantity ?? line.quantity, attractionId: ticket.attractionId ?? line.attractionId, createdAt: ticket.createdAt },
          attraction: line.attractionId != null ? byId.get(line.attractionId) : undefined,
          price: price(line.attractionId),
          offline: offlineKind(res) === 'queued',
        })
        left.shift()
      }
    } catch (err) {
      setError(
        done.length
          ? `${done.length} ticket${done.length === 1 ? ' was' : 's were'} sold; the rest weren’t: ${apiErrorMessage(err, 'try again')}`
          : apiErrorMessage(err, 'The tickets couldn’t be sold. Try again.')
      )
    } finally {
      setSelling(false)
      // What's left (if anything failed) stays in the basket.
      setLines(left)
      void qc.invalidateQueries({ queryKey: ['tickets'] })
    }
    if (done.length) {
      setSold(done)
      if (!left.length) setBuyer('')
      if (autoPrint) void printTickets(done, settings.parkName, settings.ticketNote)
    }
  }

  const Tile = ({ a }: { a: Attraction | typeof GENERAL }) => {
    const Icon = attractionTypeIcon(a.type)
    const id = a.id
    const status = 'status' in a ? a.status : 'active'
    const disabled = status !== 'active'
    const inCart = lines.find((l) => l.attractionId === id)?.quantity ?? 0
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => add(id)}
        aria-label={`${a.name}, ${money(price(id))}${disabled ? `, ${STATUS[status].label}` : ''}`}
        className={cn(
          'group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl p-4 text-left text-white shadow-sm transition active:scale-[0.97]',
          disabled ? 'cursor-not-allowed opacity-45 grayscale' : 'hover:-translate-y-0.5 hover:shadow-lg'
        )}
        style={{ backgroundImage: attractionGradient(a.type) }}
      >
        <Icon className="absolute -bottom-3 -right-3 h-20 w-20 text-white/15 transition group-hover:rotate-6" strokeWidth={1.5} aria-hidden />
        <span className="flex items-start justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
            <Icon className="h-5 w-5" />
          </span>
          {inCart > 0 && (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-sm font-black text-stone-900 shadow">{inCart}</span>
          )}
          {disabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-bold">
              <Wrench className="h-3 w-3" /> {STATUS[status].label}
            </span>
          )}
        </span>
        <span className="relative">
          <span className="block text-base font-extrabold leading-tight">{a.name}</span>
          <span className="mt-0.5 flex items-center justify-between text-xs text-white/85">
            <span>{a.id === null ? 'Park entry' : attractionTypeLabel(a.type)}</span>
            <span className="text-sm font-black text-white">{money(price(id))}</span>
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        eyebrow="Amusement"
        title="Ticket counter"
        description="Tap a ride for each guest, then sell. Tickets print with a code the gate scans."
        actions={
          <Button variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>
            Counter settings
          </Button>
        }
      />

      <div className={cn('grid gap-5 lg:grid-cols-[1fr_360px]', lines.length > 0 && 'pb-24 lg:pb-0')}>
        <section aria-label="Attractions">
          {isLoading && !attractions.length ? (
            <LoadingGrid count={6} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <Tile a={GENERAL} />
              {ordered.map((a) => (
                <Tile key={a.id} a={a} />
              ))}
            </div>
          )}
          {!isLoading && !attractions.length && (
            <p className="mt-3 text-sm text-stone-500">Add attractions to sell ride tickets; general admission works already.</p>
          )}
        </section>

        <Card className="flex h-fit flex-col p-4 lg:sticky lg:top-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[15px] font-bold text-stone-900">This sale</p>
            {lines.length > 0 && (
              <button type="button" onClick={() => setLines([])} className="inline-flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
          {lines.length ? (
            <ul className="flex flex-col divide-y divide-stone-100">
              {lines.map((l) => {
                const a = l.attractionId === null ? GENERAL : byId.get(l.attractionId)
                return (
                  <li key={String(l.attractionId)} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-800">{a?.name ?? 'Attraction'}</p>
                      <p className="text-xs text-stone-500">
                        {l.quantity} × {money(price(l.attractionId))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="One fewer" onClick={() => add(l.attractionId, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                      <button type="button" aria-label="One more" onClick={() => add(l.attractionId)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={Ticket} title="No tickets yet" description="Tap a ride on the left — once per guest." />
          )}

          <Field label="Name on the tickets (optional)" className="mt-3">
            <Input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="e.g. Ama’s birthday" />
          </Field>

          <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="flex items-center gap-1.5 text-sm text-stone-500">
              <Users className="h-4 w-4" /> {guests} guest{guests === 1 ? '' : 's'}
            </span>
            <span className="text-2xl font-black tabular-nums text-stone-900">{money(total)}</span>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!lines.length || selling}
            onClick={() => void sell()}
            className="mt-3 h-14 rounded-2xl text-base font-extrabold text-white shadow-lg shadow-violet-500/25 transition active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundImage: 'linear-gradient(135deg, #6D28D9, #DB2777)' }}
          >
            {selling ? 'Selling…' : lines.length ? `Sell ${guests} ticket${guests === 1 ? '' : 's'} · ${money(total)}` : 'Sell tickets'}
          </button>
          <label className="mt-3 flex items-center gap-2 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => {
                setAutoPrint(e.target.checked)
                try {
                  localStorage.setItem(PRINT_KEY, e.target.checked ? '1' : '0')
                } catch {
                  // per-device convenience only
                }
              }}
              className="h-4 w-4 accent-violet-600"
            />
            Print tickets after each sale
          </label>
        </Card>
      </div>

      {/* Phones: the basket is below the rides, so selling stays one tap away. */}
      {lines.length > 0 && !sold && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 p-3 backdrop-blur lg:hidden">
          <button
            type="button"
            disabled={selling}
            onClick={() => void sell()}
            className="h-14 w-full rounded-2xl text-base font-extrabold text-white shadow-lg shadow-violet-500/25 disabled:opacity-40"
            style={{ backgroundImage: 'linear-gradient(135deg, #6D28D9, #DB2777)' }}
          >
            {selling ? 'Selling…' : `Sell ${guests} ticket${guests === 1 ? '' : 's'} · ${money(total)}`}
          </button>
        </div>
      )}

      {sold && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center" role="dialog" aria-modal="true" aria-labelledby="sold-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <p id="sold-title" className="mt-2 text-center text-lg font-extrabold text-stone-900">
              {sold.reduce((n, t) => n + t.ticket.quantity, 0)} guest{sold.reduce((n, t) => n + t.ticket.quantity, 0) === 1 ? '' : 's'} ready to go
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {sold.map((t, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-stone-800">
                      Admit {t.ticket.quantity} · {t.attraction?.name ?? 'General admission'}
                    </span>
                    <span className="font-mono text-xs text-stone-500">{t.offline ? 'Sold offline — staff admit at the gate' : ticketCode(t.ticket)}</span>
                  </span>
                  <span className="font-bold tabular-nums">{money(t.price * t.ticket.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={Printer} onClick={() => void printTickets(sold, settings.parkName, settings.ticketNote)}>
                {autoPrint ? 'Print again' : 'Print'}
              </Button>
              <Button onClick={() => setSold(null)} className="bg-violet-600 hover:bg-violet-700">
                Next guest
              </Button>
            </div>
          </div>
        </div>
      )}

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} save={save} />
    </div>
  )
}
