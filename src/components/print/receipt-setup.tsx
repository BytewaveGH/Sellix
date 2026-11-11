'use client'

// Receipt printer width for this device, and a live preview of the receipt
// exactly as it will print.

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PAPER_OPTIONS, readPaperWidth, writePaperWidth, type PaperWidth } from '@/lib/print/receipt'

export const usePaperWidth = () => {
  const [paper, setPaper] = useState<PaperWidth>('80')
  useEffect(() => setPaper(readPaperWidth()), [])
  const choose = (p: PaperWidth) => {
    writePaperWidth(p)
    setPaper(p)
  }
  return [paper, choose] as const
}

export const PrinterChoice = ({ paper, onChange }: { paper: PaperWidth; onChange: (p: PaperWidth) => void }) => (
  <fieldset>
    <legend className="text-[13px] font-semibold text-stone-700">Receipt printer on this device</legend>
    <p className="text-xs text-stone-400">Match your paper so nothing is cut off. Each till remembers its own.</p>
    <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Paper">
      {PAPER_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={paper === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-xl border px-3 py-2 text-left transition-colors',
            paper === o.value ? 'border-endeavour bg-endeavour/[0.06] ring-1 ring-endeavour' : 'border-stone-200 hover:border-stone-300'
          )}
        >
          <span className="block text-sm font-bold text-stone-900">{o.label}</span>
          <span className="block text-[11px] text-stone-500">{o.hint}</span>
        </button>
      ))}
    </div>
  </fieldset>
)

// The printable page in a frame, scaled to fit. Always white like paper.
export const ReceiptPreview = ({ html, paper, className }: { html: string; paper: PaperWidth; className?: string }) => {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(400)
  // Page width at 96 dpi; A4 previews the receipt column only.
  const width = Math.round(((paper === 'a4' ? 96 : Number(paper)) * 96) / 25.4)
  const measure = () => {
    const doc = frame.current?.contentDocument
    if (doc?.body) setHeight(doc.body.scrollHeight + 4)
  }
  useEffect(() => {
    const t = setTimeout(measure, 300)
    return () => clearTimeout(t)
  }, [html])
  return (
    <div className={cn('flex justify-center rounded-2xl bg-stone-100 p-4', className)}>
      <iframe
        ref={frame}
        title="Receipt preview"
        srcDoc={html}
        onLoad={measure}
        style={{ width, height }}
        className="rounded-sm bg-white shadow-md"
      />
    </div>
  )
}
