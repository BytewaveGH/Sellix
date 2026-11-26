'use client'

// The gate: scan or type a ticket's code and get an answer you can read from
// across the turnstile — green "ADMIT 4", red "ALREADY USED". Works with USB
// or Bluetooth scanners (they type the code and press Enter), the device's
// camera where the browser can read QR codes, and fingers.
//
// The API's redeem doesn't refuse a ticket that's already been used, so the
// gate checks first (BACKEND_REQUIREMENTS §14.2 asks the server to refuse).

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, CameraOff, CheckCircle2, CircleHelp, ScanLine, ShieldAlert, Ticket as TicketIcon, XCircle } from 'lucide-react'
import { Card, PageHeader } from '@/components/kit/ui'
import { useAxios } from '@/hooks/use-axios'
import { apiErrorMessage } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import type { Ticket } from '@/lib/amusement/park'
import { checkTicket, type GateCheck } from '@/lib/amusement/ticket-code'
import { sound, vibrate } from '@/lib/amusement/sounds'
import { listIn, withList } from '@/lib/offline/rules'
import { TicketServices } from '../tickets/_logics/services'
import { AttractionBadge, useAttractions, useTickets } from '../_components/park'

type Shown = { check: GateCheck; code: string; at: Date; error?: string }

const sameDay = (iso: string | undefined, d: Date) => !!iso && new Date(iso).toDateString() === d.toDateString()

// The browser's own QR reader (Chrome on Android, ChromeOS, macOS…), when there is one.
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
const qrDetector = (): Detector | null => {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
  try {
    return BD ? new BD({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

const CameraScanner = ({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) => {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const detector = qrDetector()
    if (!detector) return setError('This browser can’t read QR codes from the camera. Use a scanner or type the code.')
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let stopped = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2 || pausedRef.current) return
          const found = await detector.detect(video.current).catch(() => [])
          if (found[0]?.rawValue) onCodeRef.current(found[0].rawValue)
        }, 250)
      })
      .catch(() => setError('The camera isn’t available. Allow it in the browser, or use a scanner.'))
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  return error ? (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>
  ) : (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-40 w-40 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  )
}

const ResultCard = ({ shown }: { shown: Shown | null }) => {
  if (!shown)
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-stone-200 p-8 text-center">
        <ScanLine className="h-14 w-14 text-violet-400" />
        <p className="mt-3 text-xl font-extrabold text-stone-800">Ready to scan</p>
        <p className="mt-1 max-w-xs text-sm text-stone-500">Scan the QR on a ticket, or type its code (like T1042-K7Q) and press Enter.</p>
      </div>
    )
  const { check } = shown
  const spec =
    check.kind === 'admit'
      ? {
          bg: 'from-emerald-500 to-green-600',
          icon: CheckCircle2,
          big: `ADMIT ${check.ticket.quantity}`,
          small: check.attraction?.name ?? 'General admission',
        }
      : check.kind === 'used'
        ? {
            bg: 'from-rose-600 to-red-700',
            icon: XCircle,
            big: 'ALREADY USED',
            small: `${check.attraction?.name ?? 'General admission'} · admit ${check.ticket.quantity}`,
          }
        : check.kind === 'invalid'
          ? {
              bg: 'from-rose-600 to-red-700',
              icon: ShieldAlert,
              big: 'NOT VALID',
              small: 'This code isn’t one of your tickets. Check it was typed right.',
            }
          : check.kind === 'unknown'
            ? {
                bg: 'from-amber-500 to-orange-600',
                icon: CircleHelp,
                big: 'NOT FOUND',
                small: `No ticket T${check.id} here. Sold offline? Check the guest’s receipt.`,
              }
            : {
                bg: 'from-amber-500 to-orange-600',
                icon: CircleHelp,
                big: 'CAN’T READ',
                small: 'That doesn’t look like a ticket code. Try again.',
              }
  const ticket: Ticket | undefined = 'ticket' in check ? check.ticket : undefined
  return (
    <div
      key={shown.at.getTime()}
      role="status"
      aria-live="assertive"
      className={cn(
        'flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl bg-gradient-to-br p-8 text-center text-white shadow-xl',
        spec.bg
      )}
      style={{ animation: 'gate-pop 260ms ease-out' }}
    >
      <spec.icon className="h-20 w-20" strokeWidth={2.2} />
      <p className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">{spec.big}</p>
      <p className="mt-2 max-w-md text-lg font-semibold text-white/90">{spec.small}</p>
      {ticket && (
        <p className="mt-4 rounded-full bg-black/15 px-4 py-1.5 font-mono text-sm">
          {shown.code} {ticket.buyerName ? `· ${ticket.buyerName}` : ''} · sold{' '}
          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}
        </p>
      )}
      {shown.error && <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-sm">{shown.error}</p>}
      <style>{`@keyframes gate-pop { from { transform: scale(.94); opacity: .4 } to { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  )
}

export default function Gate() {
  const request = useAxios()
  const qc = useQueryClient()
  const { attractions } = useAttractions()
  const { tickets, refetch } = useTickets()
  const [code, setCode] = useState('')
  const [shown, setShown] = useState<Shown | null>(null)
  const [recent, setRecent] = useState<Shown[]>([])
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const lastScan = useRef({ code: '', at: 0 })

  const today = new Date()
  const admittedToday = tickets.filter((t) => t.status === 'redeemed' && sameDay(t.createdAt, today)).reduce((n, t) => n + t.quantity, 0)

  // Keep the box ready for the next scan.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.activeElement === document.body) input.current?.focus()
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const markRedeemed = (id: number, status: Ticket['status']) =>
    qc.setQueryData(['tickets'], (old: unknown) =>
      Array.isArray(old) ? old.map((t: Ticket) => (t.id === id ? { ...t, status } : t)) : old
    )

  const scan = useCallback(
    async (raw: string) => {
      const value = raw.trim()
      if (!value || busy) return
      // The camera sees the same code many times a second.
      if (value === lastScan.current.code && Date.now() - lastScan.current.at < 2500) return
      lastScan.current = { code: value, at: Date.now() }
      setBusy(true)
      try {
        let check = checkTicket(value, tickets, attractions)
        // Sold a moment ago at another till? Look again.
        if (check.kind === 'unknown') {
          const fresh = await refetch()
          check = checkTicket(value, (fresh.data as Ticket[] | undefined) ?? tickets, attractions)
        }
        let error: string | undefined
        if (check.kind === 'admit') {
          markRedeemed(check.ticket.id, 'redeemed')
          try {
            const id = check.ticket.id
            await request({
              ...TicketServices.Redeem(id),
              // Offline it's kept and sent later; the ticket list kept on this
              // device shows it used now, so it can't get in twice even after a reload.
              offline: {
                label: `Admit ticket T${id}`,
                adjusts: (key: string) => /^\/tickets(\?|$)/.test(key),
                adjust: (_key: string, body: unknown) => {
                  const rows = listIn(body)
                  return rows
                    ? withList(
                        body,
                        rows.map((t) => (Number(t.id) === id ? { ...t, status: 'redeemed' } : t))
                      )
                    : undefined
                },
              },
            } as Parameters<typeof request>[0])
          } catch (err) {
            markRedeemed(check.ticket.id, 'valid')
            error = `Not recorded: ${apiErrorMessage(err, 'try again')}`
          }
        }
        const next: Shown = { check, code: value.toUpperCase(), at: new Date(), error }
        setShown(next)
        setRecent((r) => [next, ...r].slice(0, 8))
        if (check.kind === 'admit' && !error) {
          sound('ok')
          vibrate(60)
        } else {
          sound('no')
          vibrate([80, 60, 80])
        }
      } finally {
        setBusy(false)
        setCode('')
        input.current?.focus()
      }
    },
    [busy, tickets, attractions, refetch, request]
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Amusement"
        title="Gate check-in"
        description="Scan tickets as guests come in. Each ticket works once."
        actions={
          <div className="flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-2 text-violet-800">
            <TicketIcon className="h-4 w-4" />
            <span className="text-sm font-bold tabular-nums">{admittedToday.toLocaleString()}</span>
            <span className="text-xs">admitted today</span>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <ResultCard shown={shown} />
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void scan(code)
              }}
            >
              <label htmlFor="gate-code" className="text-[13px] font-semibold text-stone-700">
                Ticket code
              </label>
              <input
                id="gate-code"
                ref={input}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="T1042-K7Q"
                className="mt-1.5 h-14 w-full rounded-2xl border-2 border-stone-200 px-4 font-mono text-2xl font-bold uppercase tracking-wider text-stone-900 placeholder:text-stone-300 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
              />
              <button
                type="submit"
                disabled={!code.trim() || busy}
                className="mt-3 h-12 w-full rounded-2xl bg-violet-600 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-40"
              >
                {busy ? 'Checking…' : 'Check ticket'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setCamera((c) => !c)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline"
            >
              {camera ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              {camera ? 'Stop the camera' : 'Scan with this device’s camera'}
            </button>
            {camera && (
              <div className="mt-3">
                <CameraScanner onCode={(c) => void scan(c)} paused={busy} />
              </div>
            )}
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-[13px] font-bold text-stone-800">Just now</p>
            {recent.length ? (
              <ul className="flex flex-col gap-1.5">
                {recent.map((r) => {
                  const ok = r.check.kind === 'admit' && !r.error
                  const t = 'ticket' in r.check ? r.check : null
                  return (
                    <li key={r.at.getTime()} className="flex items-center gap-2 text-sm">
                      {t?.attraction ? (
                        <AttractionBadge type={t.attraction.type} size="sm" />
                      ) : (
                        <span className={cn('h-2.5 w-2.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-rose-500')} />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <span className={cn('font-semibold', ok ? 'text-emerald-700' : 'text-rose-700')}>
                          {ok ? `Admit ${t?.ticket.quantity}` : r.check.kind === 'used' ? 'Used' : 'Refused'}
                        </span>{' '}
                        <span className="font-mono text-xs text-stone-500">{r.code}</span>
                      </span>
                      <span className="text-xs tabular-nums text-stone-400">
                        {r.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-stone-500">Scans show here.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
