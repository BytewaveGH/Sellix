'use client'

import React, { useState } from 'react'
import { ArrowDown, ArrowUp, BadgePercent, Clock, Download, Layers, Pencil, Plus, Trash2, Upload, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Card, EmptyState, PageHeader, SectionTitle } from '@/components/kit/ui'
import { ConfirmDialog } from '@/components/kit/form'
import { useEateryActions, useNow } from '@/lib/eatery/hooks'
import { formatMoney, itemAvailability, promotionLive, windowLabel } from '@/lib/eatery/menu'
import type { ItemStatus, MenuCategory, MenuItem, Promotion } from '@/lib/eatery/types'
import { ItemArt, ThemeScope } from '@/components/eatery/theme-scope'
import { fromPrice } from '@/components/eatery/menu-view'
import { EateryFrame, RestaurantSwitcher } from '../_components/frame'
import { CategoryForm, ItemForm, PromotionForm } from '../_components/menu-forms'
import { MenuImport } from '../_components/menu-import'
import { fileNameFor, itemsToCsv } from '@/lib/eatery/menu-csv'
import { downloadCsv } from '@/lib/eatery/sales'

const STATUS_CYCLE: { value: ItemStatus; label: string; className: string }[] = [
  { value: 'available', label: 'Available', className: 'bg-emerald-50 text-emerald-700' },
  { value: 'sold-out', label: 'Sold out', className: 'bg-rose-50 text-rose-700' },
  { value: 'hidden', label: 'Hidden', className: 'bg-stone-100 text-stone-500' },
]

type Confirm = { kind: 'category'; row: MenuCategory } | { kind: 'item'; row: MenuItem } | { kind: 'promotion'; row: Promotion }

export default function MenuPage() {
  const now = useNow()
  const actions = useEateryActions()
  const [categoryForm, setCategoryForm] = useState<{ category: MenuCategory | null } | null>(null)
  const [itemForm, setItemForm] = useState<{ item: MenuItem | null; categoryId?: number } | null>(null)
  const [promoForm, setPromoForm] = useState<{ promotion: Promotion | null } | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [importInto, setImportInto] = useState<MenuCategory | null>(null)

  return (
    <EateryFrame>
      {(o) => {
        const r = o.restaurant
        const move = async (list: { id: number; position: number }[], i: number, d: -1 | 1, res: 'categories' | 'items') => {
          const j = i + d
          if (j < 0 || j >= list.length) return
          await Promise.all([
            actions.update(res, list[i].id, { position: list[j].position }),
            actions.update(res, list[j].id, { position: list[i].position }),
          ]).catch(() => {})
        }
        // Positions may repeat after imports; normalise to the index order first.
        const cats = o.categories.map((c, i) => ({ ...c, position: i }))
        return (
          <>
            <PageHeader
              eyebrow={r.name}
              title="Menu"
              description="Sections, items, sizes and extras, combos, sold-out switches and time-based deals."
              actions={
                <>
                  <RestaurantSwitcher o={o} />
                  <Button icon={Plus} onClick={() => setItemForm({ item: null })} disabled={!cats.length}>
                    Add item
                  </Button>
                </>
              }
            />

            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
                <Card className="p-4">
                  <SectionTitle
                    title="Sections"
                    action={
                      <Button size="sm" variant="ghost" icon={Plus} onClick={() => setCategoryForm({ category: null })}>
                        New
                      </Button>
                    }
                  />
                  {cats.length === 0 ? (
                    <p className="text-sm text-stone-500">Add your first section, e.g. “Cocktails” or “Pizzas”.</p>
                  ) : (
                    <ol className="flex flex-col gap-0.5">
                      {cats.map((c, i) => (
                        <li key={c.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                          <a href={`#section-${c.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-700">
                            {c.name}
                            <span className="ml-1.5 text-xs font-normal text-stone-400">
                              {o.items.filter((x) => x.categoryId === c.id).length}
                            </span>
                          </a>
                          <button
                            type="button"
                            aria-label={`Move ${c.name} up`}
                            onClick={() => void move(cats, i, -1, 'categories')}
                            className="h-8 w-7 flex items-center justify-center rounded text-stone-300 hover:text-stone-600"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${c.name} down`}
                            onClick={() => void move(cats, i, 1, 'categories')}
                            className="h-8 w-7 flex items-center justify-center rounded text-stone-300 hover:text-stone-600"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>

                <Card className="p-4">
                  <SectionTitle
                    title="Deals"
                    action={
                      <Button size="sm" variant="ghost" icon={Plus} onClick={() => setPromoForm({ promotion: null })}>
                        New
                      </Button>
                    }
                  />
                  {o.promotions.length === 0 ? (
                    <p className="text-sm text-stone-500">Happy hour, lunch deals… they switch on by themselves.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {o.promotions.map((p) => {
                        const live = promotionLive(p, now)
                        return (
                          <li key={p.id} className="rounded-xl border border-stone-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <button type="button" onClick={() => setPromoForm({ promotion: p })} className="text-left">
                                <p className="text-sm font-bold text-stone-900 inline-flex items-center gap-1.5">
                                  <BadgePercent className="h-4 w-4 text-amber-500" /> {p.name} · {p.percentOff}%
                                </p>
                                <p className="text-xs text-stone-500">{p.schedule.map(windowLabel).join(', ')}</p>
                              </button>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                                  live
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : p.active
                                      ? 'bg-stone-100 text-stone-500'
                                      : 'bg-rose-50 text-rose-600'
                                )}
                              >
                                {live ? 'On now' : p.active ? 'Scheduled' : 'Paused'}
                              </span>
                            </div>
                            <div className="mt-1 flex justify-end">
                              <button
                                type="button"
                                aria-label={`Delete ${p.name}`}
                                onClick={() => setConfirm({ kind: 'promotion', row: p })}
                                className="text-[11px] font-semibold text-stone-400 hover:text-rose-600"
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Card>
              </aside>

              <div className="flex flex-col gap-4">
                {cats.length === 0 && (
                  <EmptyState
                    icon={UtensilsCrossed}
                    title="Your menu is empty"
                    description="Create sections first, then add items with their sizes, extras and prices."
                    action={
                      <Button icon={Plus} onClick={() => setCategoryForm({ category: null })}>
                        Add a section
                      </Button>
                    }
                  />
                )}
                {cats.map((c) => {
                  const list = o.items.filter((x) => x.categoryId === c.id).map((x, i) => ({ ...x, position: i }))
                  return (
                    <Card key={c.id} id={`section-${c.id}`} className="p-4 sm:p-5 scroll-mt-24">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <h2 className="text-lg font-extrabold text-stone-900">{c.name}</h2>
                          <p className="text-xs text-stone-500">
                            {c.description}
                            {c.schedule?.length ? (
                              <span className="inline-flex items-center gap-1 ml-1">
                                <Clock className="h-3 w-3" /> {c.schedule.map(windowLabel).join(', ')}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Upload}
                            aria-label={`Import items into ${c.name}`}
                            onClick={() => setImportInto(c)}
                          >
                            Import
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Download}
                            aria-label={`Export ${c.name}`}
                            disabled={!list.length}
                            onClick={() => downloadCsv(fileNameFor(r.name, c.name), itemsToCsv(list))}
                          >
                            Export
                          </Button>
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setCategoryForm({ category: c })}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => setConfirm({ kind: 'category', row: c })}
                          >
                            Delete
                          </Button>
                          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setItemForm({ item: null, categoryId: c.id })}>
                            Item
                          </Button>
                        </div>
                      </div>
                      {list.length === 0 ? (
                        <p className="py-6 text-center text-sm text-stone-400">No items in this section yet.</p>
                      ) : (
                        <ThemeScope theme={r.theme} className="!bg-transparent !text-inherit">
                          <ul className="divide-y divide-stone-100">
                            {list.map((it, i) => {
                              const a = itemAvailability(it, c, now)
                              const status = STATUS_CYCLE.find((s) => s.value === it.status)!
                              return (
                                <li
                                  key={it.id}
                                  className="flex items-center gap-3 py-3"
                                  style={{ fontFamily: 'var(--font-mulish), system-ui, sans-serif', color: '#1c1917' }}
                                >
                                  <ItemArt
                                    name={it.name}
                                    imageUrl={it.imageUrl}
                                    theme={r.theme}
                                    size="sm"
                                    className="h-12 w-12 flex-shrink-0 rounded-xl"
                                  />
                                  <button type="button" onClick={() => setItemForm({ item: it })} className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-sm font-bold text-stone-900">
                                      {it.name}
                                      {it.combo && (
                                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 align-middle">
                                          <Layers className="h-3 w-3" /> Combo
                                        </span>
                                      )}
                                    </p>
                                    <p className="truncate text-xs text-stone-500">
                                      {formatMoney(fromPrice(it), r.currency)}
                                      {it.optionGroups.length ? ` · ${it.optionGroups.map((g) => g.name).join(', ')}` : ''}
                                      {!a.orderable && a.reason === 'not-now' ? ` · ${a.label}` : ''}
                                    </p>
                                  </button>
                                  <button
                                    type="button"
                                    title="Change availability"
                                    aria-label={`${it.name}: ${status.label}. Change availability`}
                                    onClick={() => {
                                      const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length].value
                                      void actions.update('items', it.id, { status: next }).catch(() => {})
                                    }}
                                    className={cn('h-8 rounded-full px-3 text-[11px] font-bold', status.className)}
                                  >
                                    {status.label}
                                  </button>
                                  <div className="hidden sm:flex">
                                    <button
                                      type="button"
                                      aria-label={`Move ${it.name} up`}
                                      onClick={() => void move(list, i, -1, 'items')}
                                      className="h-8 w-7 flex items-center justify-center text-stone-300 hover:text-stone-600"
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Move ${it.name} down`}
                                      onClick={() => void move(list, i, 1, 'items')}
                                      className="h-8 w-7 flex items-center justify-center text-stone-300 hover:text-stone-600"
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${it.name}`}
                                    onClick={() => setConfirm({ kind: 'item', row: it })}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg text-stone-300 hover:text-rose-600 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </ThemeScope>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>

            <CategoryForm
              open={!!categoryForm}
              onOpenChange={(v) => !v && setCategoryForm(null)}
              restaurant={r}
              category={categoryForm?.category ?? null}
              nextPosition={cats.length}
            />
            <ItemForm
              open={!!itemForm}
              onOpenChange={(v) => !v && setItemForm(null)}
              restaurant={r}
              categories={cats}
              items={o.items}
              item={itemForm?.item ?? null}
              categoryId={itemForm?.categoryId}
            />
            <MenuImport
              open={!!importInto}
              onOpenChange={(v) => !v && setImportInto(null)}
              restaurant={r}
              category={importInto}
              items={importInto ? o.items.filter((x) => x.categoryId === importInto.id) : []}
            />
            <PromotionForm
              open={!!promoForm}
              onOpenChange={(v) => !v && setPromoForm(null)}
              restaurant={r}
              categories={cats}
              promotion={promoForm?.promotion ?? null}
            />
            <ConfirmDialog
              open={!!confirm}
              onOpenChange={(v) => !v && setConfirm(null)}
              title={`Delete ${confirm?.row.name ?? ''}?`}
              description={
                confirm?.kind === 'category'
                  ? `Its ${o.items.filter((x) => x.categoryId === confirm.row.id).length} items are deleted too. Past orders keep their details.`
                  : confirm?.kind === 'item'
                    ? 'It’s removed from the menu and from any combo that offered it. Past orders keep their details.'
                    : 'The deal stops applying straight away.'
              }
              onConfirm={() =>
                confirm
                  ? actions.remove(
                      confirm.kind === 'category' ? 'categories' : confirm.kind === 'item' ? 'items' : 'promotions',
                      confirm.row.id
                    )
                  : undefined
              }
            />
          </>
        )
      }}
    </EateryFrame>
  )
}
