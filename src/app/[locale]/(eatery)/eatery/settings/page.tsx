'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Printer, Save, Trash2, X } from 'lucide-react'
import { Button, Card, PageHeader, SectionTitle } from '@/components/kit/ui'
import { ConfirmDialog, Field, FormGrid, Input, Select, Textarea, Toggle, toNum } from '@/components/kit/form'
import { ErrorNote } from '@/components/kit/ui'
import { useEateryActions, type OwnerData } from '@/lib/eatery/hooks'
import { DAY_NAMES } from '@/lib/eatery/menu'
import { PRESETS } from '@/lib/eatery/presets'
import { isSlug } from '@/lib/eatery/setup'
import type { MenuKind, MomoNetwork, Restaurant } from '@/lib/eatery/types'
import { EateryFrame, RestaurantSwitcher } from '../_components/frame'
import { TableQrCodes } from '../_components/table-qr'
import { printReceipt, receiptPreviewHtml, sampleOrder } from '../_components/receipt'
import { PrinterChoice, ReceiptPreview, usePaperWidth } from '@/components/print/receipt-setup'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

const Settings = ({ o }: { o: OwnerData & { restaurant: Restaurant } }) => {
  const params = useParams()
  const router = useRouter()
  const locale = (params?.locale as string) || 'en'
  const actions = useEateryActions()
  const [d, setD] = useState<Restaurant>(o.restaurant)
  const [newTable, setNewTable] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tried, setTried] = useState(false)
  useEffect(() => {
    setD(o.restaurant)
    setTried(false)
  }, [o.restaurant])
  const dirty = JSON.stringify(d) !== JSON.stringify(o.restaurant)
  const set = (p: Partial<Restaurant>) => setD((x) => ({ ...x, ...p }))
  const f = d.fulfilment
  const setF = (p: Partial<Restaurant['fulfilment']>) => set({ fulfilment: { ...f, ...p } })

  const problems = [
    !d.name.trim() && 'Name is required',
    !isSlug(d.slug) && 'Web address: 3–48 lowercase letters, numbers and dashes',
    !f.pickup.enabled && !f.delivery.enabled && !f.dineIn.enabled && 'Turn on at least one way to order',
    f.dineIn.enabled && f.dineIn.tables.length === 0 && 'Add your tables for dine-in',
    !d.payments.cash && !d.payments.momo.enabled && !d.payments.payAtTable && 'Turn on at least one payment method',
    d.payments.momo.enabled && d.payments.momo.number.replace(/\D/g, '').length < 9 && 'Add your mobile money number',
  ].filter(Boolean) as string[]

  const save = async () => {
    setTried(true)
    if (problems.length) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ownerScope, theme, createdAt, ...body } = d
      await actions.update('restaurants', o.restaurant.id, body)
    } catch {
      // shown below
    } finally {
      setSaving(false)
    }
  }

  const addTable = () => {
    const names = newTable
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // "1-10" adds a range.
    const expanded = names.flatMap((n) => {
      const m = n.match(/^(\d+)\s*[-–]\s*(\d+)$/)
      return m ? Array.from({ length: Math.min(60, Math.max(0, +m[2] - +m[1] + 1)) }, (_, i) => String(+m[1] + i)) : [n]
    })
    setF({ dineIn: { ...f.dineIn, tables: Array.from(new Set([...f.dineIn.tables, ...expanded])) } })
    setNewTable('')
  }

  return (
    <>
      <PageHeader
        eyebrow={o.restaurant.name}
        title="Settings"
        description="Details, opening hours, how customers can order and how they pay."
        actions={
          <>
            <RestaurantSwitcher o={o} />
            <Button icon={Save} loading={saving} disabled={!dirty} onClick={() => void save()}>
              Save settings
            </Button>
          </>
        }
      />
      {tried && problems.length > 0 && <ErrorNote message={problems[0]} />}
      {actions.error && <ErrorNote message={actions.error.message} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Toggle
              checked={d.acceptingOrders}
              onChange={(v) => set({ acceptingOrders: v })}
              label={d.acceptingOrders ? 'Taking orders' : 'Orders paused'}
              hint="Pause when the kitchen is overwhelmed — the menu stays visible, ordering stops."
            />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Details" />
          <div className="flex flex-col gap-4">
            <FormGrid>
              <Field label="Name" htmlFor="s-name">
                <Input id="s-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Web address" htmlFor="s-slug" hint={`/eat/${d.slug}`}>
                <Input id="s-slug" prefix="/" value={d.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
              </Field>
            </FormGrid>
            <Field label="Tagline" htmlFor="s-tag" hint="One line under your name">
              <Input
                id="s-tag"
                value={d.tagline ?? ''}
                onChange={(e) => set({ tagline: e.target.value })}
                placeholder="Cocktails after dark · Osu"
              />
            </Field>
            <Field label="About" htmlFor="s-desc">
              <Textarea id="s-desc" value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <FormGrid>
              <Field label="Kind of place" htmlFor="s-cat" hint="Change the look in Brand & theme">
                <Select
                  id="s-cat"
                  value={d.category}
                  onChange={(e) => set({ category: e.target.value as Restaurant['category'] })}
                  options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
                />
              </Field>
              <Field label="Sells" htmlFor="s-kind">
                <Select
                  id="s-kind"
                  value={d.menuKind}
                  onChange={(e) => set({ menuKind: e.target.value as MenuKind })}
                  options={[
                    { value: 'drinks', label: 'Drinks only' },
                    { value: 'food', label: 'Food' },
                    { value: 'mixed', label: 'Food & drinks' },
                  ]}
                />
              </Field>
              <Field label="Street / landmark" htmlFor="s-addr">
                <Input id="s-addr" value={d.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <Field label="City / town" htmlFor="s-city">
                <Input id="s-city" value={d.city} onChange={(e) => set({ city: e.target.value })} />
              </Field>
              <Field label="Phone" htmlFor="s-phone">
                <Input id="s-phone" type="tel" value={d.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp" htmlFor="s-wa" hint="Customers can message you about orders">
                <Input id="s-wa" type="tel" value={d.whatsapp ?? ''} onChange={(e) => set({ whatsapp: e.target.value })} />
              </Field>
              <Field label="Currency" htmlFor="s-cur">
                <Select
                  id="s-cur"
                  value={d.currency}
                  onChange={(e) => set({ currency: e.target.value })}
                  options={[
                    { value: 'GHS', label: 'Ghana cedi (₵)' },
                    { value: 'NGN', label: 'Naira (₦)' },
                    { value: 'XOF', label: 'CFA franc' },
                    { value: 'USD', label: 'US dollar ($)' },
                  ]}
                />
              </Field>
            </FormGrid>
            <Toggle
              checked={d.servesAlcohol}
              onChange={(v) => set({ servesAlcohol: v })}
              label="Serves alcohol"
              hint="Shows an 18+ notice on the menu"
            />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Opening hours" hint="Closing after midnight is fine, e.g. 17:00–02:00" />
          <ul className="flex flex-col gap-2">
            {ORDER.map((day) => {
              const p = d.hours[day]?.[0]
              return (
                <li key={day} className="grid grid-cols-[100px_1fr] items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-endeavour"
                      checked={!!p}
                      onChange={(e) => set({ hours: { ...d.hours, [day]: e.target.checked ? [{ open: '09:00', close: '22:00' }] : [] } })}
                    />
                    {DAY_NAMES[day].slice(0, 3)}
                  </label>
                  {p ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={`${DAY_NAMES[day]} opens`}
                        type="time"
                        value={p.open}
                        onChange={(e) => set({ hours: { ...d.hours, [day]: [{ ...p, open: e.target.value }] } })}
                      />
                      <Input
                        aria-label={`${DAY_NAMES[day]} closes`}
                        type="time"
                        value={p.close}
                        onChange={(e) => set({ hours: { ...d.hours, [day]: [{ ...p, close: e.target.value }] } })}
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-stone-400">Closed</span>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Ways to order" />
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Toggle
                checked={f.pickup.enabled}
                onChange={(v) => setF({ pickup: { ...f.pickup, enabled: v } })}
                label="Pickup"
                hint="Customers collect at the counter"
              />
              {f.pickup.enabled && (
                <Field label="Usually ready in (minutes)" htmlFor="s-prep" className="sm:w-56">
                  <Input
                    id="s-prep"
                    type="number"
                    min={0}
                    value={f.pickup.prepMinutes}
                    onChange={(e) => setF({ pickup: { ...f.pickup, prepMinutes: toNum(e.target.value) } })}
                  />
                </Field>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                checked={f.delivery.enabled}
                onChange={(v) => setF({ delivery: { ...f.delivery, enabled: v } })}
                label="Delivery"
                hint="Your own riders"
              />
              {f.delivery.enabled && (
                <FormGrid>
                  <Field label="Delivery fee" htmlFor="s-fee">
                    <Input
                      id="s-fee"
                      type="number"
                      min={0}
                      step="any"
                      value={f.delivery.fee}
                      onChange={(e) => setF({ delivery: { ...f.delivery, fee: toNum(e.target.value) } })}
                    />
                  </Field>
                  <Field label="Minimum order" htmlFor="s-min">
                    <Input
                      id="s-min"
                      type="number"
                      min={0}
                      step="any"
                      value={f.delivery.minOrder}
                      onChange={(e) => setF({ delivery: { ...f.delivery, minOrder: toNum(e.target.value) } })}
                    />
                  </Field>
                  <Field label="Arrives in about (minutes)" htmlFor="s-eta">
                    <Input
                      id="s-eta"
                      type="number"
                      min={0}
                      value={f.delivery.etaMinutes}
                      onChange={(e) => setF({ delivery: { ...f.delivery, etaMinutes: toNum(e.target.value) } })}
                    />
                  </Field>
                  <Field label="Areas you cover" htmlFor="s-area">
                    <Input
                      id="s-area"
                      value={f.delivery.area ?? ''}
                      onChange={(e) => setF({ delivery: { ...f.delivery, area: e.target.value } })}
                      placeholder="East Legon, Airport"
                    />
                  </Field>
                </FormGrid>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                checked={f.dineIn.enabled}
                onChange={(v) => setF({ dineIn: { ...f.dineIn, enabled: v } })}
                label="Dine-in by QR code"
                hint="Guests scan the code on their table and order from their phone"
              />
              {f.dineIn.enabled && (
                <>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Tables">
                    {f.dineIn.tables.map((t) => (
                      <li
                        key={t}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-stone-100 pl-3 pr-1 text-xs font-semibold text-stone-700"
                      >
                        {t}
                        <button
                          type="button"
                          aria-label={`Remove table ${t}`}
                          onClick={() => setF({ dineIn: { ...f.dineIn, tables: f.dineIn.tables.filter((x) => x !== t) } })}
                          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-stone-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Input
                      aria-label="New tables"
                      value={newTable}
                      onChange={(e) => setNewTable(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addTable()
                        }
                      }}
                      placeholder="e.g. 1-12, Bar 1, Terrace"
                    />
                    <Button variant="secondary" icon={Plus} onClick={addTable} disabled={!newTable.trim()}>
                      Add
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Payments" />
          <div className="flex flex-col gap-4">
            <Toggle
              checked={d.payments.momo.enabled}
              onChange={(v) => set({ payments: { ...d.payments, momo: { ...d.payments.momo, enabled: v } } })}
              label="Mobile money"
              hint="Customers send to your number; you confirm on the orders board"
            />
            {d.payments.momo.enabled && (
              <FormGrid>
                <Field label="MoMo number" htmlFor="s-momo">
                  <Input
                    id="s-momo"
                    type="tel"
                    value={d.payments.momo.number}
                    onChange={(e) => set({ payments: { ...d.payments, momo: { ...d.payments.momo, number: e.target.value } } })}
                  />
                </Field>
                <Field label="Account name" htmlFor="s-momo-name">
                  <Input
                    id="s-momo-name"
                    value={d.payments.momo.accountName}
                    onChange={(e) => set({ payments: { ...d.payments, momo: { ...d.payments.momo, accountName: e.target.value } } })}
                  />
                </Field>
                <Field label="Network" htmlFor="s-momo-net">
                  <Select
                    id="s-momo-net"
                    value={d.payments.momo.network}
                    onChange={(e) =>
                      set({ payments: { ...d.payments, momo: { ...d.payments.momo, network: e.target.value as MomoNetwork } } })
                    }
                    options={[
                      { value: 'mtn', label: 'MTN MoMo' },
                      { value: 'telecel', label: 'Telecel Cash' },
                      { value: 'airteltigo', label: 'AirtelTigo Money' },
                    ]}
                  />
                </Field>
              </FormGrid>
            )}
            <Toggle
              checked={d.payments.cash}
              onChange={(v) => set({ payments: { ...d.payments, cash: v } })}
              label="Cash"
              hint="On pickup or delivery"
            />
            <Toggle
              checked={d.payments.payAtTable}
              onChange={(v) => set({ payments: { ...d.payments, payAtTable: v } })}
              label="Pay at the table"
              hint="Dine-in only — settle with your server"
            />
          </div>
        </Card>

        {f.dineIn.enabled && (
          <Card className="p-5 lg:col-span-2">
            <SectionTitle title="Table QR codes" hint={dirty ? 'Save to use new tables' : 'Print and stick one on each table'} />
            <TableQrCodes restaurant={o.restaurant} locale={locale} />
          </Card>
        )}

        <ReceiptsCard restaurant={d} />

        <Card className="p-5 lg:col-span-2 border-rose-200">
          <SectionTitle title="Delete restaurant" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-stone-600">Removes its storefront, menu, deals and orders. This can’t be undone.</p>
            <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
              Delete {o.restaurant.name}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${o.restaurant.name}?`}
        description="Its storefront goes offline immediately and its menu, deals and orders are deleted."
        onConfirm={async () => {
          await actions.remove('restaurants', o.restaurant.id)
          router.push(`/${locale}/eatery`)
        }}
      />
    </>
  )
}

export default function SettingsPage() {
  return <EateryFrame>{(o) => <Settings o={o} />}</EateryFrame>
}

// Printer width for this device, and the receipt as it will print.
const ReceiptsCard = ({ restaurant }: { restaurant: Restaurant }) => {
  const [paper, setPaper] = usePaperWidth()
  return (
    <Card className="p-5 lg:col-span-2">
      <SectionTitle
        title="Receipts"
        hint="Uses your logo (Brand & theme), name, address and phone."
        action={
          <Button variant="secondary" size="sm" icon={Printer} onClick={() => void printReceipt(sampleOrder(restaurant), restaurant)}>
            Print a test
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <PrinterChoice paper={paper} onChange={setPaper} />
        <ReceiptPreview html={receiptPreviewHtml(restaurant, paper)} paper={paper} />
      </div>
    </Card>
  )
}
