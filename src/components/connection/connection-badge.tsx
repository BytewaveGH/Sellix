'use client'

// Top-bar badge: hidden while all is well; amber when slow, red when offline,
// and a short green "Back online" after a problem clears.

import React, { useEffect, useRef, useState } from 'react'
import { CloudOff, Gauge, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { probe, useConnection } from '@/lib/connection'

const BACK_ONLINE_MS = 4000

export const ConnectionBadge = ({ className }: { className?: string }) => {
  const { status } = useConnection()
  const previous = useRef(status)
  const [recovered, setRecovered] = useState(false)

  useEffect(() => {
    if (status === 'online' && previous.current === 'offline') {
      setRecovered(true)
      const t = setTimeout(() => setRecovered(false), BACK_ONLINE_MS)
      previous.current = status
      return () => clearTimeout(t)
    }
    previous.current = status
  }, [status])

  if (status === 'online' && !recovered) return null

  const spec =
    status === 'offline'
      ? {
          icon: CloudOff,
          label: 'Offline',
          title:
            'Can’t reach Sellix. You stay signed in; anything that needs the internet will work again when it’s back. Click to check now.',
          className: 'bg-rose-600 text-white',
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
    <button
      type="button"
      onClick={() => void probe()}
      title={spec.title}
      // Announced when it changes, without stealing focus.
      aria-live="polite"
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold shadow-sm', spec.className, className)}
    >
      <spec.icon className="h-3.5 w-3.5" aria-hidden />
      {spec.label}
    </button>
  )
}
