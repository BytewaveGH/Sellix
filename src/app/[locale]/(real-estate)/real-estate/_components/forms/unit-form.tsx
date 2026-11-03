'use client'

import React, { useEffect, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { layoutLabel } from '../../_logics/calc'
import { usePortfolio, useRealEstateActions } from '../../_logics/hooks'
import type { RentalMode, Unit, UnitAvailability, UnitType } from '../../_logics/types'
import { Button } from '../ui'
import { Drawer, Field, FormGrid, FormSection, Input, Segmented, Select, Textarea, toNum } from '../form'
import { FacilityList } from '../facilities'
import { RoomTypeForm } from './room-type-form'

const NEW_TYPE = '__new'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  unitTypeId: z.string().min(1, 'Choose a room type'),
  monthlyRent: z.coerce.number().min(0),
  nightlyRate: z.coerce.number().min(0),
  maxGuests: z.coerce.number().int().min(0),
  notes: z.string().optional(),
})
type Values = z.infer<typeof schema>

export const UnitForm = ({
  open,
  onOpenChange,
  unit,
  propertyId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  unit?: Unit | null
  propertyId: number
}) => {
  const p = usePortfolio()
  const actions = useRealEstateActions({ inline: true })
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<RentalMode>('long-term')
  const [availability, setAvailability] = useState<UnitAvailability>('available')
  const [creatingType, setCreatingType] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(schema) })

  // Picking a type pre-fills its price; the unit can still differ.
  const applyType = (t: UnitType) => {
    form.setValue('unitTypeId', String(t.id), { shouldValidate: true })
    setMode(t.rentalMode)
    if (t.rentalMode === 'long-term') form.setValue('monthlyRent', t.defaultMonthlyRent)
    else {
      form.setValue('nightlyRate', t.defaultNightlyRate)
      form.setValue('maxGuests', t.maxGuests)
    }
  }

  useEffect(() => {
    if (!open) return
    form.reset({
      name: unit?.name ?? '',
      unitTypeId: unit?.unitTypeId ? String(unit.unitTypeId) : '',
      monthlyRent: unit?.monthlyRent ?? 0,
      nightlyRate: unit?.nightlyRate ?? 0,
      maxGuests: unit?.maxGuests ?? 2,
      notes: unit?.notes ?? '',
    })
    setMode(unit?.rentalMode ?? 'long-term')
    setAvailability(unit?.availability ?? 'available')
  }, [open, unit, form])

  const selected = p.unitTypeById.get(Number(form.watch('unitTypeId')))

  const submit = form.handleSubmit(async (v) => {
    setSaving(true)
    const body = {
      propertyId,
      unitTypeId: Number(v.unitTypeId),
      name: v.name,
      rentalMode: mode,
      availability,
      monthlyRent: mode === 'long-term' ? toNum(v.monthlyRent) : 0,
      nightlyRate: mode === 'short-stay' ? toNum(v.nightlyRate) : 0,
      maxGuests: mode === 'short-stay' ? toNum(v.maxGuests) : 0,
      notes: v.notes || undefined,
      // Set on the Website page; kept as they are.
      photos: unit?.photos,
    }
    try {
      if (unit) await actions.update('units', unit.id, body)
      else await actions.create('units', body)
      onOpenChange(false)
    } catch {
      // toast shown
    } finally {
      setSaving(false)
    }
  })

  const err = form.formState.errors
  return (
    <Drawer
      error={actions.error}
      open={open}
      onOpenChange={onOpenChange}
      title={unit ? `Edit ${unit.name}` : 'Add a unit'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {unit ? 'Save unit' : 'Add unit'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-7">
        <FormSection title="Unit">
          <Field label="Name" error={err.name?.message} htmlFor="u-name">
            <Input id="u-name" placeholder="e.g. Room 3" {...form.register('name')} />
          </Field>
          <Field label="Room type" error={err.unitTypeId?.message} htmlFor="u-type">
            <Select
              id="u-type"
              placeholder="Choose a room type"
              options={[
                ...p.unitTypes.map((t) => ({ value: String(t.id), label: t.name })),
                { value: NEW_TYPE, label: '+ New room type…' },
              ]}
              value={form.watch('unitTypeId') ?? ''}
              onChange={(e) => {
                if (e.target.value === NEW_TYPE) return setCreatingType(true)
                const t = p.unitTypeById.get(Number(e.target.value))
                if (t) applyType(t)
              }}
            />
          </Field>
          {selected && (
            <div className="rounded-2xl border border-stone-200 p-3 flex flex-col gap-2">
              <p className="text-xs text-stone-500">{layoutLabel(selected)}</p>
              <FacilityList facilities={selected.facilities} compact />
              {selected.amenities.length > 0 && <p className="text-xs text-stone-500">{selected.amenities.join(' · ')}</p>}
            </div>
          )}
        </FormSection>

        <FormSection title="How it's rented">
          <Segmented
            ariaLabel="Rental mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'long-term', label: 'Monthly rent' },
              { value: 'short-stay', label: 'Nightly (Airbnb)' },
            ]}
          />
          {mode === 'long-term' ? (
            <Field label="Rent per month" htmlFor="u-rent" hint="This room’s listed rent — can differ from its type’s default">
              <Input id="u-rent" prefix="₵" type="number" inputMode="decimal" step="any" min={0} {...form.register('monthlyRent')} />
            </Field>
          ) : (
            <FormGrid>
              <Field label="Rate per night" htmlFor="u-night">
                <Input id="u-night" prefix="₵" type="number" inputMode="decimal" step="any" min={0} {...form.register('nightlyRate')} />
              </Field>
              <Field label="Max guests" htmlFor="u-guests">
                <Input id="u-guests" type="number" inputMode="numeric" min={1} {...form.register('maxGuests')} />
              </Field>
            </FormGrid>
          )}
          <Field label="Availability" hint="Only available units can appear on your website">
            <Segmented
              ariaLabel="Availability"
              value={availability}
              onChange={setAvailability}
              options={[
                { value: 'available', label: 'Available' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'unlisted', label: 'Unlisted' },
              ]}
            />
          </Field>
          <Field label="Notes" htmlFor="u-notes">
            <Textarea id="u-notes" placeholder="Meter number, fittings, condition…" {...form.register('notes')} />
          </Field>
        </FormSection>
      </form>
      <RoomTypeForm open={creatingType} onOpenChange={setCreatingType} onSaved={applyType} />
    </Drawer>
  )
}
