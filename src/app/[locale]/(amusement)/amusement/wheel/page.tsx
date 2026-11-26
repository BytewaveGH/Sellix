'use client'

// Spin to win: for promotions, birthdays and slow afternoons. Slices are
// sized by each prize's chance, so the wheel never pretends the odds are
// even; the pick is random and fair (crypto). Full-screen for a lobby TV.

import React, { useEffect, useRef, useState } from 'react'
import { Expand, Gift, Minus, PartyPopper, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button, Card, PageHeader } from '@/components/kit/ui'
import { Drawer, Input } from '@/components/kit/form'
import { cn } from '@/lib/utils'
import { useParkSettings } from '@/lib/amusement/settings'
import { landingRotation, pickPrize, PRIZE_COLORS, secureRandom, slices, type Prize } from '@/lib/amusement/wheel'
import { sound } from '@/lib/amusement/sounds'
import { Confetti } from '@/components/fun/confetti'

const SPIN_MS = 5200
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4)

// Dark text on the light colours, white on the rest.
const textOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1C1917' : '#FFFFFF'
}

const point = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
}

const WheelSvg = ({ prizes, rotation }: { prizes: Prize[]; rotation: number }) => {
  const C = 220
  const R = 200
  return (
    <svg viewBox="0 0 440 440" className="h-full w-full drop-shadow-[0_20px_40px_rgba(76,29,149,0.35)]" role="img" aria-label="Prize wheel">
      <circle cx={C} cy={C} r={R + 14} fill="#2E1065" />
      {/* Bulbs around the rim */}
      {Array.from({ length: 24 }, (_, i) => {
        const [x, y] = point(C, C, R + 7, i * 15)
        return <circle key={i} cx={x} cy={y} r="4" fill={i % 2 ? '#FDE047' : '#FFFFFF'} opacity=".95" />
      })}
      <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${C}px ${C}px` }}>
        {slices(prizes).map(({ prize, start, end }) => {
          const [x1, y1] = point(C, C, R, start)
          const [x2, y2] = point(C, C, R, end)
          const large = end - start > 180 ? 1 : 0
          const mid = (start + end) / 2
          return (
            <g key={prize.id}>
              <path
                d={`M${C} ${C} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`}
                fill={prize.color}
                stroke="#2E1065"
                strokeWidth="3"
              />
              <text
                transform={`rotate(${mid - 90} ${C} ${C})`}
                x={C + R - 18}
                y={C + 6}
                textAnchor="end"
                fontSize={prizes.length > 8 ? 15 : 18}
                fontWeight="900"
                fill={textOn(prize.color)}
                fontFamily="system-ui, sans-serif"
              >
                {prize.label.length > 16 ? `${prize.label.slice(0, 15)}…` : prize.label}
              </text>
            </g>
          )
        })}
      </g>
      <circle cx={C} cy={C} r="44" fill="#FDE047" stroke="#2E1065" strokeWidth="6" />
      <circle cx={C} cy={C} r="30" fill="#7C3AED" />
      {/* Pointer */}
      <path d={`M${C - 20} 2 L${C + 20} 2 L${C} 46 Z`} fill="#F43F5E" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  )
}

const PrizeEditor = ({
  open,
  onClose,
  prizes,
  onSave,
}: {
  open: boolean
  onClose: () => void
  prizes: Prize[]
  onSave: (p: Prize[]) => void
}) => {
  const [draft, setDraft] = useState(prizes)
  useEffect(() => {
    if (open) setDraft(prizes)
  }, [open, prizes])
  const total = draft.reduce((n, p) => n + Math.max(0, p.weight), 0) || 1
  const valid = draft.length >= 2 && draft.every((p) => p.label.trim()) && draft.some((p) => p.weight > 0)
  const set = (i: number, patch: Partial<Prize>) => setDraft((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Prizes"
      description="A bigger chance gives a prize a bigger slice. Saved on this device."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onSave(draft.map((p) => ({ ...p, label: p.label.trim() })))
              onClose()
            }}
          >
            Save prizes
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {draft.map((p, i) => (
          <li key={p.id} className="rounded-2xl border border-stone-200 p-3">
            <div className="flex items-center gap-2">
              <Input
                value={p.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="Prize"
                aria-label={`Prize ${i + 1}`}
              />
              <button
                type="button"
                aria-label={`Remove ${p.label || 'prize'}`}
                disabled={draft.length <= 2}
                onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex gap-1" role="radiogroup" aria-label="Colour">
                {PRIZE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={p.color === c}
                    aria-label={c}
                    onClick={() => set(i, { color: c })}
                    className={cn('h-6 w-6 rounded-full ring-offset-2 transition', p.color === c && 'ring-2 ring-stone-900')}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-stone-500">Chance</span>
                <button
                  type="button"
                  aria-label="Less likely"
                  onClick={() => set(i, { weight: Math.max(0, p.weight - 1) })}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-16 text-center text-sm font-bold tabular-nums">
                  {Math.round((Math.max(0, p.weight) / total) * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="More likely"
                  onClick={() => set(i, { weight: Math.min(20, p.weight + 1) })}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {draft.length < 12 && (
        <Button
          variant="secondary"
          icon={Plus}
          className="mt-3 w-full"
          onClick={() =>
            setDraft((d) => [
              ...d,
              { id: `p-${Date.now().toString(36)}`, label: '', color: PRIZE_COLORS[d.length % PRIZE_COLORS.length], weight: 1 },
            ])
          }
        >
          Add a prize
        </Button>
      )}
    </Drawer>
  )
}

export default function PrizeWheel() {
  const { settings, save } = useParkSettings()
  const prizes = settings.prizes
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [won, setWon] = useState<Prize | null>(null)
  const [burst, setBurst] = useState(0)
  const [history, setHistory] = useState<{ prize: Prize; at: Date }[]>([])
  const [editing, setEditing] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  useEffect(() => () => void (frame.current && cancelAnimationFrame(frame.current)), [])

  const spin = () => {
    if (spinning || prizes.length < 2) return
    setWon(null)
    setSpinning(true)
    const index = pickPrize(prizes)
    const from = rotation
    const to = landingRotation(prizes, index, from, 6, secureRandom())
    const bounds = slices(prizes).map((s) => s.start)
    // Which slice boundary is under the pointer: to tick as each one passes.
    const sliceAt = (rot: number) => {
      const under = (360 - (rot % 360)) % 360
      return bounds.filter((b) => b <= under).length
    }
    let lastSlice = sliceAt(from)
    const started = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / SPIN_MS)
      const r = from + (to - from) * easeOut(t)
      setRotation(r)
      const s = sliceAt(r)
      if (s !== lastSlice) {
        lastSlice = s
        sound('tick')
      }
      if (t < 1) {
        frame.current = requestAnimationFrame(step)
        return
      }
      setSpinning(false)
      const prize = prizes[index]
      setWon(prize)
      setHistory((h) => [{ prize, at: new Date() }, ...h].slice(0, 6))
      if (!/again/i.test(prize.label)) {
        setBurst((b) => b + 1)
        sound('win')
      }
    }
    frame.current = requestAnimationFrame(step)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Amusement"
        title="Prize wheel"
        description="Spin to win — for promotions, birthdays and loyal guests. Put it on a big screen for the crowd."
        actions={
          <>
            <Button variant="secondary" icon={Settings2} onClick={() => setEditing(true)}>
              Prizes
            </Button>
            <Button variant="secondary" icon={Expand} onClick={() => void stage.current?.requestFullscreen?.().catch(() => undefined)}>
              Full screen
            </Button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div
          ref={stage}
          className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl p-6 sm:p-10"
          style={{ backgroundImage: 'radial-gradient(circle at 50% 30%, #7C3AED 0%, #4C1D95 55%, #2E1065 100%)' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.9) 1.2px, transparent 1.2px)', backgroundSize: '26px 26px' }}
            aria-hidden
          />
          <div className="relative aspect-square w-full max-w-[520px]">
            <WheelSvg prizes={prizes} rotation={rotation} />
            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              aria-label="Spin the wheel"
              className="absolute left-1/2 top-1/2 flex h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-yellow-300 text-sm font-black text-violet-900 shadow-lg ring-4 ring-violet-900 transition hover:scale-105 active:scale-95 disabled:opacity-80 sm:text-base"
            >
              {spinning ? '…' : 'SPIN'}
            </button>
          </div>
          <div className="relative mt-6 h-20 text-center text-white" aria-live="polite">
            {won ? (
              <div style={{ animation: 'win-pop 400ms cubic-bezier(.2,1.6,.4,1)' }}>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-300">
                  {/again/i.test(won.label) ? 'So close!' : 'Winner!'}
                </p>
                <p className="text-4xl font-black tracking-tight sm:text-5xl">{won.label}</p>
              </div>
            ) : (
              <p className="pt-6 text-lg font-semibold text-white/80">{spinning ? 'Round and round it goes…' : 'Tap SPIN to play'}</p>
            )}
          </div>
          <style>{`@keyframes win-pop { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-[15px] font-bold text-stone-900">
              <Gift className="h-4 w-4 text-violet-600" /> The odds
            </p>
            <ul className="flex flex-col gap-2">
              {slices(prizes).map(({ prize, start, end }) => (
                <li key={prize.id} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: prize.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-stone-700">{prize.label}</span>
                  <span className="font-semibold tabular-nums text-stone-900">{Math.round(((end - start) / 360) * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-[15px] font-bold text-stone-900">
              <PartyPopper className="h-4 w-4 text-pink-500" /> Latest spins
            </p>
            {history.length ? (
              <ul className="flex flex-col gap-1.5">
                {history.map((h) => (
                  <li key={h.at.getTime()} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.prize.color }} aria-hidden />
                    <span className="flex-1 truncate font-semibold text-stone-700">{h.prize.label}</span>
                    <span className="text-xs tabular-nums text-stone-400">
                      {h.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-500">Winners show here.</p>
            )}
          </Card>
        </div>
      </div>
      <Confetti burst={burst} />
      <PrizeEditor open={editing} onClose={() => setEditing(false)} prizes={prizes} onSave={(p) => save({ ...settings, prizes: p })} />
    </div>
  )
}
