'use client'

import React, { useEffect, useId, useMemo, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BedDouble, Building, Building2, Home, LandPlot, LayoutGrid, Plus, Store, Trash2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAND_SIZE_UNITS, LAND_STAGES, LAND_TITLE_STATUSES, PROPERTY_TYPES } from '../../_logics/constants'
import { generateUnits, groupFromType, layoutLabel, type UnitGroupDraft } from '../../_logics/calc'
import { money, plural } from '../../_logics/format'
import { usePortfolio, useRealEstateActions } from '../../_logics/hooks'
import type { LandSizeUnit, LandStage, LandTitleStatus, Property, PropertyType, UnitType } from '../../_logics/types'
import { Button } from '../ui'
import { Drawer, Field, FormGrid, FormSection, Input, Segmented, Select, Textarea, toNum } from '../form'
import { FacilitySummaryPill } from '../facilities'
import { PresetPicker } from '../preset-picker'
import { RoomTypeForm } from './room-type-form'

const NEW_TYPE = '__new'

const TYPE_ICONS: Record<PropertyType, LucideIcon> = {
  'compound-house': Building,
  'apartment-building': Building2,
  'short-stay': BedDouble,
  'single-family': Home,
  commercial: Store,
  'mixed-use': LayoutGrid,
  land: LandPlot,
}

const schema = z.object({
  name: z.string().trim().min(1, 'Give the property a name'),
  type: z.string(),
  address: z.string().trim().min(1, 'Address is required'),
  city: z.string().trim().min(1, 'City is required'),
  region: z.string().optional(),
  coverImageUrl: z.union([z.literal(''), z.string().trim().url('Enter a full link (https://…)')]).optional(),
  description: z.string().optional(),
  // Purchase (any property)
  purchasePrice: z.coerce.number().min(0).optional(),
  purchaseDate: z.string().optional(),
  seller: z.string().optional(),
  // Land
  landSize: z.coerce.number().min(0).optional(),
  landSizeUnit: z.string().optional(),
  landStage: z.string().optional(),
  landTitleStatus: z.string().optional(),
  gpsAddress: z.string().optional(),
})
type Values = z.infer<typeof schema>

// First group: a room type that suits the property (nightly types for
// short-stay properties), or an empty slot when no types exist yet.
const defaultGroup = (types: UnitType[], propertyType: PropertyType): UnitGroupDraft => {
  const wantsNightly = propertyType === 'short-stay'
  const t = types.find((x) => (x.rentalMode === 'short-stay') === wantsNightly) ?? types[0]
  return t
    ? groupFromType(t)
    : { unitTypeId: null, count: 1, rentalMode: wantsNightly ? 'short-stay' : 'long-term', monthlyRent: 0, nightlyRate: 0, maxGuests: 0 }
}

const UnitGroupRow = ({
  group,
  types,
  onChange,
  onRemove,
  onNewType,
  canRemove,
  showError,
}: {
  group: UnitGroupDraft
  types: UnitType[]
  onChange: (g: UnitGroupDraft) => void
  onRemove: () => void
  onNewType: () => void
  canRemove: boolean
  showError: boolean
}) => {
  const id = useId()
  const selected = types.find((t) => t.id === group.unitTypeId)
  return (
    <div className="rounded-2xl border border-stone-200 p-4 flex flex-col gap-3 bg-stone-50/50">
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Field label="Room type" htmlFor={`${id}-type`} error={showError && !selected ? 'Choose a room type' : undefined}>
          <Select
            id={`${id}-type`}
            value={selected ? String(selected.id) : ''}
            placeholder="Choose a room type"
            options={[...types.map((t) => ({ value: String(t.id), label: t.name })), { value: NEW_TYPE, label: '+ New room type…' }]}
            onChange={(e) => {
              if (e.target.value === NEW_TYPE) return onNewType()
              const t = types.find((x) => String(x.id) === e.target.value)
              if (t) onChange(groupFromType(t, group.count))
            }}
          />
        </Field>
        <Field label="How many" htmlFor={`${id}-count`}>
          <Input
            id={`${id}-count`}
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={group.count}
            onChange={(e) => onChange({ ...group, count: Math.max(1, Math.min(200, toNum(e.target.value, 1))) })}
          />
        </Field>
      </div>
      {selected && (
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <span className="text-xs text-stone-500">{layoutLabel(selected)}</span>
          <FacilitySummaryPill facilities={selected.facilities} />
        </div>
      )}
      <Segmented
        ariaLabel="Rental mode"
        value={group.rentalMode}
        onChange={(rentalMode) => onChange({ ...group, rentalMode })}
        options={[
          { value: 'long-term', label: 'Monthly rent' },
          { value: 'short-stay', label: 'Nightly (Airbnb)' },
        ]}
      />
      {group.rentalMode === 'long-term' ? (
        <Field label="Rent per month" htmlFor={`${id}-rent`} hint="Each room can be changed later">
          <Input
            id={`${id}-rent`}
            prefix="₵"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={group.monthlyRent || ''}
            onChange={(e) => onChange({ ...group, monthlyRent: toNum(e.target.value) })}
          />
        </Field>
      ) : (
        <Field label="Rate per night" htmlFor={`${id}-night`}>
          <Input
            id={`${id}-night`}
            prefix="₵"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={group.nightlyRate || ''}
            onChange={(e) => onChange({ ...group, nightlyRate: toNum(e.target.value) })}
          />
        </Field>
      )}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="self-start text-xs font-semibold text-stone-400 hover:text-rose-600 inline-flex items-center gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove group
        </button>
      )}
    </div>
  )
}

export const PropertyForm = ({
  open,
  onOpenChange,
  property,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  property?: Property | null
}) => {
  const p = usePortfolio()
  const actions = useRealEstateActions({ inline: true })
  const editing = !!property
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState<UnitGroupDraft[]>([defaultGroup([], 'compound-house')])
  const [prefix, setPrefix] = useState('Room')
  const [showGroupErrors, setShowGroupErrors] = useState(false)
  // Index of the group that asked for a new room type (the form is stacked on top).
  const [newTypeFor, setNewTypeFor] = useState<number | null>(null)

  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const type = form.watch('type') as PropertyType

  useEffect(() => {
    if (!open) return
    form.reset({
      name: property?.name ?? '',
      type: property?.type ?? 'compound-house',
      address: property?.address ?? '',
      city: property?.city ?? '',
      region: property?.region ?? '',
      coverImageUrl: property?.coverImageUrl ?? '',
      description: property?.description ?? '',
      purchasePrice: property?.purchasePrice ?? undefined,
      purchaseDate: property?.purchaseDate ?? '',
      seller: property?.seller ?? '',
      landSize: property?.land?.size ?? undefined,
      landSizeUnit: property?.land?.sizeUnit ?? 'plots',
      landStage: property?.land?.stage ?? 'bare',
      landTitleStatus: property?.land?.titleStatus ?? 'indenture',
      gpsAddress: property?.land?.gpsAddress ?? '',
    })
    setGroups([defaultGroup(p.unitTypes, property?.type ?? 'compound-house')])
    setPrefix('Room')
    setShowGroupErrors(false)
    // Room types are read when the drawer opens; later additions are applied explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property, form])

  // Room types that finish loading after the drawer opened fill the empty slots.
  useEffect(() => {
    if (!open || editing || p.unitTypes.length === 0) return
    setGroups((list) => list.map((g) => (g.unitTypeId === null ? { ...defaultGroup(p.unitTypes, type), count: g.count } : g)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.unitTypes.length])

  // Fill any empty group slots with room types as they get created.
  const fillEmptyGroups = (created: UnitType[]) => {
    if (created.length === 0) return
    setGroups((list) => list.map((g, i) => (g.unitTypeId === null ? groupFromType(created[Math.min(i, created.length - 1)], g.count) : g)))
  }

  const summary = useMemo(() => {
    const units = groups.reduce((s, g) => s + g.count, 0)
    const monthly = groups.reduce((s, g) => s + (g.rentalMode === 'long-term' ? g.count * g.monthlyRent : 0), 0)
    return { units, monthly }
  }, [groups])

  const isLand = type === 'land'

  const submit = form.handleSubmit(async (v) => {
    if (!editing && !isLand && groups.some((g) => g.unitTypeId === null)) {
      setShowGroupErrors(true)
      return
    }
    setSaving(true)
    try {
      const body = {
        name: v.name,
        type: v.type as PropertyType,
        address: v.address,
        city: v.city,
        region: v.region || undefined,
        description: v.description || undefined,
        coverImageUrl: v.coverImageUrl || undefined,
        // Set on the Website page; kept as they are.
        listed: property?.listed,
        photos: property?.photos,
        purchasePrice: v.purchasePrice ? Number(v.purchasePrice) : undefined,
        purchaseDate: v.purchaseDate || undefined,
        seller: v.seller?.trim() || undefined,
        land: isLand
          ? {
              size: Number(v.landSize) || 0,
              sizeUnit: (v.landSizeUnit || 'plots') as LandSizeUnit,
              stage: (v.landStage || 'bare') as LandStage,
              titleStatus: (v.landTitleStatus || 'none') as LandTitleStatus,
              gpsAddress: v.gpsAddress?.trim().toUpperCase() || undefined,
            }
          : undefined,
      }
      if (editing) {
        await actions.update('properties', property!.id, body)
      } else {
        const created = await actions.create('properties', body)
        if (!isLand) await actions.createMany('units', generateUnits(groups, created.id, prefix.trim() || 'Room'))
      }
      onOpenChange(false)
    } catch {
      // toast already shown
    } finally {
      setSaving(false)
    }
  })

  return (
    <Drawer
      error={actions.error}
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={editing ? 'Edit property' : 'Add a property'}
      description={editing ? undefined : 'Describe the building, then add its rooms in groups — you can fine-tune each unit later.'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {editing
              ? 'Save changes'
              : isLand
                ? 'Add land'
                : summary.units > 0
                  ? `Create property · ${plural(summary.units, 'unit')}`
                  : 'Create property'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-7">
        <FormSection title="What kind of property?">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROPERTY_TYPES.map((t) => {
              const Icon = TYPE_ICONS[t.value]
              const active = type === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    form.setValue('type', t.value)
                    if (!editing) setGroups([defaultGroup(p.unitTypes, t.value)])
                  }}
                  aria-pressed={active}
                  className={cn(
                    'text-left rounded-2xl border p-3 transition-all',
                    active ? 'border-endeavour bg-endeavour/[0.04] ring-2 ring-endeavour/15' : 'border-stone-200 hover:border-stone-300'
                  )}
                >
                  <Icon className={cn('h-5 w-5 mb-2', active ? 'text-endeavour' : 'text-stone-400')} />
                  <p className="text-sm font-bold text-stone-900">{t.label}</p>
                  <p className="text-[11px] text-stone-500 leading-snug">{t.hint}</p>
                </button>
              )
            })}
          </div>
        </FormSection>

        <FormSection title="Details">
          <Field label="Property name" error={form.formState.errors.name?.message} htmlFor="p-name">
            <Input
              id="p-name"
              placeholder="e.g. Asokwa Compound House"
              aria-invalid={!!form.formState.errors.name}
              {...form.register('name')}
            />
          </Field>
          <FormGrid>
            <Field label="Address / landmark" error={form.formState.errors.address?.message} htmlFor="p-address">
              <Input
                id="p-address"
                placeholder="House no., street, GPS address"
                aria-invalid={!!form.formState.errors.address}
                {...form.register('address')}
              />
            </Field>
            <Field label="City / town" error={form.formState.errors.city?.message} htmlFor="p-city">
              <Input id="p-city" placeholder="e.g. Kumasi" aria-invalid={!!form.formState.errors.city} {...form.register('city')} />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Region" htmlFor="p-region">
              <Input id="p-region" placeholder="e.g. Ashanti" {...form.register('region')} />
            </Field>
            <Field
              label="Photo link"
              hint="Optional — or upload photos on the Website page"
              error={form.formState.errors.coverImageUrl?.message}
              htmlFor="p-photo"
            >
              <Input id="p-photo" placeholder="https://…" {...form.register('coverImageUrl')} />
            </Field>
          </FormGrid>
          <Field label="Notes" htmlFor="p-desc">
            <Textarea
              id="p-desc"
              placeholder="Anything worth remembering — meters, caretaker, shared facilities…"
              {...form.register('description')}
            />
          </Field>
        </FormSection>

        {isLand && (
          <FormSection title="Land">
            <FormGrid>
              <Field label="Size" htmlFor="p-land-size">
                <Input
                  id="p-land-size"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  placeholder="e.g. 2"
                  {...form.register('landSize')}
                />
              </Field>
              <Field label="Measured in" htmlFor="p-land-unit">
                <Select id="p-land-unit" options={LAND_SIZE_UNITS} {...form.register('landSizeUnit')} />
              </Field>
            </FormGrid>
            <Field label="Where it’s at">
              <div role="radiogroup" aria-label="Land stage" className="grid grid-cols-2 gap-2">
                {LAND_STAGES.map((st) => {
                  const on = form.watch('landStage') === st.value
                  return (
                    <button
                      key={st.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => form.setValue('landStage', st.value)}
                      className={cn(
                        'text-left rounded-2xl border p-3 transition-all',
                        on ? 'border-endeavour bg-endeavour/[0.04] ring-2 ring-endeavour/15' : 'border-stone-200 hover:border-stone-300'
                      )}
                    >
                      <p className="text-sm font-bold text-stone-900">{st.label}</p>
                      <p className="text-[11px] text-stone-500">{st.hint}</p>
                    </button>
                  )
                })}
              </div>
            </Field>
            <FormGrid>
              <Field label="Documents you have" htmlFor="p-land-title">
                <Select id="p-land-title" options={LAND_TITLE_STATUSES} {...form.register('landTitleStatus')} />
              </Field>
              <Field label="GhanaPost GPS address" hint="Optional, e.g. AK-485-9323" htmlFor="p-land-gps">
                <Input id="p-land-gps" placeholder="AK-485-9323" {...form.register('gpsAddress')} />
              </Field>
            </FormGrid>
          </FormSection>
        )}

        <FormSection title={isLand ? 'Purchase' : 'Purchase (optional)'}>
          <FormGrid cols={3}>
            <Field label={isLand ? 'Price paid' : 'Purchase price'} htmlFor="p-price" hint="Counts towards total invested">
              <Input id="p-price" prefix="₵" type="number" inputMode="decimal" step="any" min={0} {...form.register('purchasePrice')} />
            </Field>
            <Field label="Date bought" htmlFor="p-date">
              <Input id="p-date" type="date" {...form.register('purchaseDate')} />
            </Field>
            <Field label={isLand ? 'Seller / family' : 'Seller'} htmlFor="p-seller">
              <Input id="p-seller" placeholder={isLand ? 'e.g. Asante family' : ''} {...form.register('seller')} />
            </Field>
          </FormGrid>
        </FormSection>

        {!editing && !isLand && (
          <FormSection title="Rooms & units">
            <div className="flex items-center gap-3">
              <Field label="Name units as" className="w-40" htmlFor="p-prefix">
                <Input id="p-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </Field>
              <p className="text-xs text-stone-500 mt-6">
                → {prefix || 'Room'} 1, {prefix || 'Room'} 2, …
              </p>
            </div>
            {p.unitTypes.length === 0 && (
              <div className="rounded-2xl border border-endeavour/15 bg-endeavour/[0.03] p-4 flex flex-col gap-3">
                <div>
                  <p className="text-sm font-bold text-stone-900">First, describe your kinds of rooms</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Pick the common ones below or create your own — with which facilities are private or shared. You define them once and
                    reuse them on every property.
                  </p>
                </div>
                <PresetPicker compact onAdded={fillEmptyGroups} />
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => setNewTypeFor(0)} className="self-start">
                  Create my own room type
                </Button>
              </div>
            )}
            {groups.map((g, i) => (
              <UnitGroupRow
                key={i}
                group={g}
                types={p.unitTypes}
                canRemove={groups.length > 1}
                showError={showGroupErrors}
                onNewType={() => setNewTypeFor(i)}
                onChange={(next) => setGroups((list) => list.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setGroups((list) => list.filter((_, j) => j !== i))}
              />
            ))}
            <button
              type="button"
              onClick={() => setGroups((list) => [...list, defaultGroup(p.unitTypes, type)])}
              className="h-11 rounded-2xl border border-dashed border-stone-300 text-sm font-semibold text-stone-600 hover:border-endeavour hover:text-endeavour inline-flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add another group of rooms
            </button>
            <div className="rounded-2xl bg-endeavour/[0.05] border border-endeavour/10 px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-stone-700">
                <span className="font-bold text-stone-900">{plural(summary.units, 'unit')}</span> will be created
              </p>
              {summary.monthly > 0 && (
                <p className="text-sm text-stone-700">
                  Full occupancy <span className="font-bold text-stone-900 tabular-nums">{money(summary.monthly)}</span>/mo
                </p>
              )}
            </div>
          </FormSection>
        )}
      </form>
      <RoomTypeForm
        open={newTypeFor !== null}
        onOpenChange={(o) => !o && setNewTypeFor(null)}
        onSaved={(t) => {
          const i = newTypeFor ?? 0
          setGroups((list) => list.map((g, j) => (j === i ? groupFromType(t, g.count) : g)))
        }}
      />
    </Drawer>
  )
}
