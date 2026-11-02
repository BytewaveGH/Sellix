'use client'

// Store settings: business details printed on receipts and invoices, the
// receipt itself, and how the POS starts.

import React from 'react'
import { Printer } from 'lucide-react'
import { useFetchData } from '@/hooks/use-fetch'
import { IGeneric } from '@/types/interfaces'
import { Button, Card, PageHeader, SectionTitle } from '@/components/kit/ui'
import { Field, FormGrid, Input, Segmented, Select, Textarea, Toggle } from '@/components/kit/form'
import { printOrder } from '@/lib/store/receipt'
import type { Order } from '@/lib/store/orders'
import { WarehouseServices } from '../products/categories/_logics/services'
import { DeviceNote, SaveBar, useSettingsDraft } from './_widgets/draft'

const SAMPLE: Order = {
  key: 'sample',
  kind: 'sale',
  id: 1001,
  ref: 'S-1001',
  date: new Date().toISOString(),
  customerName: '',
  customerPhone: '',
  paymentType: 'cash',
  status: 'paid',
  total: 37.5,
  cashier: 'Ama',
  lines: [
    { productName: 'Milo 400g', unitName: 'Tin', quantity: 1, unitPrice: 30, subtotal: 30 },
    { productName: 'Voltic water', unitName: 'Bottle', quantity: 3, unitPrice: 2.5, subtotal: 7.5 },
  ],
}

export default function StoreSettingsPage() {
  const { draft, update, problems, dirty, saved, submit } = useSettingsDraft()
  const { data: warehousesRaw } = useFetchData('warehouses', WarehouseServices.FetchAll() as unknown as IGeneric)
  const warehouses = ((warehousesRaw as any[]) ?? []).map((w) => ({ value: String(w.id), label: w.name }))

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Store settings"
        description="Your business details on receipts and invoices, and how the POS starts."
      />
      <DeviceNote />

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <SectionTitle title="Business details" hint="Printed at the top of every receipt and invoice." />
          <FormGrid>
            <Field label="Business name" htmlFor="st-name">
              <Input
                id="st-name"
                value={draft.business.name}
                onChange={(e) => update('business', { name: e.target.value })}
                placeholder="e.g. Adom Mini Mart"
              />
            </Field>
            <Field label="Phone" htmlFor="st-phone">
              <Input
                id="st-phone"
                type="tel"
                value={draft.business.phone}
                onChange={(e) => update('business', { phone: e.target.value })}
                placeholder="e.g. 024 123 4567"
              />
            </Field>
            <Field label="Email" htmlFor="st-email" hint="Optional" error={problems['business.email']}>
              <Input
                id="st-email"
                type="email"
                value={draft.business.email}
                onChange={(e) => update('business', { email: e.target.value })}
              />
            </Field>
            <Field label="Tax / VAT number" htmlFor="st-tax" hint="Optional, e.g. TIN C0012345678">
              <Input id="st-tax" value={draft.business.taxId} onChange={(e) => update('business', { taxId: e.target.value })} />
            </Field>
          </FormGrid>
          <div className="mt-4">
            <Field label="Address" htmlFor="st-address" hint="Where customers find you, e.g. Shop 12, Kaneshie Market, Accra">
              <Textarea
                id="st-address"
                rows={2}
                value={draft.business.address}
                onChange={(e) => update('business', { address: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Receipts"
            action={
              <Button variant="secondary" size="sm" icon={Printer} onClick={() => printOrder(SAMPLE, draft)}>
                Print a sample
              </Button>
            }
          />
          <div className="flex flex-col gap-4">
            <Field label="Message at the bottom" htmlFor="st-footer" hint="e.g. returns policy, opening hours or a thank-you">
              <Textarea
                id="st-footer"
                rows={2}
                maxLength={200}
                value={draft.receipt.footer}
                onChange={(e) => update('receipt', { footer: e.target.value })}
              />
            </Field>
            <Toggle
              checked={draft.receipt.showCashier}
              onChange={(v) => update('receipt', { showCashier: v })}
              label="Show who served the customer"
              hint="Prints “Served by …” on counter-sale receipts"
            />
            <Toggle
              checked={draft.receipt.autoPrint}
              onChange={(v) => update('receipt', { autoPrint: v })}
              label="Print the receipt after every sale"
              hint="Otherwise the POS shows a Print button on the receipt"
            />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Point of sale" hint="How the POS starts on this device." />
          <FormGrid>
            <Field label="Sell from" htmlFor="st-warehouse" hint="The shop or warehouse this till takes stock from">
              <Select
                id="st-warehouse"
                value={draft.pos.defaultWarehouseId ? String(draft.pos.defaultWarehouseId) : ''}
                onChange={(e) => update('pos', { defaultWarehouseId: e.target.value ? Number(e.target.value) : null })}
                options={[{ value: '', label: 'Choose each time' }, ...warehouses]}
              />
            </Field>
            <Field label="Prices">
              <Segmented
                ariaLabel="Default prices"
                value={draft.pos.defaultCustomerType}
                onChange={(v) => update('pos', { defaultCustomerType: v })}
                options={[
                  { value: 'retail', label: 'Retail' },
                  { value: 'wholesale', label: 'Wholesale' },
                ]}
              />
            </Field>
          </FormGrid>
        </Card>
      </div>

      <SaveBar dirty={dirty} saved={saved} onSave={submit} error={Object.values(problems)[0]} />
    </div>
  )
}
