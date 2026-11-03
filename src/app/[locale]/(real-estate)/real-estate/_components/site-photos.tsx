'use client'

/* eslint-disable @next/next/no-img-element -- owner-uploaded photos (data URLs in local mode) */
import React, { useId, useRef, useState } from 'react'
import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IMAGE_ACCEPT, imageProblem } from '@/lib/eatery/images'

// A small gallery: the first photo is the cover. Each change is saved at once
// by `onChange`; uploads go one after another so the order is kept.
export const PhotoGrid = ({
  label,
  photos,
  max,
  onChange,
  upload,
  disabled,
  compact,
}: {
  label: string
  photos: string[]
  max: number
  onChange: (photos: string[]) => Promise<unknown>
  upload: (file: File) => Promise<string>
  disabled?: boolean
  compact?: boolean
}) => {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (files: File[]) => {
    setError(null)
    const room = max - photos.length
    if (room <= 0) return setError(`Up to ${max} photos`)
    const picked = files.slice(0, room)
    const bad = picked.map(imageProblem).find(Boolean)
    if (bad) return setError(bad)
    setBusy(true)
    let next = photos
    try {
      for (const f of picked) next = [...next, await upload(f)]
      await onChange(next)
      if (files.length > room) setError(`Only the first ${room} added — up to ${max} photos`)
    } catch {
      // The upload or save already said what went wrong.
    } finally {
      setBusy(false)
    }
  }

  const change = async (next: string[]) => {
    setBusy(true)
    try {
      await onChange(next)
    } catch {
      // Toasted by the save.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-[13px] font-semibold text-stone-700">
        {label}{' '}
        <span className="font-normal text-stone-400">
          · {photos.length}/{max}
        </span>
      </p>
      <ul className={cn('mt-2 grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4')}>
        {photos.map((src, i) => (
          <li key={`${i}-${src.slice(-24)}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-stone-100">
            <img src={src} alt={`${label} ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">Cover</span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
              {i > 0 && (
                <button
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => void change([src, ...photos.filter((_, j) => j !== i)])}
                  aria-label={`Make photo ${i + 1} the cover`}
                  title="Make cover"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-stone-700 shadow hover:bg-white disabled:opacity-50"
                >
                  <Star className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => void change(photos.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                title="Remove"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-rose-600 shadow hover:bg-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {photos.length < max && (
          <li>
            <label
              htmlFor={id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (!busy && !disabled) void add(Array.from(e.dataTransfer.files ?? []))
              }}
              className={cn(
                'flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-200 text-stone-500 hover:border-endeavour hover:text-endeavour',
                (busy || disabled) && 'pointer-events-none opacity-60'
              )}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <span className="text-[11px] font-bold">{busy ? 'Uploading…' : 'Add photos'}</span>
            </label>
            <input
              ref={input}
              id={id}
              type="file"
              multiple
              accept={IMAGE_ACCEPT}
              className="sr-only"
              aria-label={`Add ${label.toLowerCase()}`}
              disabled={busy || disabled}
              onChange={(e) => {
                void add(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}
