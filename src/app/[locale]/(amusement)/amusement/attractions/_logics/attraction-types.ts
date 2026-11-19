import { Snowflake, Car, Gamepad2, Zap, Target, Goal, Crosshair, Swords, Group, Sparkles, type LucideIcon } from 'lucide-react'

export type AttractionType =
  | 'skating'
  | 'go-karting'
  | 'arcade'
  | 'trampoline'
  | 'paintball'
  | 'bubble-soccer'
  | 'foot-dart'
  | 'sumo-wrestling'
  | 'human-foosball'
  | 'other'

// No photo library exists for this app (no asset pipeline / uploaded images) — an
// icon-in-a-colored-tile stands in as the visual "picture" per type, same pattern
// already used for the amusement overview cards.
export const ATTRACTION_TYPES: { value: AttractionType; label: string; color: string; icon: LucideIcon }[] = [
  { value: 'skating', label: 'Skating', color: 'bg-sky-100 text-sky-700', icon: Snowflake },
  { value: 'go-karting', label: 'Go-Karting', color: 'bg-red-100 text-red-700', icon: Car },
  { value: 'arcade', label: 'Arcade', color: 'bg-purple-100 text-purple-700', icon: Gamepad2 },
  { value: 'trampoline', label: 'Trampoline', color: 'bg-emerald-100 text-emerald-700', icon: Zap },
  // The five below match Bambo's Adventure Park's actual current lineup (Accra) —
  // added alongside the arena types above rather than in place of them.
  { value: 'paintball', label: 'Paintball', color: 'bg-orange-100 text-orange-700', icon: Target },
  { value: 'bubble-soccer', label: 'Bubble Soccer', color: 'bg-cyan-100 text-cyan-700', icon: Goal },
  { value: 'foot-dart', label: 'Foot Dart', color: 'bg-lime-100 text-lime-700', icon: Crosshair },
  { value: 'sumo-wrestling', label: 'Sumo Wrestling', color: 'bg-rose-100 text-rose-700', icon: Swords },
  { value: 'human-foosball', label: 'Human Foosball', color: 'bg-indigo-100 text-indigo-700', icon: Group },
  { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-500', icon: Sparkles },
]

export const attractionTypeLabel = (type: string | null | undefined) => ATTRACTION_TYPES.find((t) => t.value === type)?.label ?? 'Other'

export const attractionTypeColor = (type: string | null | undefined) =>
  ATTRACTION_TYPES.find((t) => t.value === type)?.color ?? 'bg-gray-100 text-gray-500'

export const attractionTypeIcon = (type: string | null | undefined): LucideIcon =>
  ATTRACTION_TYPES.find((t) => t.value === type)?.icon ?? Sparkles

// What "score" means per attraction type, for the leaderboard — some are timed
// (lower is better), most are counted (higher is better).
export const ATTRACTION_METRICS: Record<AttractionType, { label: string; unit: string; higherIsBetter: boolean }> = {
  skating: { label: 'Best Time', unit: 'sec', higherIsBetter: false },
  'go-karting': { label: 'Fastest Lap', unit: 'sec', higherIsBetter: false },
  arcade: { label: 'High Score', unit: 'pts', higherIsBetter: true },
  trampoline: { label: 'Trick Score', unit: 'pts', higherIsBetter: true },
  paintball: { label: 'Eliminations', unit: '', higherIsBetter: true },
  'bubble-soccer': { label: 'Goals', unit: '', higherIsBetter: true },
  'foot-dart': { label: 'Bullseyes', unit: '', higherIsBetter: true },
  'sumo-wrestling': { label: 'Wins', unit: '', higherIsBetter: true },
  'human-foosball': { label: 'Goals', unit: '', higherIsBetter: true },
  other: { label: 'Score', unit: 'pts', higherIsBetter: true },
}

export const attractionMetric = (type: string | null | undefined) =>
  ATTRACTION_METRICS[(type as AttractionType) ?? 'other'] ?? ATTRACTION_METRICS.other

// Bright, saturated tiles for the ticket counter, ride board and Hall of Fame.
// White icon and text sit on top, so each pair keeps white readable (≥3:1).
export const ATTRACTION_GRADIENTS: Record<AttractionType, [string, string]> = {
  skating: ['#0369A1', '#0284C7'],
  'go-karting': ['#B91C1C', '#EA580C'],
  arcade: ['#6D28D9', '#C026D3'],
  trampoline: ['#047857', '#059669'],
  paintball: ['#C2410C', '#EA580C'],
  'bubble-soccer': ['#0E7490', '#0891B2'],
  'foot-dart': ['#3F6212', '#4D7C0F'],
  'sumo-wrestling': ['#9F1239', '#E11D48'],
  'human-foosball': ['#4338CA', '#6366F1'],
  other: ['#6D28D9', '#DB2777'],
}

export const attractionGradient = (type: string | null | undefined) => {
  const [from, to] = ATTRACTION_GRADIENTS[(type as AttractionType) ?? 'other'] ?? ATTRACTION_GRADIENTS.other
  return `linear-gradient(135deg, ${from}, ${to})`
}
