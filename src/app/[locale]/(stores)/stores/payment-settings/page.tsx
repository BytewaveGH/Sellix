'use client'

// Payment: which methods the POS offers, and the MoMo details customers pay
// to (shown at the till when MoMo is chosen, and on receipts and invoices).

import React from 'react'
import { Banknote, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, PageHeader, SectionTitle } from '@/components/kit/ui'
import { Field, FormGrid, Input, Segmented, Toggle } from '@/components/kit/form'
import { formatPhone, MOMO_NETWORKS } from '@/lib/store/settings'
import { DeviceNote, SaveBar, useSettingsDraft } from '../settings/_widgets/draft'

export default function PaymentSettingsPage() {
  const { draft, update, problems, dirty, saved, submit } = useSettingsDraft()
  const p = draft.payments
  const network = MOMO_NETWORKS.find((n) => n.value === p.momoNetwork)?.label ?? 'MoMo'

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Settings" title="Payment" description="How customers can pay you, and where MoMo payments go." />
      <DeviceNote />

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <SectionTitle title="Accepted at the POS" hint="Turned-off methods are hidden from the checkout." />
          <div className="flex flex-col gap-4">
            <Toggle checked={p.cash} onChange={(v) => update('payments', { cash: v })} label="Cash" hint="Notes and coins at the counter" />
            <Toggle
              checked={p.momo}
              onChange={(v) => update('payments', { momo: v })}
              label="Mobile Money"
              hint="The customer sends money to your MoMo number"
            />
          </div>
          {problems['payments.methods'] && (
            <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">
              {problems['payments.methods']}
            </p>
          )}
        </Card>

        <Card className={cn('p-5', !p.momo && 'opacity-60')}>
          <SectionTitle
            title="Your MoMo details"
            hint="Shown to the cashier when the customer pays by MoMo, and printed on receipts and invoices."
          />
          <fieldset disabled={!p.momo} className="flex flex-col gap-4">
            <Field label="Network">
              <Segmented
                ariaLabel="MoMo network"
                value={p.momoNetwork}
                onChange={(v) => update('payments', { momoNetwork: v })}
                options={MOMO_NETWORKS}
              />
            </Field>
            <FormGrid>
              <Field label="MoMo number" htmlFor="pm-number" error={problems['payments.momoNumber']}>
                <Input
                  id="pm-number"
                  type="tel"
                  inputMode="numeric"
                  value={p.momoNumber}
                  onChange={(e) => update('payments', { momoNumber: e.target.value })}
                  placeholder="e.g. 024 123 4567"
                />
              </Field>
              <Field label="Name on the account" htmlFor="pm-name" hint="What customers see when they send">
                <Input
                  id="pm-name"
                  value={p.momoName}
                  onChange={(e) => update('payments', { momoName: e.target.value })}
                  placeholder="e.g. Adom Enterprise"
                />
              </Field>
            </FormGrid>
            <Field label="Merchant ID" htmlFor="pm-merchant" hint="Optional — for MoMo Pay merchant accounts">
              <Input id="pm-merchant" value={p.momoMerchantId} onChange={(e) => update('payments', { momoMerchantId: e.target.value })} />
            </Field>
          </fieldset>
        </Card>

        <Card className="p-5">
          <SectionTitle title="What the cashier sees" />
          <div className="flex flex-col sm:flex-row gap-2 max-w-md" aria-label="Checkout preview">
            {p.momo && (
              <div className="flex-1 rounded-xl bg-endeavour px-3 py-2.5 text-white">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Smartphone className="h-4 w-4" /> MoMo · ₵25.00
                </p>
                {p.momoNumber && (
                  <p className="mt-0.5 text-[11px] text-white/80">
                    {network} {formatPhone(p.momoNumber)}
                    {p.momoName && ` · ${p.momoName}`}
                  </p>
                )}
              </div>
            )}
            {p.cash && (
              <div className="flex-1 rounded-xl bg-green-600 px-3 py-2.5 text-white">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Banknote className="h-4 w-4" /> Cash · ₵25.00
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <SaveBar dirty={dirty} saved={saved} onSave={submit} error={Object.values(problems)[0]} />
    </div>
  )
}
