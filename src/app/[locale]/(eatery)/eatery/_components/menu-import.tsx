'use client'

// Import a section's items from a spreadsheet (CSV) or a pasted list. Saved
// with the usual item endpoints, one item at a time (menu-csv.ts).

import React, { useEffect, useMemo, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/kit/ui'
import { Drawer, Field, Textarea } from '@/components/kit/form'
import { useEateryActions } from '@/lib/eatery/hooks'
import { formatMoney } from '@/lib/eatery/menu'
import { fileNameFor, planMenuImport, SAMPLE_CSV, type PlannedRow } from '@/lib/eatery/menu-csv'
import { downloadCsv } from '@/lib/eatery/sales'
import type { MenuCategory, MenuItem, Restaurant } from '@/lib/eatery/types'

const BADGE: Record<PlannedRow['action'], { label: string; className: string }> = {
  create: { label: 'New', className: 'bg-emerald-50 text-emerald-700' },
  update: { label: 'Update', className: 'bg-sky-50 text-sky-700' },
  same: { label: 'No change', className: 'bg-stone-100 text-stone-500' },
  skip: { label: 'Skipped', className: 'bg-rose-50 text-rose-700' },
}

export const MenuImport = ({
  open,
  onOpenChange,
  restaurant,
  category,
  items,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  restaurant: Restaurant
  category: MenuCategory | null
  // The section's items today.
  items: MenuItem[]
}) => {
  const actions = useEateryActions()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setText('')
    setFileName('')
    actions.clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const plan = useMemo(
    () => (category && text.trim() ? planMenuImport(text, { restaurantId: restaurant.id, categoryId: category.id, items }) : null),
    [text, category, restaurant.id, items]
  )
  const rows = plan?.rows ?? []
  const count = (a: PlannedRow['action']) => rows.filter((r) => r.action === a).length
  const toCreate = rows.flatMap((r) => (r.action === 'create' ? [r.body] : []))
  const toUpdate = rows.flatMap((r) => (r.action === 'update' ? [{ id: r.id, body: r.body }] : []))
  const todo = toCreate.length + toUpdate.length

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setText(await file.text())
  }

  const submit = async () => {
    if (!todo) return
    setSaving(true)
    try {
      if (toCreate.length) await actions.createMany('items', toCreate)
      if (toUpdate.length) await actions.updateMany('items', toUpdate)
      toast.success(
        [toCreate.length && `${toCreate.length} added`, toUpdate.length && `${toUpdate.length} updated`].filter(Boolean).join(', ') +
          ` in ${category?.name}`
      )
      onOpenChange(false)
    } catch {
      // shown in the drawer; items saved before the failure stay saved
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={`Import items into ${category?.name ?? 'section'}`}
      description="From a spreadsheet saved as CSV, or a list you paste. Items already in this section are updated by name."
      error={actions.error ?? (plan?.error ? { message: plan.error } : null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!todo} onClick={() => void submit()}>
            {todo ? `Import ${todo} item${todo === 1 ? '' : 's'}` : 'Import'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 hover:border-endeavour hover:text-endeavour">
            <FileUp className="h-4 w-4" />
            {fileName || 'Choose a file'}
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="sr-only"
              aria-label="Menu file"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            icon={Download}
            onClick={() => downloadCsv(fileNameFor(restaurant.name, 'menu-sample'), SAMPLE_CSV)}
          >
            Sample file
          </Button>
        </div>

        <Field
          label="Or paste your menu"
          htmlFor="menu-paste"
          hint="One item per line with its price, e.g. “Jollof rice 35”. Copied spreadsheet rows work too."
        >
          <Textarea
            id="menu-paste"
            rows={5}
            value={text}
            onChange={(e) => {
              setFileName('')
              setText(e.target.value)
            }}
            placeholder={'Jollof rice 35\nWaakye 25\nKelewele 15'}
          />
        </Field>

        <details className="rounded-xl bg-stone-50 px-4 py-3 text-xs text-stone-600">
          <summary className="cursor-pointer font-semibold text-stone-700">Spreadsheet columns</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
            <li>
              <b>name</b> (needed), <b>price</b>, description, options, tags, status, imageUrl. Export a section to see a filled-in file.
            </li>
            <li>
              <b>options</b>: <code>Size: Regular 5, Maxi 7 | Proteins (extras, up to 10, once per line, more than one of each): Egg 3, Fish 20</code>
            </li>
            <li>A group is pick-one unless its brackets say “extras”. With price 0, the pick-one choices carry the full price.</li>
            <li>Empty cells leave an existing item as it is. Combos keep their combo choices.</li>
          </ul>
        </details>

        {rows.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-stone-700" aria-live="polite">
              {[
                count('create') && `${count('create')} new`,
                count('update') && `${count('update')} to update`,
                count('same') && `${count('same')} unchanged`,
                count('skip') && `${count('skip')} skipped`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200" aria-label="Import preview">
              {rows.map((r) => (
                <li key={`${r.line}-${r.name}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', BADGE[r.action].className)}>{BADGE[r.action].label}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-stone-800">{r.name}</span>
                  <span className="truncate text-xs text-stone-500">
                    {r.action === 'create'
                      ? `${formatMoney(r.body.price, restaurant.currency)}${r.body.optionGroups.length ? ` · ${r.body.optionGroups.map((g) => g.name).join(', ')}` : ''}`
                      : r.action === 'update'
                        ? `Changes ${r.changes.join(', ')}`
                        : r.action === 'skip'
                          ? `Row ${r.line}: ${r.reason}`
                          : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  )
}
