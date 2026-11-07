'use client'

import React, { useMemo, useState } from 'react'
import { Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/kit/ui'
import { Field, Input, Toggle } from '@/components/kit/form'
import { FESTIVAL_ICONS, FestivalSeal, FestivalStripe } from '@/components/eatery/festival-marks'
import {
  FESTIVAL_KINDS,
  allowed,
  barColors,
  daysUntil,
  festivalsOn,
  formatWindow,
  liveFestival,
  messageFor,
  occurrenceId,
  pruneSkipped,
  sealYear,
  seasonalOf,
  upcomingFestivals,
  type FestivalKey,
  type Occurrence,
} from '@/lib/eatery/festivals'
import type { SeasonalSettings, ThemeConfig } from '@/lib/eatery/theme'

const MESSAGE_MAX = 90

const relative = (o: Occurrence, now: Date) => {
  const n = daysUntil(o, now)
  if (n <= 0) return 'On now'
  if (n === 1) return 'Tomorrow'
  return n < 45 ? `In ${n} days` : `In ${Math.round(n / 30)} months`
}
const monthOf = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

const IntensityOption = ({
  selected,
  onSelect,
  title,
  body,
  swatches,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  body: string
  swatches: string[]
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={cn(
      'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
      selected ? 'border-endeavour bg-endeavour/[0.04] ring-2 ring-endeavour/15' : 'border-stone-200 hover:border-stone-300'
    )}
  >
    <span className="mt-0.5 flex flex-shrink-0 -space-x-1.5" aria-hidden>
      {swatches.map((c, i) => (
        <span key={i} className="h-5 w-5 rounded-full border-2 border-white shadow-sm" style={{ background: c }} />
      ))}
    </span>
    <span>
      <span className="block text-sm font-bold text-stone-900">{title}</span>
      <span className="block text-[11px] leading-snug text-stone-500">{body}</span>
    </span>
  </button>
)

// "Festivals" tab of the brand editor. Festivals mark the storefront on their
// own; the owner decides how much changes, writes the bar's message, and can
// skip one occurrence or turn a festival off for good.
export const FestivalPanel = ({
  theme,
  onChange,
  now,
  previewing,
  onPreview,
}: {
  theme: ThemeConfig
  onChange: (s: SeasonalSettings) => void
  now: Date
  previewing: FestivalKey | null
  onPreview: (key: FestivalKey | null) => void
}) => {
  const s = seasonalOf(theme)
  const set = (p: Partial<SeasonalSettings>) => onChange({ ...s, ...p })
  const upcoming = useMemo(() => upcomingFestivals(now), [now])
  const live = liveFestival(theme, now)
  const [picked, setPicked] = useState<FestivalKey | null>(null)
  const selectedKey = picked ?? live?.festival.key ?? festivalsOn(now)[0]?.festival.key ?? upcoming[0]?.festival.key
  const selected = upcoming.find((o) => o.festival.key === selectedKey) ?? upcoming[0]

  const isOn = (key: FestivalKey) => !s.off.includes(key)
  const toggle = (key: FestivalKey, on: boolean) => set({ off: on ? s.off.filter((k) => k !== key) : [...s.off, key] })
  const skip = (o: Occurrence) => set({ skipped: [...pruneSkipped(s, now), occurrenceId(o)] })
  const unskip = (o: Occurrence) => set({ skipped: s.skipped.filter((id) => id !== occurrenceId(o)) })
  const setMessage = (key: FestivalKey, text: string) => {
    const messages = { ...s.messages }
    if (text.trim()) messages[key] = text
    else delete messages[key]
    set({ messages })
  }

  // Grouped by month for the agenda.
  const months = useMemo(() => {
    const groups: { label: string; items: Occurrence[] }[] = []
    upcoming.forEach((o) => {
      const label = monthOf(o.start <= now ? now : o.start)
      const last = groups[groups.length - 1]
      if (last?.label === label) last.items.push(o)
      else groups.push({ label, items: [o] })
    })
    return groups
  }, [upcoming, now])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border border-stone-200 p-4">
        <Toggle
          checked={s.auto}
          onChange={(auto) => set({ auto })}
          label="Mark festivals on my storefront"
          hint="Switches on for each festival and back the day after. Your saved theme never changes."
        />
        {s.auto && (
          <>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-stone-700">How much changes</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How much changes">
                <IntensityOption
                  selected={s.intensity === 'full'}
                  onSelect={() => set({ intensity: 'full' })}
                  title="Full festival look"
                  body="Everything dresses up: colours, buttons, cards, tabs, badges, headings, cover and background — plus the bar, seal and logo ring."
                  swatches={selected ? Object.values(selected.festival.palette.light).slice(0, 3) : []}
                />
                <IntensityOption
                  selected={s.intensity === 'accent'}
                  onSelect={() => set({ intensity: 'accent' })}
                  title="A touch"
                  body="Keeps your colours. Adds only the festival bar, a seal on your header and a ring around your logo."
                  swatches={[theme.colors.primary, theme.colors.surface, selected?.festival.color ?? '#DB2777']}
                />
              </div>
            </div>
            <Toggle
              checked={s.banner}
              onChange={(banner) => set({ banner })}
              label="Festival bar at the top of the page"
              hint="One short line in the festival’s colours"
            />
          </>
        )}
      </div>

      {selected && (
        <Spotlight
          o={selected}
          s={s}
          now={now}
          live={live?.festival.key === selected.festival.key}
          previewing={previewing === selected.festival.key}
          onPreview={(on) => onPreview(on ? selected.festival.key : null)}
          onSkip={() => skip(selected)}
          onUnskip={() => unskip(selected)}
          onTurnOn={() => toggle(selected.festival.key, true)}
          onMessage={(text) => setMessage(selected.festival.key, text)}
        />
      )}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-400">The year ahead</p>
        <div className="overflow-hidden rounded-xl border border-stone-200">
          {months.map((m) => (
            <section key={m.label} aria-label={m.label}>
              <p className="border-b border-stone-100 bg-stone-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                {m.label}
              </p>
              <ul className="divide-y divide-stone-100">
                {m.items.map((o) => {
                  const f = o.festival
                  const Icon = FESTIVAL_ICONS[f.key]
                  const on = isOn(f.key)
                  const skipped = on && !allowed(s, o)
                  const isLive = live?.festival.key === f.key
                  return (
                    <li
                      key={f.key}
                      className={cn('flex items-center gap-3 px-4 py-2.5', selected?.festival.key === f.key && 'bg-endeavour/[0.04]')}
                    >
                      <button
                        type="button"
                        onClick={() => setPicked(f.key)}
                        aria-current={selected?.festival.key === f.key}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-endeavour rounded-lg"
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white',
                            !on && 'opacity-40'
                          )}
                          style={{ background: f.color }}
                          aria-hidden
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={cn('block truncate text-sm font-bold', on ? 'text-stone-900' : 'text-stone-400')}>{f.name}</span>
                          <span className="block text-[11px] text-stone-500">
                            {formatWindow(o)} · {FESTIVAL_KINDS[f.kind]}
                          </span>
                        </span>
                      </button>
                      {isLive && s.auto ? (
                        <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 sm:inline">
                          Live now
                        </span>
                      ) : skipped ? (
                        <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 sm:inline">
                          Skipped this year
                        </span>
                      ) : (
                        <span className="hidden text-[11px] text-stone-400 sm:inline">{on ? relative(o, now) : 'Off'}</span>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={f.name}
                        onClick={() => toggle(f.key, !on)}
                        className={cn(
                          'relative h-6 w-10 flex-shrink-0 rounded-full transition-colors',
                          on ? 'bg-endeavour' : 'bg-stone-200'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow dark:bg-[#e7e5e4] transition-transform',
                            on ? 'translate-x-[18px]' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-400">
          Fonts, layout, photos and your menu never change. Ramadan and Eid follow the expected dates, which can move by a day.
        </p>
      </div>
    </div>
  )
}

// The selected festival up close: its seal, its bar as customers will see it,
// and what the owner can do about it.
const Spotlight = ({
  o,
  s,
  now,
  live,
  previewing,
  onPreview,
  onSkip,
  onUnskip,
  onTurnOn,
  onMessage,
}: {
  o: Occurrence
  s: SeasonalSettings
  now: Date
  live: boolean
  previewing: boolean
  onPreview: (on: boolean) => void
  onSkip: () => void
  onUnskip: () => void
  onTurnOn: () => void
  onMessage: (text: string) => void
}) => {
  const f = o.festival
  const off = s.off.includes(f.key)
  const skipped = !off && !allowed(s, o)
  const onToday = daysUntil(o, now) <= 0
  const bar = barColors(f)
  const custom = s.messages[f.key] ?? ''
  const status = off
    ? 'Off'
    : skipped
      ? 'Skipped this year'
      : live && s.auto
        ? `Live now · until ${o.end.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
        : relative(o, now)

  return (
    <section
      className="grid gap-5 rounded-2xl border border-stone-200 p-5 sm:grid-cols-[auto_minmax(0,1fr)]"
      aria-label={`${f.name} details`}
    >
      <div className="flex justify-center sm:block">
        <FestivalSeal festival={f} year={sealYear(f, o.start)} size={120} className="-rotate-[8deg]" />
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
          <span className={cn(live && s.auto ? 'text-emerald-700' : skipped ? 'text-amber-700' : 'text-stone-400')} role="status">
            {status}
          </span>
          <span className="text-stone-300">·</span>
          <span className="text-stone-400">{FESTIVAL_KINDS[f.kind]}</span>
        </p>
        <h3 className="mt-1 text-xl font-extrabold text-stone-900">{f.name}</h3>
        <p className="text-sm text-stone-500">{formatWindow(o)}</p>

        {s.banner && (
          <div className="mt-4 overflow-hidden rounded-lg" style={{ background: bar.background, color: bar.text }} aria-label="Bar preview">
            <FestivalStripe festival={f} />
            <p className="truncate px-3 py-2 text-center text-xs font-semibold">{messageFor(s, f)}</p>
          </div>
        )}

        <Field
          label="Message on the bar"
          htmlFor={`fest-msg-${f.key}`}
          hint={`${(custom || f.message).length}/${MESSAGE_MAX} · leave empty for ours`}
          className="mt-4"
        >
          <div className="flex gap-2">
            <Input
              id={`fest-msg-${f.key}`}
              value={custom}
              placeholder={f.message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => onMessage(e.target.value)}
            />
            {custom && (
              <Button variant="secondary" icon={RotateCcw} onClick={() => onMessage('')} aria-label="Use the suggested message">
                Reset
              </Button>
            )}
          </div>
        </Field>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={previewing ? EyeOff : Eye} onClick={() => onPreview(!previewing)}>
            {previewing ? 'Stop preview' : 'Preview on the phone'}
          </Button>
          {off ? (
            <Button size="sm" variant="secondary" icon={Undo2} onClick={onTurnOn}>
              Turn back on
            </Button>
          ) : skipped ? (
            <Button size="sm" variant="secondary" icon={Undo2} onClick={onUnskip}>
              Bring it back this year
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onSkip}>
              {onToday ? 'Remove this year' : 'Skip this year'}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
