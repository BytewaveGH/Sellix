'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/kit/ui'
import { Drawer, Field, FormGrid, FormSection, Input, Segmented, Select, Textarea, Toggle, toNum } from '@/components/kit/form'
import { useEateryActions } from '@/lib/eatery/hooks'
import { DAY_SHORT, formatMoney, groupRule, priceGroup, round2 } from '@/lib/eatery/menu'
import { ALL_OPTION_TEMPLATES, optionGroupFromTemplate, presetFor, uid } from '@/lib/eatery/presets'
import type {
  ComboSlot,
  ItemStatus,
  ItemTag,
  MenuCategory,
  MenuItem,
  OptionGroup,
  Promotion,
  Restaurant,
  TimeWindow,
} from '@/lib/eatery/types'
import { ItemArt, TAGS, ThemeScope } from '@/components/eatery/theme-scope'
import { ImageField } from './image-field'
import { fromPrice } from '@/components/eatery/menu-view'

// ── Time windows ──

export const ScheduleEditor = ({
  value,
  onChange,
  label = 'Time window',
}: {
  value: TimeWindow[]
  onChange: (v: TimeWindow[]) => void
  label?: string
}) => (
  <div className="flex flex-col gap-3">
    {value.map((w, i) => (
      <div key={i} className="rounded-xl border border-stone-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1" role="group" aria-label={`${label} ${i + 1} days`}>
            {DAY_SHORT.map((d, day) => {
              const on = w.days.includes(day)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={d}
                  onClick={() =>
                    onChange(
                      value.map((x, j) => (j === i ? { ...x, days: on ? x.days.filter((y) => y !== day) : [...x.days, day].sort() } : x))
                    )
                  }
                  className={cn(
                    'h-9 w-9 rounded-lg text-xs font-bold',
                    on ? 'bg-endeavour text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                  )}
                >
                  {d[0]}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="From" htmlFor={`w-${i}-from`}>
            <Input
              id={`w-${i}-from`}
              type="time"
              value={w.from}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
            />
          </Field>
          <Field label="Until" htmlFor={`w-${i}-to`} hint={w.to <= w.from ? 'Runs past midnight' : undefined}>
            <Input
              id={`w-${i}-to`}
              type="time"
              value={w.to}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
            />
          </Field>
        </div>
      </div>
    ))}
    <Button
      variant="secondary"
      size="sm"
      icon={Plus}
      className="self-start"
      onClick={() => onChange([...value, { days: [1, 2, 3, 4, 5], from: '17:00', to: '19:00' }])}
    >
      Add a time window
    </Button>
  </div>
)

const scheduleProblem = (ws: TimeWindow[]) =>
  ws.some((w) => w.days.length === 0)
    ? 'Pick at least one day for each window'
    : ws.some((w) => w.from === w.to)
      ? 'A window needs different start and end times'
      : null

// ── Section ──

export const CategoryForm = ({
  open,
  onOpenChange,
  restaurant,
  category,
  nextPosition,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  restaurant: Restaurant
  category: MenuCategory | null
  nextPosition: number
}) => {
  const actions = useEateryActions()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [timed, setTimed] = useState(false)
  const [schedule, setSchedule] = useState<TimeWindow[]>([])
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setDescription(category?.description ?? '')
    setTimed(!!category?.schedule?.length)
    setSchedule(category?.schedule ?? [{ days: [0, 1, 2, 3, 4, 5, 6], from: '07:00', to: '11:30' }])
    setTried(false)
    actions.clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category])

  const problem = !name.trim() ? 'Give the section a name' : timed ? scheduleProblem(schedule) : null
  const submit = async () => {
    setTried(true)
    if (problem) return
    setSaving(true)
    const body = { name: name.trim(), description: description.trim() || undefined, schedule: timed ? schedule : undefined }
    try {
      if (category) await actions.update('categories', category.id, body)
      else await actions.create('categories', { ...body, restaurantId: restaurant.id, position: nextPosition })
      onOpenChange(false)
    } catch {
      // shown in the drawer
    } finally {
      setSaving(false)
    }
  }
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={category ? `Edit ${category.name}` : 'New menu section'}
      error={actions.error ?? (tried && problem ? { message: problem } : null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {category ? 'Save' : 'Add section'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[13px] font-semibold text-stone-700 mb-2">
            Suggestions for a {presetFor(restaurant.category).label.toLowerCase()}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {presetFor(restaurant.category).sections.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setName(s.name)}
                className="h-8 rounded-full border border-stone-200 px-3 text-xs font-semibold text-stone-600 hover:border-endeavour hover:text-endeavour"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <Field label="Section name" htmlFor="cat-name">
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Signature cocktails" />
        </Field>
        <Field label="Short description" htmlFor="cat-desc" hint="Optional, shown under the heading">
          <Input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Toggle
          checked={timed}
          onChange={setTimed}
          label="Only at certain times"
          hint="e.g. breakfast until 11:30 — outside these times the items show but can’t be ordered"
        />
        {timed && <ScheduleEditor value={schedule} onChange={setSchedule} />}
      </div>
    </Drawer>
  )
}

// ── Item ──

const TAG_KEYS = Object.keys(TAGS) as ItemTag[]

const OptionGroupEditor = ({
  group,
  onChange,
  onRemove,
  onMove,
  currency,
  pricing,
  onPricing,
  stacked,
}: {
  group: OptionGroup
  onChange: (g: OptionGroup) => void
  onRemove: () => void
  onMove: (d: -1 | 1) => void
  currency: string
  // Only on the item's first pick-one group: does it hold the full prices?
  pricing?: 'own' | 'add'
  onPricing?: (p: 'own' | 'add') => void
  // A second required group with prices while another group already holds the
  // full prices: both are charged, which is rarely what the owner meant.
  stacked?: { into: string; total: string; onMerge: () => void }
}) => {
  const single = group.kind === 'variant'
  const own = pricing === 'own'
  const symbol = currency === 'GHS' ? '₵' : currency
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            aria-label="Option group name"
            value={group.name}
            onChange={(e) => onChange({ ...group, name: e.target.value })}
            placeholder="e.g. Size"
            className="font-semibold"
          />
        </div>
        <button
          type="button"
          onClick={() => onMove(-1)}
          aria-label={`Move ${group.name} up`}
          className="h-10 w-9 flex items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          aria-label={`Move ${group.name} down`}
          className="h-10 w-9 flex items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${group.name || 'group'}`}
          className="h-10 w-9 flex items-center justify-center rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Segmented
          ariaLabel={`${group.name} type`}
          value={group.kind}
          onChange={(kind) =>
            onChange({
              ...group,
              kind,
              ...(kind === 'variant'
                ? { min: 1, max: 1, chargeOnce: undefined }
                : { min: 0, max: Math.max(1, Math.min(group.choices.length, 3)) }),
            })
          }
          options={[
            { value: 'variant', label: 'Pick one (size, crust…)' },
            { value: 'addon', label: 'Extras (toppings…)' },
          ]}
        />
        {!single && (
          <>
            <Field label="Min" htmlFor={`${group.id}-min`} className="w-20">
              <Input
                id={`${group.id}-min`}
                type="number"
                min={0}
                value={group.min}
                onChange={(e) => onChange({ ...group, min: Math.max(0, toNum(e.target.value)) })}
              />
            </Field>
            <Field label="Max" htmlFor={`${group.id}-max`} className="w-20">
              <Input
                id={`${group.id}-max`}
                type="number"
                min={1}
                value={group.max}
                onChange={(e) => onChange({ ...group, max: Math.max(1, toNum(e.target.value, 1)) })}
              />
            </Field>
          </>
        )}
      </div>
      {!single && (
        <div className="mt-2">
          <Segmented
            ariaLabel={`${group.name || 'Group'} charged`}
            value={group.chargeOnce ? 'once' : 'each'}
            onChange={(v) => onChange({ ...group, chargeOnce: v === 'once' ? true : undefined })}
            options={[
              { value: 'each', label: 'Charged for every portion' },
              { value: 'once', label: 'Charged once per line' },
            ]}
          />
          <p className="mt-1 text-[11px] text-stone-500">
            {group.chargeOnce
              ? 'Quantity 4 with one extra: the item is charged 4 times, the extra once (e.g. TZ × 4 + one fish).'
              : 'Quantity 4 with one extra: the item and the extra are both charged 4 times (e.g. 4 pizzas, each with cheese).'}
          </p>
        </div>
      )}
      {pricing && onPricing && (
        <div className="mt-2">
          <Segmented
            ariaLabel={`${group.name || 'Group'} pricing`}
            value={pricing}
            onChange={onPricing}
            options={[
              { value: 'own', label: 'Each has its own price' },
              { value: 'add', label: 'Adds to the item price' },
            ]}
          />
        </div>
      )}
      {stacked && (
        <div role="note" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>
            Customers must pick from “{stacked.into}” <b>and</b> from this group, so both prices are charged (from {stacked.total}). If
            these are more choices of the same thing, put them in one group. If they cost extra, enter only the extra amount.
          </p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={stacked.onMerge}>
            Move these choices into “{stacked.into}”
          </Button>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-stone-500">
        Customers see: “{groupRule(group)}
        {group.min > 0 ? ' · required' : ''}”
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {group.choices.map((c) => (
          <li key={c.id} className="grid grid-cols-[1fr_110px_auto_auto] items-center gap-2">
            <Input
              aria-label="Choice name"
              value={c.name}
              onChange={(e) =>
                onChange({ ...group, choices: group.choices.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })
              }
            />
            <Input
              aria-label={own ? `${c.name} price` : `${c.name} price change`}
              type="number"
              step="any"
              min={own ? 0 : undefined}
              prefix={own ? symbol : '±'}
              value={c.priceDelta}
              onChange={(e) =>
                onChange({ ...group, choices: group.choices.map((x) => (x.id === c.id ? { ...x, priceDelta: toNum(e.target.value) } : x)) })
              }
            />
            <button
              type="button"
              aria-pressed={!!c.soldOut}
              onClick={() => onChange({ ...group, choices: group.choices.map((x) => (x.id === c.id ? { ...x, soldOut: !x.soldOut } : x)) })}
              className={cn(
                'h-10 rounded-lg px-2 text-[11px] font-bold',
                c.soldOut ? 'bg-rose-50 text-rose-700' : 'text-stone-400 hover:bg-stone-100'
              )}
            >
              {c.soldOut ? 'Sold out' : 'In stock'}
            </button>
            <button
              type="button"
              aria-label={`Remove ${c.name}`}
              onClick={() => onChange({ ...group, choices: group.choices.filter((x) => x.id !== c.id) })}
              className="h-10 w-9 flex items-center justify-center rounded-lg text-stone-400 hover:text-rose-600"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        icon={Plus}
        className="mt-1"
        onClick={() => onChange({ ...group, choices: [...group.choices, { id: uid('c'), name: '', priceDelta: 0 }] })}
      >
        Add choice
      </Button>
      {own ? (
        <p className="text-[11px] text-stone-400">
          Customers pay the price of the choice they pick. The first one in stock is picked for them.
        </p>
      ) : (
        group.choices.some((c) => c.priceDelta) && (
          <p className="text-[11px] text-stone-400">
            Prices are added to the item price ({symbol}); use a negative number for a smaller size.
          </p>
        )
      )}
    </div>
  )
}

const groupProblem = (g: OptionGroup) =>
  !g.name.trim()
    ? 'Every option group needs a name'
    : g.choices.length === 0 || g.choices.some((c) => !c.name.trim())
      ? `“${g.name}” needs named choices`
      : g.min > g.max
        ? `“${g.name}”: minimum is more than maximum`
        : g.max > g.choices.length
          ? `“${g.name}”: maximum is more than the number of choices`
          : null

export const ItemForm = ({
  open,
  onOpenChange,
  restaurant,
  categories,
  items,
  item,
  categoryId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  restaurant: Restaurant
  categories: MenuCategory[]
  items: MenuItem[]
  item: MenuItem | null
  categoryId?: number
}) => {
  const actions = useEateryActions()
  const blank = (): Omit<MenuItem, 'id'> => ({
    restaurantId: restaurant.id,
    categoryId: categoryId ?? categories[0]?.id ?? 0,
    name: '',
    description: '',
    price: 0,
    tags: [],
    optionGroups: [],
    status: 'available',
    position: items.filter((i) => i.categoryId === (categoryId ?? categories[0]?.id)).length,
  })
  const [draft, setDraft] = useState<Omit<MenuItem, 'id'>>(blank)
  const [timed, setTimed] = useState(false)
  const [isCombo, setIsCombo] = useState(false)
  const [template, setTemplate] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ownPrice, setOwnPrice] = useState(false)

  useEffect(() => {
    if (!open) return
    const d = item ? (JSON.parse(JSON.stringify(item)) as MenuItem) : blank()
    setDraft(d)
    setOwnPrice(!!priceGroup(d)?.choices.some((c) => c.priceDelta > 0))
    setTimed(!!d.schedule?.length)
    setIsCombo(!!d.combo)
    setTemplate('')
    setTried(false)
    actions.clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item])

  const set = (patch: Partial<Omit<MenuItem, 'id'>>) => setDraft((d) => ({ ...d, ...patch }))
  const preset = presetFor(restaurant.category)
  const templates = useMemo(() => {
    const own = preset.optionTemplates.map((t) => ({
      value: `own:${t.key}`,
      label: `${t.name} — ${t.choices
        .map((c) => c.name)
        .slice(0, 3)
        .join(', ')}…`,
    }))
    const other = ALL_OPTION_TEMPLATES.filter((t) => !preset.optionTemplates.some((o) => o.key === t.key)).map((t) => ({
      value: `all:${t.key}`,
      label: `${t.name} (${t.from})`,
    }))
    return [...own, ...other]
  }, [preset])
  const comboCandidates = items.filter((i) => !i.combo && i.id !== (item?.id ?? -1))
  const slots = draft.combo?.slots ?? []

  const problems = [
    !draft.name.trim() && 'Give the item a name',
    !(draft.price >= 0) && 'Price can’t be negative',
    !draft.categoryId && 'Choose a section',
    ...draft.optionGroups.map(groupProblem),
    isCombo && slots.length === 0 && 'A combo needs at least one choice (e.g. main, side, drink)',
    ...(isCombo
      ? slots.map((s) =>
          !s.name.trim() ? 'Every combo choice needs a name' : s.choices.length === 0 ? `Pick items for “${s.name}”` : null
        )
      : []),
    timed && scheduleProblem(draft.schedule ?? []),
  ].filter(Boolean) as string[]

  const submit = async () => {
    setTried(true)
    if (problems.length) return
    setSaving(true)
    const body = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      imageUrl: draft.imageUrl?.trim() || undefined,
      schedule: timed ? draft.schedule : undefined,
      combo: isCombo ? { slots } : undefined,
    }
    try {
      if (item) await actions.update('items', item.id, body)
      else await actions.create('items', body)
      onOpenChange(false)
    } catch {
      // shown in the drawer
    } finally {
      setSaving(false)
    }
  }

  const setSlots = (s: ComboSlot[]) => set({ combo: { slots: s } })

  // "Each has its own price" keeps the item at 0 and the full prices on the
  // choices, so the cart maths is unchanged. Switching moves the cheapest
  // price between the item and the choices; what customers pay stays the same.
  const firstPick = isCombo ? undefined : draft.optionGroups.find((g) => g.min >= 1 && g.max === 1)
  const pricedBy = ownPrice && draft.price === 0 ? firstPick : undefined
  const setPricing = (mode: 'own' | 'add') => {
    if (!firstPick) return
    const live = firstPick.choices.filter((c) => !c.soldOut)
    const shift = mode === 'own' ? draft.price : -Math.min(...(live.length ? live : firstPick.choices).map((c) => c.priceDelta))
    set({
      price: mode === 'own' ? 0 : -shift,
      optionGroups: draft.optionGroups.map((g) =>
        g.id === firstPick.id ? { ...g, choices: g.choices.map((c) => ({ ...c, priceDelta: round2(c.priceDelta + shift) })) } : g
      ),
    })
    setOwnPrice(mode === 'own')
  }
  const shownFrom = fromPrice({ ...draft, id: 0, combo: isCombo ? draft.combo : undefined } as MenuItem)
  const stackedOn = (g: OptionGroup) =>
    pricedBy && g !== pricedBy && g.min > 0 && g.choices.length > 0 && Math.min(...g.choices.map((c) => c.priceDelta)) > 0
      ? {
          into: pricedBy.name.trim() || 'the first group',
          total: formatMoney(shownFrom, restaurant.currency),
          onMerge: () =>
            set({
              optionGroups: draft.optionGroups
                .filter((x) => x.id !== g.id)
                .map((x) => (x.id === pricedBy.id ? { ...x, choices: [...x.choices, ...g.choices] } : x)),
            }),
        }
      : undefined

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={item ? `Edit ${item.name}` : 'New menu item'}
      description={`Customers pay from ${formatMoney(shownFrom, restaurant.currency)}`}
      error={actions.error ?? (tried && problems.length ? { message: problems[0] } : null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {item ? 'Save item' : 'Add to menu'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        <FormSection title="Basics">
          <Segmented
            ariaLabel="Item type"
            value={isCombo ? 'combo' : 'single'}
            onChange={(v) => {
              setIsCombo(v === 'combo')
              if (v === 'combo' && !draft.combo) set({ combo: { slots: [] } })
            }}
            options={[
              { value: 'single', label: 'Single item' },
              { value: 'combo', label: 'Combo / meal deal' },
            ]}
          />
          <FormGrid>
            <Field label="Name" htmlFor="it-name">
              <Input
                id="it-name"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={restaurant.menuKind === 'drinks' ? 'e.g. Passion Fruit Mojito' : 'e.g. Pepperoni Feast'}
              />
            </Field>
            {pricedBy ? (
              <Field label="Price" hint="Set on each choice below">
                <p className="flex h-10 items-center text-sm font-semibold text-stone-700">
                  {`From ${formatMoney(shownFrom, restaurant.currency)} · by ${pricedBy.name.trim().toLowerCase() || 'choice'}`}
                </p>
              </Field>
            ) : (
              <Field
                label={isCombo ? 'Combo price' : 'Price'}
                htmlFor="it-price"
                hint={
                  !isCombo && shownFrom === 0
                    ? 'Customers will see this item as free'
                    : firstPick
                      ? 'For the first size/choice; options add to it'
                      : undefined
                }
              >
                <Input
                  id="it-price"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  prefix={restaurant.currency === 'GHS' ? '₵' : undefined}
                  value={draft.price}
                  onChange={(e) => set({ price: toNum(e.target.value) })}
                />
              </Field>
            )}
            <Field label="Section" htmlFor="it-cat">
              <Select
                id="it-cat"
                value={draft.categoryId}
                onChange={(e) => set({ categoryId: Number(e.target.value) })}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
          </FormGrid>
          <ImageField
            kind="item"
            label="Photo"
            hint="Optional · cropped square, 720 px"
            value={draft.imageUrl}
            onChange={(imageUrl) => set({ imageUrl })}
            upload={(file) => actions.uploadImage(restaurant.id, file, 'item')}
            fallback={
              <ThemeScope theme={restaurant.theme} className="h-full w-full">
                <ItemArt name={draft.name || 'New item'} theme={restaurant.theme} size="sm" className="h-full w-full" />
              </ThemeScope>
            }
          />
          <Field label="Description" htmlFor="it-desc">
            <Textarea
              id="it-desc"
              value={draft.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What’s in it, how it’s made"
            />
          </Field>
          <div>
            <p className="text-[13px] font-semibold text-stone-700 mb-2">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {TAG_KEYS.map((t) => {
                const on = draft.tags.includes(t)
                const T = TAGS[t]
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ tags: on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })}
                    className={cn(
                      'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold',
                      on ? 'border-endeavour bg-endeavour/10 text-endeavour' : 'border-stone-200 text-stone-600 hover:border-stone-300'
                    )}
                  >
                    <T.icon className="h-3.5 w-3.5" /> {T.label}
                  </button>
                )
              })}
            </div>
          </div>
        </FormSection>

        {isCombo && (
          <FormSection title="What’s in the combo">
            <p className="text-xs text-stone-500 -mt-2">Customers pick one item for each choice. Add an upcharge for premium picks.</p>
            {slots.map((s, si) => (
              <div key={s.id} className="rounded-xl border border-stone-200 p-3">
                <div className="flex gap-2">
                  <Input
                    aria-label="Combo choice name"
                    value={s.name}
                    onChange={(e) => setSlots(slots.map((x, j) => (j === si ? { ...x, name: e.target.value } : x)))}
                    placeholder="e.g. Drink"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${s.name || 'choice'}`}
                    onClick={() => setSlots(slots.filter((_, j) => j !== si))}
                    className="h-11 w-10 flex items-center justify-center rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {comboCandidates.map((ci) => {
                    const picked = s.choices.find((c) => c.itemId === ci.id)
                    return (
                      <li key={ci.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-stone-50">
                        <label className="flex flex-1 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-endeavour"
                            checked={!!picked}
                            onChange={() =>
                              setSlots(
                                slots.map((x, j) =>
                                  j !== si
                                    ? x
                                    : {
                                        ...x,
                                        choices: picked
                                          ? x.choices.filter((c) => c.itemId !== ci.id)
                                          : [...x.choices, { itemId: ci.id, upcharge: 0 }],
                                      }
                                )
                              )
                            }
                          />
                          {ci.name}
                        </label>
                        {picked && (
                          <input
                            aria-label={`${ci.name} upcharge`}
                            type="number"
                            min={0}
                            step="any"
                            value={picked.upcharge}
                            onChange={(e) =>
                              setSlots(
                                slots.map((x, j) =>
                                  j !== si
                                    ? x
                                    : {
                                        ...x,
                                        choices: x.choices.map((c) => (c.itemId === ci.id ? { ...c, upcharge: toNum(e.target.value) } : c)),
                                      }
                                )
                              )
                            }
                            className="h-8 w-20 rounded-lg border border-stone-200 px-2 text-sm"
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              className="self-start"
              onClick={() => setSlots([...slots, { id: uid('s'), name: '', choices: [] }])}
            >
              Add a choice (main, side, drink…)
            </Button>
          </FormSection>
        )}

        <FormSection title="Options">
          <p className="text-xs text-stone-500 -mt-2">
            Sizes, crusts, proteins, sauces, ice, mixers, milk… Start from a template and adjust.
          </p>
          {draft.optionGroups.map((g, gi) => (
            <OptionGroupEditor
              key={g.id}
              group={g}
              currency={restaurant.currency}
              pricing={g === firstPick ? (pricedBy ? 'own' : 'add') : undefined}
              onPricing={setPricing}
              stacked={stackedOn(g)}
              onChange={(ng) => set({ optionGroups: draft.optionGroups.map((x) => (x.id === g.id ? ng : x)) })}
              onRemove={() => set({ optionGroups: draft.optionGroups.filter((x) => x.id !== g.id) })}
              onMove={(d) => {
                const next = [...draft.optionGroups]
                const j = gi + d
                if (j < 0 || j >= next.length) return
                ;[next[gi], next[j]] = [next[j], next[gi]]
                set({ optionGroups: next })
              }}
            />
          ))}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Select
                aria-label="Option template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Add from a template…"
                options={templates}
              />
            </div>
            <Button
              variant="secondary"
              icon={Plus}
              disabled={!template}
              onClick={() => {
                const key = template.split(':')[1]
                const t = ALL_OPTION_TEMPLATES.find((x) => x.key === key)
                if (t) set({ optionGroups: [...draft.optionGroups, optionGroupFromTemplate(t)] })
                setTemplate('')
              }}
            >
              Add
            </Button>
            <Button
              variant="ghost"
              icon={Plus}
              onClick={() => {
                // The first custom group is usually the type or size; later ones are extras.
                const pick = !isCombo && !firstPick
                set({
                  optionGroups: [
                    ...draft.optionGroups,
                    {
                      id: uid('g'),
                      name: '',
                      kind: pick ? 'variant' : 'addon',
                      min: pick ? 1 : 0,
                      max: 1,
                      choices: [{ id: uid('c'), name: '', priceDelta: 0 }],
                    },
                  ],
                })
                if (pick && draft.price === 0) setOwnPrice(true)
              }}
            >
              Custom group
            </Button>
          </div>
        </FormSection>

        <FormSection title="Availability">
          <Segmented<ItemStatus>
            ariaLabel="Availability"
            value={draft.status}
            onChange={(status) => set({ status })}
            options={[
              { value: 'available', label: 'Available' },
              { value: 'sold-out', label: 'Sold out' },
              { value: 'hidden', label: 'Hidden' },
            ]}
          />
          <Toggle
            checked={timed}
            onChange={(v) => {
              setTimed(v)
              if (v && !draft.schedule?.length) set({ schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '17:00', to: '23:00' }] })
            }}
            label="Only at certain times"
            hint="e.g. a late-night special after 9pm"
          />
          {timed && <ScheduleEditor value={draft.schedule ?? []} onChange={(schedule) => set({ schedule })} />}
        </FormSection>
      </div>
    </Drawer>
  )
}

// ── Promotion ──

export const PromotionForm = ({
  open,
  onOpenChange,
  restaurant,
  categories,
  promotion,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  restaurant: Restaurant
  categories: MenuCategory[]
  promotion: Promotion | null
}) => {
  const actions = useEateryActions()
  const blank = (): Omit<Promotion, 'id'> => ({
    restaurantId: restaurant.id,
    name: restaurant.menuKind === 'drinks' ? 'Happy hour' : 'Deal',
    description: '',
    percentOff: 20,
    schedule: [{ days: [1, 2, 3, 4, 5], from: '17:00', to: '19:00' }],
    categoryIds: [],
    itemIds: [],
    active: true,
  })
  const [draft, setDraft] = useState<Omit<Promotion, 'id'>>(blank)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setDraft(promotion ? JSON.parse(JSON.stringify(promotion)) : blank())
    setTried(false)
    actions.clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promotion])
  const set = (p: Partial<Omit<Promotion, 'id'>>) => setDraft((d) => ({ ...d, ...p }))
  const problem = !draft.name.trim()
    ? 'Give the deal a name'
    : !(draft.percentOff >= 1 && draft.percentOff <= 90)
      ? 'Discount must be between 1% and 90%'
      : draft.schedule.length === 0
        ? 'Add when it runs'
        : scheduleProblem(draft.schedule)

  const submit = async () => {
    setTried(true)
    if (problem) return
    setSaving(true)
    try {
      if (promotion) await actions.update('promotions', promotion.id, draft)
      else await actions.create('promotions', draft)
      onOpenChange(false)
    } catch {
      // shown in the drawer
    } finally {
      setSaving(false)
    }
  }
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={promotion ? `Edit ${promotion.name}` : 'New time-based deal'}
      description="Discounts that switch on by themselves — happy hour, lunch deals, late-night slices."
      error={actions.error ?? (tried && problem ? { message: problem } : null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {promotion ? 'Save deal' : 'Create deal'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormGrid>
          <Field label="Name" htmlFor="pr-name">
            <Input id="pr-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Discount (%)" htmlFor="pr-pct">
            <Input
              id="pr-pct"
              type="number"
              min={1}
              max={90}
              value={draft.percentOff}
              onChange={(e) => set({ percentOff: toNum(e.target.value) })}
            />
          </Field>
        </FormGrid>
        <Field label="Shown to customers" htmlFor="pr-desc" hint="Optional">
          <Input
            id="pr-desc"
            value={draft.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="25% off all cocktails"
          />
        </Field>
        <div>
          <p className="text-[13px] font-semibold text-stone-700 mb-2">Applies to</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={draft.categoryIds.length === 0}
              onClick={() => set({ categoryIds: [] })}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-semibold',
                draft.categoryIds.length === 0 ? 'border-endeavour bg-endeavour/10 text-endeavour' : 'border-stone-200 text-stone-600'
              )}
            >
              Whole menu
            </button>
            {categories.map((c) => {
              const on = draft.categoryIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ categoryIds: on ? draft.categoryIds.filter((x) => x !== c.id) : [...draft.categoryIds, c.id] })}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-semibold',
                    on ? 'border-endeavour bg-endeavour/10 text-endeavour' : 'border-stone-200 text-stone-600'
                  )}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-stone-700 mb-2">When it runs</p>
          <ScheduleEditor value={draft.schedule} onChange={(schedule) => set({ schedule })} label="Deal window" />
        </div>
        <Toggle checked={draft.active} onChange={(active) => set({ active })} label="Active" hint="Switch off to pause without deleting" />
      </div>
    </Drawer>
  )
}
