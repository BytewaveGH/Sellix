'use client'

// Top-bar badge: hidden while all is well. Red when offline, amber when slow,
// blue while offline changes are waiting or being sent, and a short green
// "Back online" after a problem clears. Click for the sync list.

import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CloudOff, Gauge, Loader2, RefreshCw, UploadCloud, Wifi, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { probe, useConnection } from '@/lib/connection'
import { useOffline, type OfflineState } from '@/lib/offline/use-offline'
import type { Op } from '@/lib/offline/engine'

const BACK_ONLINE_MS = 4000

const time = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString(undefined, today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const OpRow = ({ op, offline }: { op: Op; offline: OfflineState }) => {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
            op.status === 'waiting' ? 'bg-sky-500' : op.status === 'check' ? 'bg-amber-500' : 'bg-rose-500'
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-800">{op.label}</p>
          <p className="text-[11px] text-gray-500">
            {time(op.createdAt)} · {op.status === 'waiting' ? 'waiting to send' : op.status === 'check' ? 'needs checking' : 'refused'}
          </p>
          {op.error && <p className="mt-1 text-xs text-stone-600">{op.error}</p>}
          {op.status !== 'waiting' && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => offline.retry(op.id)}
                className="h-7 rounded-lg bg-endeavour px-2.5 text-xs font-semibold text-white"
              >
                {op.status === 'check' ? 'Not recorded — send it' : 'Try again'}
              </button>
              {confirming ? (
                <button
                  type="button"
                  onClick={() => offline.discard(op.id)}
                  className="h-7 rounded-lg bg-rose-600 px-2.5 text-xs font-semibold text-white"
                >
                  Discard for good
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="h-7 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-stone-700"
                >
                  {op.status === 'check' ? 'Already recorded — discard' : 'Discard'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export const ConnectionBadge = ({ className }: { className?: string }) => {
  const { status } = useConnection()
  const offline = useOffline()
  const previous = useRef(status)
  const [recovered, setRecovered] = useState(false)
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'online' && previous.current === 'offline') {
      setRecovered(true)
      const t = setTimeout(() => setRecovered(false), BACK_ONLINE_MS)
      previous.current = status
      return () => clearTimeout(t)
    }
    previous.current = status
  }, [status])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !panel.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const pending = offline.ops.length
  if (status === 'online' && !recovered && pending === 0) return null

  const saved = offline.waiting ? ` · ${offline.waiting} saved` : ''
  const spec =
    status === 'offline'
      ? {
          icon: CloudOff,
          label: `Offline${saved}`,
          title: 'Can’t reach Sellix. Keep working: changes are saved on this device and sent when the connection is back.',
          className: 'bg-rose-600 text-white',
        }
      : offline.attention > 0
        ? {
            icon: AlertTriangle,
            label: `${offline.attention} to check`,
            title: 'Some offline changes couldn’t be sent. Click to see them.',
            className: 'bg-amber-400 text-stone-900',
          }
        : offline.syncing || offline.waiting > 0
          ? {
              icon: offline.syncing ? Loader2 : UploadCloud,
              label: offline.syncing ? `Sending ${offline.waiting}…` : `${offline.waiting} waiting to send`,
              title: 'Changes made offline are being sent.',
              className: 'bg-sky-600 text-white',
            }
          : status === 'slow'
            ? {
                icon: Gauge,
                label: 'Slow connection',
                title: 'Sellix is responding slowly. Click to check again.',
                className: 'bg-amber-400 text-stone-900',
              }
            : { icon: Wifi, label: 'Back online', title: 'The connection is back.', className: 'bg-emerald-600 text-white' }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => {
          if (pending > 0 || status === 'offline') setOpen((o) => !o)
          else void probe()
        }}
        title={spec.title}
        aria-expanded={open}
        // Announced when it changes, without stealing focus.
        aria-live="polite"
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold shadow-sm', spec.className, className)}
      >
        <spec.icon className={cn('h-3.5 w-3.5', offline.syncing && 'animate-spin')} aria-hidden />
        {spec.label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Offline changes"
          className="absolute right-0 top-10 z-50 w-[min(92vw,360px)] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="font-bold text-stone-800">{status === 'offline' ? 'Working offline' : 'Offline changes'}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {status === 'offline'
                  ? 'Screens show what was last loaded on this device. New sales, orders and edits are saved here and sent, in order, when the connection is back.'
                  : 'Sent in the order they were made. Anything refused stays here until you decide.'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          {pending === 0 ? (
            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">Nothing waiting.</p>
          ) : (
            <ul className="mt-2 max-h-[50vh] divide-y divide-gray-100 overflow-y-auto">
              {offline.ops.map((op) => (
                <OpRow key={op.id} op={op} offline={offline} />
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void probe()
                offline.syncNow()
              }}
              disabled={offline.syncing}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-stone-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', offline.syncing && 'animate-spin')} />
              {status === 'offline' ? 'Check connection' : 'Send now'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
