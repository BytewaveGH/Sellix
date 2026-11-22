'use client'

import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  choiceProblems,
  countOf,
  defaultChoices,
  formatMoney,
  groupRule,
  lineAmount,
  linePrice,
  priceGroup,
  repeatable,
} from '@/lib/eatery/menu'
import type { MenuItem, OrderLineInput, StorefrontBundle } from '@/lib/eatery/types'
import { ItemArt, TagList, ThemeScope } from './theme-scope'

const delta = (n: number, currency: string) => (n === 0 ? '' : `${n > 0 ? '+' : '−'}${formatMoney(Math.abs(n), currency)}`)

// Bottom sheet on phones, centred dialog on larger screens. Rendered in a
// portal, so it re-applies the restaurant's theme itself.
export const ItemSheet = ({
  bundle,
  item,
  now,
  onClose,
  onAdd,
  blocked,
}: {
  bundle: StorefrontBundle
  item: MenuItem | null
  now: Date
  onClose: () => void
  onAdd: (line: OrderLineInput) => void
  // Why ordering is off right now (closed, paused); the sheet stays browsable.
  blocked?: string | null
}) => {
  const { restaurant } = bundle
  const currency = restaurant.currency
  const itemsById = useMemo(() => new Map(bundle.items.map((i) => [i.id, i])), [bundle.items])
  const [choices, setChoices] = useState<Record<string, string[]>>({})
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(1)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!item) return
    setChoices(defaultChoices(item))
    setPicks(Object.fromEntries((item.combo?.slots ?? []).filter((s) => s.choices.length === 1).map((s) => [s.id, s.choices[0].itemId])))
    setNote('')
    setQty(1)
    setTried(false)
  }, [item])

  if (!item) return null
  const problems = choiceProblems(item, choices, picks)
  const price = linePrice(item, choices, picks, bundle.promotions, now)
  const total = lineAmount(price, qty)
  const pricedBy = priceGroup(item)

  const toggle = (groupId: string, choiceId: string, single: boolean, max: number) =>
    setChoices((c) => {
      const cur = c[groupId] ?? []
      if (single) return { ...c, [groupId]: [choiceId] }
      if (cur.includes(choiceId)) return { ...c, [groupId]: cur.filter((x) => x !== choiceId) }
      if (cur.length >= max) return c
      return { ...c, [groupId]: [...cur, choiceId] }
    })

  // Extras taken more than once (Egg × 3): one more, or one less.
  const step = (groupId: string, choiceId: string, by: 1 | -1, max: number) =>
    setChoices((c) => {
      const cur = c[groupId] ?? []
      if (by === 1) return cur.length >= max ? c : { ...c, [groupId]: [...cur, choiceId] }
      const at = cur.lastIndexOf(choiceId)
      return at < 0 ? c : { ...c, [groupId]: cur.filter((_, i) => i !== at) }
    })

  const add = () => {
    setTried(true)
    if (Object.keys(problems).length) {
      document.getElementById(`opt-${Object.keys(problems)[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }
    const clean = Object.fromEntries(Object.entries(choices).filter(([, v]) => v.length))
    onAdd({ itemId: item.id, quantity: qty, choices: clean, comboPicks: item.combo ? picks : undefined, note: note.trim() || undefined })
  }

  return (
    <Dialog.Root open={!!item} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-lg outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-10 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
          aria-describedby={item.description ? 'item-desc' : undefined}
        >
          <ThemeScope
            theme={restaurant.theme}
            className="flex max-h-[92dvh] sm:max-h-[86vh] flex-col overflow-hidden rounded-t-[22px] sm:rounded-[var(--e-radius)] shadow-2xl"
          >
            <div className="relative flex-shrink-0">
              <ItemArt name={item.name} imageUrl={item.imageUrl} theme={restaurant.theme} size="lg" className="h-44 sm:h-52 w-full" />
              <Dialog.Close
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full e-focus"
                style={{ background: 'var(--e-surface)', color: 'var(--e-text)' }}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
              <span className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/70 sm:hidden" aria-hidden />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ background: 'var(--e-surface)' }}>
              <div className="pt-5">
                <Dialog.Title className="e-display text-[30px]">{item.name}</Dialog.Title>
                {item.description && (
                  <Dialog.Description id="item-desc" className="mt-1.5 text-[15px] e-muted leading-relaxed">
                    {item.description}
                  </Dialog.Description>
                )}
                <TagList tags={item.tags} className="mt-2" max={4} />
                {price.promotion && (
                  <p className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-extrabold e-accent">
                    {price.promotion.name}: {price.promotion.percentOff}% off right now
                  </p>
                )}
              </div>

              {(item.combo?.slots ?? []).map((slot) => (
                <fieldset key={slot.id} id={`opt-${slot.id}`} className="mt-6">
                  <legend className="flex w-full items-center justify-between gap-2">
                    <span className="text-base font-extrabold">{slot.name}</span>
                    <span
                      className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', tried && problems[slot.id] ? 'e-accent' : 'e-soft')}
                    >
                      Choose 1
                    </span>
                  </legend>
                  <div className="mt-2 grid gap-2">
                    {slot.choices.map((c) => {
                      const it = itemsById.get(c.itemId)
                      if (!it) return null
                      const off = it.status !== 'available'
                      return (
                        <label key={c.itemId} className="e-choice">
                          <input
                            type="radio"
                            name={`slot-${slot.id}`}
                            className="h-5 w-5 accent-[var(--e-primary)]"
                            checked={picks[slot.id] === c.itemId}
                            disabled={off}
                            onChange={() => setPicks((p) => ({ ...p, [slot.id]: c.itemId }))}
                          />
                          <span className="flex-1 font-semibold">{it.name}</span>
                          <span className="text-sm e-muted">{off ? 'Sold out' : delta(c.upcharge, currency)}</span>
                        </label>
                      )
                    })}
                  </div>
                  {tried && problems[slot.id] && (
                    <p className="mt-1.5 text-sm font-bold" style={{ color: 'var(--e-primary-text)' }} role="alert">
                      {problems[slot.id]}
                    </p>
                  )}
                </fieldset>
              ))}

              {item.optionGroups.map((g) => {
                const single = g.max === 1
                const picked = choices[g.id] ?? []
                const full = !single && picked.length >= g.max
                return (
                  <fieldset key={g.id} id={`opt-${g.id}`} className="mt-6">
                    <legend className="flex w-full items-center justify-between gap-2">
                      <span className="text-base font-extrabold">{g.name}</span>
                      <span
                        className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', tried && problems[g.id] ? 'e-accent' : 'e-soft')}
                      >
                        {groupRule(g)}
                        {g.min > 0 ? ' · required' : ''}
                      </span>
                    </legend>
                    <div className="mt-2 grid gap-2">
                      {g.choices.map((c) => {
                        const checked = picked.includes(c.id)
                        const price = c.soldOut ? 'Sold out' : delta(c.priceDelta, currency)
                        if (!single && repeatable(g)) {
                          const n = countOf(picked, c.id)
                          return (
                            <div key={c.id} className="e-choice" role="group" aria-label={c.name}>
                              <span className="flex-1 font-semibold">{c.name}</span>
                              <span className="text-sm e-muted">{price}</span>
                              <button
                                type="button"
                                onClick={() => step(g.id, c.id, -1, g.max)}
                                disabled={n === 0}
                                className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] e-focus disabled:opacity-40"
                                style={{ borderColor: 'var(--e-border)' }}
                                aria-label={`One less ${c.name}`}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-6 text-center font-extrabold tabular-nums" aria-live="polite" aria-label={`${n} ${c.name}`}>
                                {n}
                              </span>
                              <button
                                type="button"
                                onClick={() => step(g.id, c.id, 1, g.max)}
                                disabled={c.soldOut || full}
                                className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] e-focus disabled:opacity-40"
                                style={{ borderColor: 'var(--e-border)' }}
                                aria-label={`One more ${c.name}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          )
                        }
                        return (
                          <label key={c.id} className="e-choice">
                            <input
                              type={single ? 'radio' : 'checkbox'}
                              name={`group-${g.id}`}
                              className="h-5 w-5 accent-[var(--e-primary)]"
                              checked={checked}
                              disabled={c.soldOut || (!checked && full)}
                              onChange={() => toggle(g.id, c.id, single, g.max)}
                            />
                            <span className="flex-1 font-semibold">{c.name}</span>
                            <span className="text-sm e-muted">
                              {c.soldOut
                                ? 'Sold out'
                                : g === pricedBy
                                  ? formatMoney(c.priceDelta, currency)
                                  : delta(c.priceDelta, currency)}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {tried && problems[g.id] && (
                      <p className="mt-1.5 text-sm font-bold" style={{ color: 'var(--e-primary-text)' }} role="alert">
                        {problems[g.id]}
                      </p>
                    )}
                  </fieldset>
                )
              })}

              <label className="mt-6 block">
                <span className="text-base font-extrabold">Note for the kitchen</span>
                <span className="block text-xs e-muted mb-2">Optional — allergies, “no onions”…</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} className="e-input" rows={2} />
              </label>
            </div>

            <div
              className="flex flex-shrink-0 items-center gap-3 border-t px-5 py-4"
              style={{ background: 'var(--e-surface)', borderColor: 'var(--e-border)' }}
            >
              <div
                className="flex items-center rounded-full border-[1.5px]"
                style={{ borderColor: 'var(--e-border)' }}
                role="group"
                aria-label="Quantity"
              >
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-11 w-11 items-center justify-center e-focus rounded-full"
                  aria-label="One less"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-7 text-center font-extrabold tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  className="flex h-11 w-11 items-center justify-center e-focus rounded-full"
                  aria-label="One more"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button type="button" onClick={add} className="e-btn flex-1 text-base" disabled={!!blocked}>
                {blocked ?? `${restaurant.theme.copy.add} · ${formatMoney(total, currency)}`}
              </button>
            </div>
          </ThemeScope>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
