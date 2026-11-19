'use client'

// The Hall of Fame: the park's leaderboard for a lobby TV or a shared link.
// One attraction at a time in the spotlight (podium, record holder, today's
// best), every board below, and a celebration when a record falls. No sign-in.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Flame, Medal, Trophy } from 'lucide-react'
import { publicApiClient } from '@/lib/public-axios-client'
import { cn } from '@/lib/utils'
import type { LeaderboardEntry } from '@/lib/amusement/park'
import { buildBoards, formatScore, newRecords, type Board } from '@/lib/amusement/leaderboard'
import { Confetti } from '@/components/fun/confetti'
import {
  attractionGradient,
  attractionMetric,
  attractionTypeIcon,
  attractionTypeLabel,
} from '@/app/[locale]/(amusement)/amusement/attractions/_logics/attraction-types'

const REFRESH_MS = 20_000
const SPOTLIGHT_MS = 12_000
const CELEBRATE_MS = 9_000

const useClock = () => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

const PODIUM = [
  { place: 2, height: 'h-28', medal: 'text-slate-200', ring: 'ring-slate-300/60' },
  { place: 1, height: 'h-40', medal: 'text-yellow-300', ring: 'ring-yellow-300/70' },
  { place: 3, height: 'h-20', medal: 'text-orange-300', ring: 'ring-orange-300/60' },
]

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

const Spotlight = ({ board }: { board: Board }) => {
  const Icon = attractionTypeIcon(board.type)
  return (
    <section
      key={board.attractionId}
      className="relative overflow-hidden rounded-[32px] p-6 sm:p-10"
      style={{ backgroundImage: attractionGradient(board.type), animation: 'hof-in 600ms ease-out' }}
    >
      <Icon className="pointer-events-none absolute -right-10 -top-10 h-72 w-72 text-white/10" strokeWidth={1.2} aria-hidden />
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-white/75">{attractionTypeLabel(board.type)}</p>
          <h2 className="mt-1 text-4xl font-black tracking-tight sm:text-6xl">{board.name}</h2>
          <p className="mt-2 text-lg text-white/80">{board.metric.label}</p>
          {board.rows[0] && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-black/20 px-5 py-3 backdrop-blur">
              <Crown className="h-7 w-7 text-yellow-300" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">Park record</p>
                <p className="text-2xl font-black">
                  {formatScore(board.rows[0].score, board.metric)} <span className="font-semibold text-white/80">· {board.rows[0].participantName}</span>
                </p>
              </div>
            </div>
          )}
          {board.today.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-sm font-bold text-white/90">
                <Flame className="h-4 w-4 text-orange-200" /> Today’s best:
              </span>
              {board.today.map((r) => (
                <span key={r.id} className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
                  {r.participantName} · {formatScore(r.score, board.metric)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Podium: 2 · 1 · 3 */}
        <div className="flex items-end justify-center gap-3 sm:gap-4">
          {PODIUM.map(({ place, height, medal, ring }) => {
            const r = board.rows[place - 1]
            return (
              <div key={place} className="flex w-28 flex-col items-center sm:w-36">
                {r ? (
                  <>
                    <span className={cn('flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-xl font-black ring-4 sm:h-20 sm:w-20 sm:text-2xl', ring)}>
                      {initials(r.participantName)}
                    </span>
                    <p className="mt-2 max-w-full truncate text-center text-base font-bold">{r.participantName}</p>
                    <p className="text-sm font-semibold tabular-nums text-white/85">{formatScore(r.score, board.metric)}</p>
                  </>
                ) : (
                  <p className="mb-2 text-sm text-white/60">Up for grabs</p>
                )}
                <div className={cn('mt-2 flex w-full items-start justify-center rounded-t-2xl bg-white/20 pt-2 backdrop-blur', height)}>
                  <Medal className={cn('h-8 w-8', medal)} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const MiniBoard = ({ board, active }: { board: Board; active: boolean }) => {
  const Icon = attractionTypeIcon(board.type)
  return (
    <div className={cn('rounded-3xl border bg-white/[0.04] p-5 transition', active ? 'border-white/40 bg-white/[0.08]' : 'border-white/10')}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundImage: attractionGradient(board.type) }}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold leading-tight">{board.name}</p>
          <p className="text-xs text-white/50">{board.metric.label}</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {board.rows.slice(0, 5).map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 text-[15px]">
            <span
              className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-black',
                i === 0 ? 'bg-yellow-300 text-yellow-950' : i === 1 ? 'bg-slate-200 text-slate-900' : i === 2 ? 'bg-orange-300 text-orange-950' : 'bg-white/10 text-white/60'
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {r.participantName}
              {r.teamName && <span className="text-white/45"> · {r.teamName}</span>}
            </span>
            <span className="font-mono font-bold tabular-nums text-white/90">{formatScore(r.score, board.metric)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function HallOfFame() {
  const now = useClock()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [spot, setSpot] = useState(0)
  const [record, setRecord] = useState<Board | null>(null)
  const [burst, setBurst] = useState(0)
  const previous = useRef<Board[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await publicApiClient.get('/leaderboard/public')
      setEntries(res.data?.data ?? [])
      setError('')
    } catch {
      setError('Can’t reach the leaderboard right now — showing the last scores.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const boards = useMemo(
    () =>
      buildBoards(
        entries,
        (_id, e) => ({ name: e.attractionName ?? 'Attraction', type: e.attractionType ?? 'other' }),
        attractionMetric,
        new Date()
      ),
    [entries]
  )

  // A record fell since the last load: celebrate it and put it in the spotlight.
  useEffect(() => {
    if (!loaded) return
    if (previous.current) {
      const fresh = newRecords(previous.current, boards)[0]
      if (fresh) {
        setRecord(fresh)
        setBurst((b) => b + 1)
        setSpot(Math.max(0, boards.findIndex((b) => b.attractionId === fresh.attractionId)))
        const t = setTimeout(() => setRecord(null), CELEBRATE_MS)
        previous.current = boards
        return () => clearTimeout(t)
      }
    }
    previous.current = boards
  }, [boards, loaded])

  useEffect(() => {
    if (boards.length < 2 || record) return
    const t = setInterval(() => setSpot((s) => (s + 1) % boards.length), SPOTLIGHT_MS)
    return () => clearInterval(t)
  }, [boards.length, record])

  const current = boards[spot % Math.max(1, boards.length)]

  return (
    <div
      className="min-h-screen px-5 py-8 text-white sm:px-10"
      style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, #4C1D95 0%, #1E1B4B 40%, #0B0A1A 100%)' }}
    >
      <header className="mx-auto mb-8 flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-300 text-yellow-950 shadow-lg shadow-yellow-300/30">
            <Trophy className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Hall of Fame</h1>
            <p className="text-sm text-white/60">Beat a record and your name goes up here</p>
          </div>
        </div>
        <p className="text-right font-mono text-2xl font-bold tabular-nums text-white/80 sm:text-3xl">
          {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </p>
      </header>

      <main className="mx-auto max-w-7xl">
        {!loaded ? (
          <p className="py-24 text-center text-xl text-white/50">Loading the champions…</p>
        ) : !boards.length ? (
          <div className="py-24 text-center">
            <Trophy className="mx-auto h-16 w-16 text-yellow-300/70" />
            <p className="mt-4 text-2xl font-bold">No scores yet</p>
            <p className="mt-1 text-white/60">The first champion of the day could be you.</p>
          </div>
        ) : (
          <>
            {current && <Spotlight board={current} />}
            {boards.length > 1 && (
              <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
                {boards.map((b, i) => (
                  <span key={b.attractionId} className={cn('h-1.5 rounded-full transition-all', i === spot % boards.length ? 'w-8 bg-white' : 'w-1.5 bg-white/30')} />
                ))}
              </div>
            )}
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {boards.map((b, i) => (
                <MiniBoard key={b.attractionId} board={b} active={i === spot % boards.length} />
              ))}
            </div>
          </>
        )}
        {error && <p className="mt-6 text-center text-sm text-amber-300/80">{error}</p>}
      </main>

      {record && record.rows[0] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" role="alert">
          <div
            className="w-full max-w-3xl rounded-[36px] p-10 text-center shadow-2xl"
            style={{ backgroundImage: attractionGradient(record.type), animation: 'hof-record 700ms cubic-bezier(.2,1.5,.4,1)' }}
          >
            <p className="text-lg font-black uppercase tracking-[0.35em] text-yellow-200">New record!</p>
            <p className="mt-3 text-6xl font-black tracking-tight sm:text-7xl">{record.rows[0].participantName}</p>
            <p className="mt-4 text-3xl font-extrabold">{formatScore(record.rows[0].score, record.metric)}</p>
            <p className="mt-2 text-xl text-white/85">
              {record.metric.label} · {record.name}
            </p>
          </div>
        </div>
      )}
      <Confetti burst={burst} />
      <style>{`
        @keyframes hof-in { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        @keyframes hof-record { from { opacity: 0; transform: scale(.7) rotate(-2deg) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  )
}
