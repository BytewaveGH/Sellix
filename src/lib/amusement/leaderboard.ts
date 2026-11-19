// Leaderboards per attraction: all-time and today, records, and spotting a
// new record between two loads of the public board. Pure, for tests.

import type { LeaderboardEntry } from './park'

export type Metric = { label: string; unit: string; higherIsBetter: boolean }

export type Board = {
  attractionId: number
  name: string
  type: string
  metric: Metric
  // Best first; one row per person (their best), so one champion can't fill the board.
  rows: LeaderboardEntry[]
  today: LeaderboardEntry[]
}

const better = (m: Metric) => (a: LeaderboardEntry, b: LeaderboardEntry) => (m.higherIsBetter ? b.score - a.score : a.score - b.score)

const bestPerPerson = (rows: LeaderboardEntry[], m: Metric) => {
  const best = new Map<string, LeaderboardEntry>()
  for (const r of [...rows].sort(better(m))) {
    const who = `${r.participantName.trim().toLowerCase()}|${(r.teamName ?? '').trim().toLowerCase()}`
    if (!best.has(who)) best.set(who, r)
  }
  return Array.from(best.values())
}

const sameDay = (iso: string, day: Date) => {
  const t = new Date(iso)
  return t.getFullYear() === day.getFullYear() && t.getMonth() === day.getMonth() && t.getDate() === day.getDate()
}

export const buildBoards = (
  entries: LeaderboardEntry[],
  info: (attractionId: number, entry: LeaderboardEntry) => { name: string; type: string },
  metricFor: (type: string) => Metric,
  now: Date,
  top = 10
): Board[] => {
  const groups = new Map<number, LeaderboardEntry[]>()
  for (const e of entries) groups.set(e.attractionId, [...(groups.get(e.attractionId) ?? []), e])
  return Array.from(groups.entries())
    .map(([attractionId, rows]) => {
      const { name, type } = info(attractionId, rows[0])
      const metric = metricFor(type)
      return {
        attractionId,
        name,
        type,
        metric,
        rows: bestPerPerson(rows, metric).slice(0, top),
        today: bestPerPerson(
          rows.filter((r) => sameDay(r.achievedAt, now)),
          metric
        ).slice(0, 3),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Where a score would land on a board (1 = new record), before it's saved.
export const wouldRank = (board: Pick<Board, 'rows' | 'metric'> | undefined, score: number) => {
  if (!board) return 1
  const ahead = board.rows.filter((r) => (board.metric.higherIsBetter ? r.score > score : r.score < score)).length
  return ahead + 1
}

// Boards whose record was beaten since the last load: what to celebrate.
export const newRecords = (before: Board[], after: Board[]): Board[] => {
  const prev = new Map(before.map((b) => [b.attractionId, b.rows[0]]))
  return after.filter((b) => {
    const was = prev.get(b.attractionId)
    const now = b.rows[0]
    if (!now || !prev.has(b.attractionId)) return false
    if (!was) return true
    return now.id !== was.id && (b.metric.higherIsBetter ? now.score > was.score : now.score < was.score)
  })
}

export const formatScore = (score: number, m: Metric) => {
  const n = Number.isInteger(score) ? String(score) : score.toFixed(2)
  return m.unit ? `${n} ${m.unit}` : n
}
