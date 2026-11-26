'use client'

// The Windows desktop app is core on every plan (features.ts CORE_FEATURES):
// owners see where to get it, or that they're already on it.

import React, { useEffect, useState } from 'react'
import { CheckCircle2, Download, MonitorDown, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/kit/ui'
import { isDesktopApp } from '@/lib/tenant'

export const DesktopAppCard = ({ url, support, className }: { url?: string; support?: string; className?: string }) => {
  // Read after mount: the server render can't know.
  const [desktop, setDesktop] = useState(false)
  useEffect(() => setDesktop(isDesktopApp()), [])
  return (
    <Card className={cn('p-5 flex flex-col sm:flex-row sm:items-center gap-4', className)}>
      <span className="h-11 w-11 rounded-xl bg-endeavour/10 text-endeavour flex items-center justify-center flex-shrink-0">
        <MonitorDown className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-stone-900">
          Windows desktop app{' '}
          <span className="ml-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">Included in every plan</span>
        </p>
        <p className="text-sm text-stone-500 mt-0.5 inline-flex items-start gap-1.5">
          <WifiOff className="h-4 w-4 mt-0.5 flex-shrink-0 text-stone-400" />
          Keeps selling when the internet is down. Sales are kept on the PC and sent once it’s back.
        </p>
      </div>
      {desktop ? (
        <p className="text-sm font-semibold text-emerald-700 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> You’re using it
        </p>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-endeavour px-4 text-sm font-semibold text-white hover:bg-veniceBlue"
        >
          <Download className="h-4 w-4" /> Download for Windows
        </a>
      ) : (
        <p className="text-sm text-stone-500 sm:max-w-[220px]">Ask the Bytewave team for the installer{support ? `: ${support}` : '.'}</p>
      )}
    </Card>
  )
}
