'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Archive, Check, Minus, Pencil, Plus, Star, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { slugify } from '@/lib/tenant'
import { Button, Card, ErrorNote, LoadingGrid, PageHeader, SectionTitle } from '@/components/kit/ui'
import { Drawer, Field, FormGrid, Input, Segmented, Textarea, Toggle, toNum } from '@/components/kit/form'
import { DEFAULT_USAGE_PRICING, FEE_CLASSES, percent, type UsagePricing, type UsageRates } from '@/lib/subscription/usage'
import { cedis, yearlySavings } from '@/lib/subscription/access'
import { CORE_FEATURES, FEATURE_KEYS, featuresFor, type FeatureKey } from '@/lib/subscription/features'
import { plansInUse } from '@/lib/subscription/insights'
import type { Catalog, Plan } from '@/lib/subscription/types'
import { VERTICALS } from '@/lib/verticals'
import { useBillingActions, useCatalog, useSubscriptions } from '../_logics/billing'

const BLANK: Plan = { id: '', name: '', tagline: '', monthlyPrice: 0, yearlyPrice: 0, limits: { staff: 5 }, features: [], trialDays: 14 }

// ── Pay as you sell rates ────────────────────────────────────────────────────

const RateInput = ({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
}) => (
  <Field label={label} hint={hint} htmlFor={id}>
    <Input
      id={id}
      type="number"
      min={0}
      max={20}
      step="0.05"
      prefix="%"
      value={value}
      onChange={(e) => onChange(Math.min(20, Math.max(0, toNum(e.target.value))))}
    />
  </Field>
)

const UsageEditor = ({ value, onChange }: { value: UsagePricing; onChange: (u: UsagePricing) => void }) => {
  const rates = value.rates
  const setRate = <K extends keyof UsageRates>(k: K, v: UsageRates[K]) => onChange({ ...value, rates: { ...rates, [k]: v } })
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500">
        No monthly price: every feature and unlimited staff, with a fee on each month’s sales, billed after the month. Rates are a percent
        of completed sales after discounts.
      </p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Store POS, by the product’s fee type</p>
      <FormGrid>
        {FEE_CLASSES.map((c) => (
          <RateInput
            key={c.key}
            id={`rate-retail-${c.key}`}
            label={c.label}
            hint={c.examples}
            value={rates.retail[c.key]}
            onChange={(n) => setRate('retail', { ...rates.retail, [c.key]: n })}
          />
        ))}
      </FormGrid>
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Other modules</p>
      <FormGrid>
        <RateInput id="rate-eatery" label="Eatery orders" value={rates.eatery} onChange={(n) => setRate('eatery', n)} />
        <RateInput
          id="rate-amusement"
          label="Amusement tickets & counter"
          value={rates.amusement}
          onChange={(n) => setRate('amusement', n)}
        />
        <RateInput id="rate-rent" label="Rent collected" value={rates.rent} onChange={(n) => setRate('rent', n)} />
        <RateInput id="rate-stays" label="Short-stay bookings" value={rates.shortStays} onChange={(n) => setRate('shortStays', n)} />
      </FormGrid>
      <FormGrid>
        <Field label="Monthly minimum" hint="Charged even if fees come to less" htmlFor="usage-min">
          <Input
            id="usage-min"
            type="number"
            min={0}
            prefix="₵"
            value={value.minimum}
            onChange={(e) => onChange({ ...value, minimum: Math.max(0, toNum(e.target.value)) })}
          />
        </Field>
        <Field
          label="Monthly cap"
          hint="Empty = no cap"
          error={value.cap !== null && value.cap < value.minimum ? 'Must be at least the minimum' : undefined}
          htmlFor="usage-cap"
        >
          <Input
            id="usage-cap"
            type="number"
            min={0}
            prefix="₵"
            placeholder="No cap"
            value={value.cap ?? ''}
            onChange={(e) => onChange({ ...value, cap: e.target.value === '' ? null : Math.max(0, toNum(e.target.value)) })}
          />
        </Field>
      </FormGrid>
    </div>
  )
}

// ── Plan drawer (edits the draft) ────────────────────────────────────────────

const PlanDrawer = ({
  plan,
  isNew,
  takenIds,
  subscribers,
  onApply,
  onRemove,
  onClose,
}: {
  plan: Plan | null
  isNew: boolean
  takenIds: string[]
  subscribers: number
  onApply: (p: Plan) => void
  onRemove: () => void
  onClose: () => void
}) => {
  const [p, setP] = useState<Plan>(BLANK)
  const [idTouched, setIdTouched] = useState(false)
  const [unlimited, setUnlimited] = useState(false)
  useEffect(() => {
    if (!plan) return
    setP(plan)
    setIdTouched(!isNew)
    setUnlimited(plan.limits.staff === null)
  }, [plan, isNew])

  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setP((cur) => ({ ...cur, [k]: v }))
  const idError = !p.id
    ? 'Needed'
    : !/^[a-z0-9][a-z0-9-]{0,39}$/.test(p.id)
      ? 'Lowercase letters, numbers and dashes'
      : isNew && takenIds.includes(p.id)
        ? 'Already used'
        : ''
  const usageError = p.usage && p.usage.cap !== null && p.usage.cap < p.usage.minimum ? 'The cap must be at least the minimum' : ''
  const valid = p.name.trim().length > 0 && !idError && !usageError
  const saving = yearlySavings(p)

  return (
    <Drawer
      open={!!plan}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'New plan' : `Edit ${plan?.name ?? 'plan'}`}
      description="Changes are saved with “Save changes” at the bottom of the page."
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              icon={subscribers ? Archive : Trash2}
              className="mr-auto text-rose-600 hover:bg-rose-50"
              onClick={() => {
                if (subscribers) onApply({ ...p, archived: !p.archived })
                else onRemove()
              }}
            >
              {subscribers ? (p.archived ? 'Unarchive' : 'Archive') : 'Delete'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              onApply({
                ...p,
                name: p.name.trim(),
                tagline: p.tagline.trim(),
                limits: { staff: unlimited || p.usage ? null : p.limits.staff },
                ...(p.usage ? { monthlyPrice: 0, yearlyPrice: 0, trialDays: 0, features: [...FEATURE_KEYS] } : {}),
              })
            }
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormGrid>
          <Field label="Name" htmlFor="plan-name">
            <Input
              id="plan-name"
              value={p.name}
              maxLength={40}
              onChange={(e) => setP((cur) => ({ ...cur, name: e.target.value, id: idTouched ? cur.id : slugify(e.target.value) }))}
            />
          </Field>
          <Field
            label="Plan id"
            hint={isNew ? 'Used in the API; can’t change later' : 'Can’t be changed'}
            error={isNew ? idError : undefined}
            htmlFor="plan-id"
          >
            <Input
              id="plan-id"
              value={p.id}
              disabled={!isNew}
              onChange={(e) => {
                setIdTouched(true)
                set('id', e.target.value.toLowerCase())
              }}
            />
          </Field>
        </FormGrid>
        <Field label="Tagline" htmlFor="plan-tagline">
          <Input id="plan-tagline" value={p.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} />
        </Field>
        <Segmented
          ariaLabel="Plan pricing"
          value={p.usage ? 'usage' : 'fixed'}
          onChange={(v) => set('usage', v === 'usage' ? (p.usage ?? DEFAULT_USAGE_PRICING) : undefined)}
          options={[
            { value: 'fixed', label: 'Fixed price' },
            { value: 'usage', label: 'Pay as you sell' },
          ]}
        />
        {p.usage ? (
          <UsageEditor value={p.usage} onChange={(u) => set('usage', u)} />
        ) : (
          <>
            <FormGrid>
              <Field label="Monthly price" htmlFor="plan-monthly">
                <Input
                  id="plan-monthly"
                  type="number"
                  min={0}
                  prefix="₵"
                  value={p.monthlyPrice}
                  onChange={(e) => set('monthlyPrice', Math.max(0, toNum(e.target.value)))}
                />
              </Field>
              <Field
                label="Yearly price"
                hint={
                  saving > 0
                    ? `Saves ${cedis(saving)} (${Math.round((saving / Math.max(1, p.monthlyPrice * 12)) * 100)}%)`
                    : 'Same as 12 months'
                }
                htmlFor="plan-yearly"
              >
                <Input
                  id="plan-yearly"
                  type="number"
                  min={0}
                  prefix="₵"
                  value={p.yearlyPrice}
                  onChange={(e) => set('yearlyPrice', Math.max(0, toNum(e.target.value)))}
                />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="Staff accounts" htmlFor="plan-staff">
                <Input
                  id="plan-staff"
                  type="number"
                  min={0}
                  disabled={unlimited}
                  value={unlimited ? '' : (p.limits.staff ?? 0)}
                  placeholder="Unlimited"
                  onChange={(e) => set('limits', { staff: Math.max(0, Math.round(toNum(e.target.value))) })}
                />
              </Field>
              <Field label="Free trial (days)" hint="0 = no trial" htmlFor="plan-trial">
                <Input
                  id="plan-trial"
                  type="number"
                  min={0}
                  max={365}
                  value={p.trialDays}
                  onChange={(e) => set('trialDays', Math.max(0, Math.round(toNum(e.target.value))))}
                />
              </Field>
            </FormGrid>
          </>
        )}
        <div className="rounded-2xl border border-stone-200 p-4 flex flex-col gap-4">
          {!p.usage && <Toggle checked={unlimited} onChange={setUnlimited} label="Unlimited staff" />}
          <Toggle
            checked={!!p.highlighted}
            onChange={(v) => set('highlighted', v)}
            label="Mark as most popular"
            hint="Highlighted on owners’ plan comparison"
          />
        </div>
        {!isNew && subscribers > 0 && (
          <p className="text-xs text-stone-500">
            {subscribers} business{subscribers === 1 ? ' is' : 'es are'} on this plan, so it can be archived (hidden from new choices) but
            not deleted.
          </p>
        )}
      </div>
    </Drawer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const catalog = useCatalog()
  const subs = useSubscriptions()
  const actions = useBillingActions()
  const [draft, setDraft] = useState<Catalog | null>(null)
  const [editing, setEditing] = useState<{ plan: Plan; isNew: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (catalog.data) setDraft(catalog.data)
  }, [catalog.data])

  const dirty = !!draft && !!catalog.data && JSON.stringify(draft) !== JSON.stringify(catalog.data)
  const subscriberCount = useMemo(() => {
    const m = new Map<string, number>()
    subs.data.forEach((s) => m.set(s.planId, (m.get(s.planId) ?? 0) + 1))
    return m
  }, [subs.data])

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const header = (
    <PageHeader
      eyebrow="Billing"
      title="Plans"
      description="Prices, staff limits and the features each plan unlocks, across every module."
      actions={
        <Button icon={Plus} onClick={() => setEditing({ plan: { ...BLANK }, isNew: true })} disabled={!draft}>
          New plan
        </Button>
      }
    />
  )
  if (catalog.isLoading) {
    return (
      <>
        {header}
        <LoadingGrid count={3} className="xl:grid-cols-3" />
      </>
    )
  }
  if (!draft) {
    return (
      <>
        {header}
        <ErrorNote message={catalog.error?.message ?? 'Couldn’t load plans'} />
      </>
    )
  }

  const updatePlan = (id: string, fn: (p: Plan) => Plan) =>
    setDraft((d) => d && { ...d, plans: d.plans.map((p) => (p.id === id ? fn(p) : p)) })
  const toggleFeature = (planId: string, key: FeatureKey) =>
    updatePlan(planId, (p) => ({ ...p, features: p.features.includes(key) ? p.features.filter((f) => f !== key) : [...p.features, key] }))
  const setSetting = <K extends keyof Catalog['settings']>(k: K, v: Catalog['settings'][K]) =>
    setDraft((d) => d && { ...d, settings: { ...d.settings, [k]: v } })

  const save = async () => {
    setSaving(true)
    try {
      await actions.saveCatalog(draft)
    } catch {
      // toast shown
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn(dirty && 'pb-24')}>
      {header}

      {/* Plans */}
      <div className={cn('grid gap-4', draft.plans.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2')}>
        {draft.plans.map((p) => (
          <Card
            key={p.id}
            className={cn(
              'p-5 flex flex-col',
              p.archived && 'opacity-60',
              p.highlighted && !p.archived && 'ring-2 ring-endeavour/60 border-transparent'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-stone-900 flex items-center gap-1.5">
                  {p.name}
                  {p.highlighted && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" aria-label="Most popular" />}
                </p>
                <p className="text-xs text-stone-500 truncate">{p.tagline || '—'}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={Pencil}
                onClick={() => setEditing({ plan: p, isNew: false })}
                aria-label={`Edit ${p.name}`}
              >
                Edit
              </Button>
            </div>
            {p.usage ? (
              <>
                <p className="mt-4">
                  <span className="text-3xl font-extrabold tracking-tight text-stone-900">Fee on sales</span>
                </p>
                <p className="text-xs text-stone-500">
                  Store {percent(Math.min(...Object.values(p.usage.rates.retail)))}–
                  {percent(Math.max(...Object.values(p.usage.rates.retail)))} · eatery {percent(p.usage.rates.eatery)} · min{' '}
                  {cedis(p.usage.minimum)}
                  {p.usage.cap !== null ? ` · cap ${cedis(p.usage.cap)}` : ''}
                </p>
              </>
            ) : (
              <>
                <p className="mt-4">
                  <span className="text-3xl font-extrabold tracking-tight text-stone-900 tabular-nums">{cedis(p.monthlyPrice)}</span>
                  <span className="text-sm text-stone-500"> /month</span>
                </p>
                <p className="text-xs text-stone-500">{cedis(p.yearlyPrice)} /year</p>
              </>
            )}
            <dl className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Staff', value: p.usage ? '∞' : (p.limits.staff ?? '∞') },
                { label: 'Trial', value: p.trialDays && !p.usage ? `${p.trialDays}d` : '—' },
                { label: 'On it', value: subscriberCount.get(p.id) ?? 0 },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{s.label}</dt>
                  <dd className="text-sm font-extrabold text-stone-900 tabular-nums mt-0.5">{s.value}</dd>
                </div>
              ))}
            </dl>
            {p.archived && (
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-stone-500 inline-flex items-center gap-1">
                <Archive className="h-3 w-3" /> Archived — not offered
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* Feature matrix */}
      <Card className="mt-6 overflow-hidden">
        <div className="p-5 pb-3">
          <SectionTitle
            title="Features by plan"
            hint="Click a cell to include or remove a feature. Core pages of each module are on every plan."
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-stone-100 bg-stone-50/60">
                <th className="text-left py-2.5 pl-5 pr-4 text-[11px] font-bold uppercase tracking-wide text-stone-400">Feature</th>
                {draft.plans.map((p) => (
                  <th
                    key={p.id}
                    className={cn('py-2.5 px-3 text-center text-xs font-bold text-stone-700 min-w-[88px]', p.archived && 'text-stone-400')}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100">
                <td className="py-2.5 pl-5 pr-4 text-stone-700 inline-flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-stone-400" /> Staff accounts
                </td>
                {draft.plans.map((p) => (
                  <td key={p.id} className="py-2.5 px-3 text-center font-semibold text-stone-900 tabular-nums">
                    {p.usage ? 'Unlimited' : (p.limits.staff ?? 'Unlimited')}
                  </td>
                ))}
              </tr>
              <tr>
                <td
                  colSpan={draft.plans.length + 1}
                  className="pt-4 pb-1.5 pl-5 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-400"
                >
                  Core · every plan
                </td>
              </tr>
              {CORE_FEATURES.map((f) => (
                <tr key={f.key} className="border-b border-stone-100">
                  <td className="py-2 pl-5 pr-4">
                    <span className="block text-stone-800">{f.label}</span>
                    <span className="block text-[11px] text-stone-400">{f.description}</span>
                  </td>
                  {draft.plans.map((p) => (
                    <td key={p.id} className="py-1.5 px-3 text-center">
                      <span
                        className="h-8 w-8 rounded-lg inline-flex items-center justify-center bg-emerald-50 text-emerald-600"
                        role="img"
                        aria-label={`${f.label} on ${p.name}: always included`}
                        title="Core — included on every plan"
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              {VERTICALS.map((v) => {
                const fs = featuresFor(v.value)
                if (!fs.length) return null
                return (
                  <React.Fragment key={v.value}>
                    <tr>
                      <td
                        colSpan={draft.plans.length + 1}
                        className="pt-4 pb-1.5 pl-5 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-400"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: v.color }} aria-hidden />
                          {v.short}
                        </span>
                      </td>
                    </tr>
                    {fs.map((f) => (
                      <tr key={f.key} className="border-b border-stone-100 last:border-0">
                        <td className="py-2 pl-5 pr-4">
                          <span className="block text-stone-800">{f.label}</span>
                          <span className="block text-[11px] text-stone-400">{f.description}</span>
                        </td>
                        {draft.plans.map((p) => {
                          // Pay as you sell always includes every feature.
                          const on = !!p.usage || p.features.includes(f.key)
                          return (
                            <td key={p.id} className="py-1.5 px-3 text-center">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={on}
                                aria-label={`${f.label} on ${p.name}`}
                                disabled={!!p.usage}
                                title={p.usage ? 'Pay as you sell includes every feature' : undefined}
                                onClick={() => toggleFeature(p.id, f.key)}
                                className={cn(
                                  'h-8 w-8 rounded-lg inline-flex items-center justify-center transition-colors',
                                  on
                                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                    : 'text-stone-300 hover:bg-stone-100 hover:text-stone-500'
                                )}
                              >
                                {on ? <Check className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Settings */}
      <Card className="mt-6 p-5">
        <SectionTitle title="Billing settings" hint="Apply to every business" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Grace period (days)" hint="How long after a missed payment before the dashboard locks" htmlFor="grace">
            <Input
              id="grace"
              type="number"
              min={0}
              max={90}
              value={draft.settings.graceDays}
              onChange={(e) => setSetting('graceDays', Math.max(0, Math.round(toNum(e.target.value))))}
            />
          </Field>
          <Field
            label="Support contact"
            hint="Shown to owners, e.g. a WhatsApp number or email"
            htmlFor="support"
            className="lg:col-span-2"
          >
            <Input
              id="support"
              value={draft.settings.supportContact}
              maxLength={200}
              onChange={(e) => setSetting('supportContact', e.target.value)}
            />
          </Field>
          <Field
            label="Desktop app download link"
            hint="Where owners get the Windows installer (core on every plan), e.g. a Google Drive or website link. Must start with https://"
            htmlFor="desktop-url"
            className="lg:col-span-3"
          >
            <Input
              id="desktop-url"
              type="url"
              value={draft.settings.desktopDownloadUrl ?? ''}
              maxLength={500}
              placeholder="https://…/Sellix POS Setup.exe"
              onChange={(e) => setSetting('desktopDownloadUrl', e.target.value)}
            />
          </Field>
          <Field
            label="How to pay"
            hint="Owners see this on their billing page and when locked out"
            htmlFor="instructions"
            className="lg:col-span-3"
          >
            <Textarea
              id="instructions"
              rows={3}
              maxLength={1000}
              value={draft.settings.paymentInstructions}
              onChange={(e) => setSetting('paymentInstructions', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* Save bar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 lg:left-64 border-t border-stone-200 bg-white/95 backdrop-blur px-4 sm:px-6 lg:px-10 py-3">
          <div className="max-w-[1320px] mx-auto flex items-center gap-3">
            <p className="text-sm font-semibold text-stone-700 flex-1">Unsaved changes</p>
            <Button variant="ghost" onClick={() => catalog.data && setDraft(catalog.data)} disabled={saving}>
              Discard
            </Button>
            <Button onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      <PlanDrawer
        plan={editing?.plan ?? null}
        isNew={!!editing?.isNew}
        takenIds={draft.plans.map((p) => p.id)}
        subscribers={editing ? (subscriberCount.get(editing.plan.id) ?? 0) : 0}
        onClose={() => setEditing(null)}
        onApply={(p) => {
          setDraft((d) => d && { ...d, plans: editing?.isNew ? [...d.plans, p] : d.plans.map((x) => (x.id === p.id ? p : x)) })
          setEditing(null)
        }}
        onRemove={() => {
          if (editing && !plansInUse(subs.data).has(editing.plan.id))
            setDraft((d) => d && { ...d, plans: d.plans.filter((x) => x.id !== editing.plan.id) })
          setEditing(null)
        }}
      />
    </div>
  )
}
