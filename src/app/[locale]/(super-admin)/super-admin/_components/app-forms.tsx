'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ROOT_DOMAIN, slugify } from '@/lib/tenant'
import { Button } from '@/components/kit/ui'
import { Drawer, Field, FormGrid, Input, Segmented, Toggle, toNum } from '@/components/kit/form'
import { cedis, cycleLabel, priceFor } from '@/lib/subscription/access'
import type { BillingCycle } from '@/lib/subscription/types'
import { billingApi, useCatalog } from '../_logics/billing'
import { generatePassword, passwordStrength, tenantHost, tenantUrl } from '../_logics/insights'
import { platformApi, usePlatformActions } from '../_logics/api'
import { VERTICALS, verticalMeta } from '../_logics/verticals'
import type { TenantRecord, TenantStatus } from '../_logics/types'
import { CopyButton } from './bits'

const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'platform', 'static', 'super-admin'])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SlugState = 'idle' | 'invalid' | 'reserved' | 'checking' | 'available' | 'taken' | 'unknown'

// Debounced availability check against the public tenant lookup.
const useSlugAvailability = (slug: string, currentSlug?: string): SlugState => {
  const [state, setState] = useState<SlugState>('idle')
  useEffect(() => {
    if (!slug) return setState('idle')
    if (slug === currentSlug) return setState('available')
    if (slug.length < 3 || slug.length > 40) return setState('invalid')
    if (RESERVED.has(slug)) return setState('reserved')
    setState('checking')
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const taken = await platformApi.slugTaken(slug)
        if (!cancelled) setState(taken ? 'taken' : 'available')
      } catch {
        if (!cancelled) setState('unknown')
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [slug, currentSlug])
  return state
}

const SlugHint = ({ state, slug }: { state: SlugState; slug: string }) => {
  const host = <span className="font-semibold text-stone-700">{tenantHost(slug || 'yourbusiness', ROOT_DOMAIN)}</span>
  const map: Record<SlugState, React.ReactNode> = {
    idle: <>Will be reachable at {host}</>,
    invalid: <span className="text-rose-600">Use 3–40 letters, numbers or dashes</span>,
    reserved: <span className="text-rose-600">That name is reserved — pick another</span>,
    checking: (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking {host}…
      </span>
    ),
    available: (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> {host} is available
      </span>
    ),
    taken: (
      <span className="inline-flex items-center gap-1 text-rose-600">
        <XCircle className="h-3 w-3" /> Already taken — try another
      </span>
    ),
    unknown: <>Couldn’t check availability — {host} will be verified on save</>,
  }
  return <p className="text-xs text-stone-500">{map[state]}</p>
}

const VerticalPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div role="radiogroup" aria-label="Business type" className="grid gap-2 sm:grid-cols-2">
    {VERTICALS.map((v) => {
      const on = value === v.value
      const Icon = v.icon
      return (
        <button
          key={v.value}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(v.value)}
          className={cn(
            'flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all',
            on ? 'border-endeavour bg-endeavour/[0.04] ring-2 ring-endeavour/15' : 'border-stone-200 hover:border-stone-300'
          )}
        >
          <span className="h-10 w-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: v.color }}>
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-900">{v.label}</span>
            <span className="block text-xs text-stone-500 mt-0.5">{v.description}</span>
          </span>
          {on && <Check className="h-4 w-4 text-endeavour flex-shrink-0" />}
        </button>
      )
    })}
  </div>
)

// ── Register (wizard) ────────────────────────────────────────────────────────

const STEPS = ['Business', 'Type', 'Owner', 'Plan', 'Review'] as const

export const RegisterAppWizard = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (t: TenantRecord) => void
}) => {
  const actions = usePlatformActions()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [appType, setAppType] = useState('retail')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<TenantRecord | null>(null)
  const slugState = useSlugAvailability(slug)
  const qc = useQueryClient()
  const catalog = useCatalog()
  const offered = (catalog.data?.plans ?? []).filter((p) => !p.archived)
  // '' = register without a plan (free, full access).
  const [planId, setPlanId] = useState('')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [trial, setTrial] = useState(true)
  const [trialDays, setTrialDays] = useState('14')
  const [planWarning, setPlanWarning] = useState('')
  const plan = offered.find((p) => p.id === planId)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setName('')
    setSlug('')
    setSlugTouched(false)
    setAppType('retail')
    setOwnerName('')
    setOwnerEmail('')
    setPassword('')
    setShowPw(false)
    setError('')
    setCreated(null)
    setCycle('monthly')
    setTrial(true)
    setPlanWarning('')
  }, [open])
  // Default to the highlighted plan and its trial once the catalog is in.
  useEffect(() => {
    if (!open) return
    const initial = offered.find((p) => p.highlighted) ?? offered[0]
    setPlanId(initial?.id ?? '')
    setTrialDays(String(initial?.trialDays || 14))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalog.data])

  const strength = passwordStrength(password)
  const stepValid = [
    name.trim().length > 1 && !!slug && !['invalid', 'reserved', 'taken', 'checking'].includes(slugState),
    !!appType,
    ownerName.trim().length > 1 && EMAIL.test(ownerEmail.trim()) && password.length >= 8,
    !planId || !trial || toNum(trialDays) >= 1,
    true,
  ]
  const days = Math.max(0, Math.round(toNum(trialDays)))

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const t = await actions.create({
        name: name.trim(),
        slug,
        appType,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        password,
      })
      // The business exists either way; a failed plan is a warning to fix from its Billing tab.
      if (t?.id && plan) {
        try {
          await billingApi.act(t.id, { type: 'assign', planId: plan.id, cycle, trialDays: trial ? days : 0 })
          await qc.invalidateQueries({ queryKey: ['platform', 'billing'] })
        } catch (err) {
          setPlanWarning(
            `Registered, but the plan wasn’t set (${err instanceof Error ? err.message : 'billing unavailable'}). Set it from the app’s Billing tab.`
          )
        }
      }
      setCreated(
        t ?? ({ id: 0, name, slug, appType, status: 'active', createdAt: new Date().toISOString(), ownerName, ownerEmail } as TenantRecord)
      )
      if (t) onCreated?.(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t register the app')
    } finally {
      setSaving(false)
    }
  }

  const url = tenantUrl(slug, ROOT_DOMAIN)
  const credentials = `Your ${verticalMeta(appType).short} app on Bytewave is ready.\nSign in: ${url}\nEmail: ${ownerEmail.trim()}\nPassword: ${password}\nPlease change your password after signing in.`

  if (created) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title="App registered"
        footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
      >
        <div className="flex flex-col items-center text-center gap-3 pt-4">
          <span className="h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <p className="text-lg font-extrabold text-stone-900">{created.name} is live</p>
          <p className="text-sm text-stone-500 max-w-sm">
            Share these sign-in details with {ownerName.trim() || 'the owner'}. The password isn’t shown again.
          </p>
        </div>
        {planWarning && (
          <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {planWarning}
          </div>
        )}
        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 flex flex-col gap-3">
          {[
            { label: 'Sign-in link', value: url },
            { label: 'Email', value: ownerEmail.trim() },
            { label: 'Password', value: password, mono: true },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{r.label}</p>
                <p className={cn('text-sm text-stone-900 truncate', r.mono && 'font-mono')}>{r.value}</p>
              </div>
              <CopyButton value={r.value} label={`Copy ${r.label.toLowerCase()}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(credentials).catch(() => {})}>
            Copy all as a message
          </Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="secondary" icon={ExternalLink}>
              Open app
            </Button>
          </a>
        </div>
      </Drawer>
    )
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Register a new app"
      description="Creates the business, its subdomain and the owner’s login."
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)} className="mr-auto">
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step]}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={saving}>
              Register app
            </Button>
          )}
        </>
      }
    >
      {/* Stepper */}
      <ol className="flex items-center gap-2 mb-7" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2 flex-1 last:flex-none" aria-current={i === step ? 'step' : undefined}>
            <span
              className={cn(
                'h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors',
                i < step
                  ? 'bg-endeavour text-white'
                  : i === step
                    ? 'bg-endeavour/10 text-endeavour ring-2 ring-endeavour/30'
                    : 'bg-stone-100 text-stone-400'
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('text-xs font-semibold hidden sm:inline', i === step ? 'text-stone-900' : 'text-stone-400')}>{label}</span>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-endeavour' : 'bg-stone-200')} />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <Field label="Business name" htmlFor="ra-name">
            <Input
              id="ra-name"
              autoFocus
              value={name}
              placeholder="e.g. Acme Diner"
              onChange={(e) => {
                setName(e.target.value)
                if (!slugTouched) setSlug(slugify(e.target.value))
              }}
            />
          </Field>
          <Field label="Subdomain" htmlFor="ra-slug">
            <div className="flex items-stretch rounded-xl border border-stone-200 focus-within:border-endeavour focus-within:ring-2 focus-within:ring-endeavour/15 overflow-hidden">
              <input
                id="ra-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(slugify(e.target.value))
                }}
                placeholder="acme-diner"
                className="flex-1 min-w-0 h-10 px-3 text-base sm:text-sm text-stone-800 focus:outline-none"
              />
              <span className="px-3 flex items-center bg-stone-50 border-l border-stone-200 text-sm text-stone-500 whitespace-nowrap">
                .{ROOT_DOMAIN || 'yourdomain.com'}
              </span>
            </div>
            <SlugHint state={slugState} slug={slug} />
          </Field>
        </div>
      )}

      {step === 1 && <VerticalPicker value={appType} onChange={setAppType} />}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <FormGrid>
            <Field label="Owner name" htmlFor="ra-owner">
              <Input id="ra-owner" autoFocus value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Jane Doe" />
            </Field>
            <Field
              label="Owner email"
              htmlFor="ra-email"
              error={ownerEmail && !EMAIL.test(ownerEmail.trim()) ? 'Enter a valid email' : undefined}
            >
              <Input
                id="ra-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="jane@acmediner.com"
              />
            </Field>
          </FormGrid>
          <Field label="Password" htmlFor="ra-pw" hint="The owner signs in with this email and password at their subdomain.">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="ra-pw"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 font-mono"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={() => {
                  setPassword(generatePassword())
                  setShowPw(true)
                }}
              >
                Generate
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-1" aria-live="polite">
              <div className="flex gap-1 flex-1">
                {[1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      strength.score >= i
                        ? strength.score <= 1
                          ? 'bg-rose-500'
                          : strength.score === 2
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        : 'bg-stone-200'
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-stone-500 w-16 text-right">{strength.label}</span>
            </div>
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          {catalog.isLoading ? (
            <p className="text-sm text-stone-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </p>
          ) : !catalog.data ? (
            <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> Plans can’t be loaded, so this app will be registered without one.
              You can set it later.
            </div>
          ) : (
            <>
              <Segmented
                ariaLabel="Billing cycle"
                value={cycle}
                onChange={setCycle}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
              />
              <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2">
                {[
                  ...offered.map((p) => ({
                    id: p.id,
                    title: p.name,
                    body: p.tagline,
                    price: `${cedis(priceFor(p, cycle))}/${cycleLabel(cycle)}`,
                  })),
                  { id: '', title: 'No plan', body: 'Free, full access — for partners or internal use', price: '' },
                ].map((o) => {
                  const on = planId === o.id
                  return (
                    <button
                      key={o.id || 'none'}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setPlanId(o.id)
                        const p = offered.find((x) => x.id === o.id)
                        if (p) setTrialDays(String(p.trialDays || 14))
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all',
                        on ? 'border-endeavour bg-endeavour/[0.04] ring-2 ring-endeavour/15' : 'border-stone-200 hover:border-stone-300'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-stone-900">{o.title}</span>
                        <span className="block text-xs text-stone-500">{o.body}</span>
                      </span>
                      {o.price && <span className="text-sm font-extrabold text-stone-900 tabular-nums">{o.price}</span>}
                      {on && <Check className="h-4 w-4 text-endeavour flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
              {plan && (
                <div className="rounded-2xl border border-stone-200 p-4 flex flex-col gap-3">
                  <Toggle
                    checked={trial}
                    onChange={setTrial}
                    label="Start with a free trial"
                    hint="Full access, no payment until it ends"
                  />
                  {trial ? (
                    <Field label="Trial length (days)" htmlFor="ra-trial">
                      <Input
                        id="ra-trial"
                        type="number"
                        min={1}
                        max={365}
                        value={trialDays}
                        onChange={(e) => setTrialDays(e.target.value)}
                      />
                    </Field>
                  ) : (
                    <p className="text-xs text-stone-500">Payment is due now — record it from the app’s Billing tab.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {[
              { label: 'Business', value: name.trim(), to: 0 },
              { label: 'Address', value: tenantHost(slug, ROOT_DOMAIN), to: 0 },
              { label: 'Type', value: verticalMeta(appType).label, to: 1 },
              { label: 'Owner', value: `${ownerName.trim()} · ${ownerEmail.trim()}`, to: 2 },
              {
                label: 'Plan',
                value: plan
                  ? `${plan.name} (${cycle})${trial && days > 0 ? ` · ${days}-day free trial` : ' · payment due now'}`
                  : 'No plan — full access',
                to: 3,
              },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{r.label}</p>
                  <p className="text-sm font-semibold text-stone-900 truncate">{r.value}</p>
                </div>
                <button type="button" onClick={() => setStep(r.to)} className="text-xs font-semibold text-endeavour hover:underline">
                  Edit
                </button>
              </div>
            ))}
          </div>
          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

// ── Edit ─────────────────────────────────────────────────────────────────────

export const EditAppDrawer = ({ tenant, onOpenChange }: { tenant: TenantRecord | null; onOpenChange: (o: boolean) => void }) => {
  const actions = usePlatformActions()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [appType, setAppType] = useState('retail')
  const [status, setStatus] = useState<TenantStatus>('active')
  const [saving, setSaving] = useState(false)
  const slugState = useSlugAvailability(slug, tenant?.slug)

  useEffect(() => {
    if (!tenant) return
    setName(tenant.name)
    setSlug(tenant.slug)
    setAppType(tenant.appType)
    setStatus(tenant.status)
  }, [tenant])

  const warnings = useMemo(() => {
    if (!tenant) return []
    const w: string[] = []
    if (slug !== tenant.slug) w.push('Changing the subdomain breaks existing links and bookmarks — tell the owner the new address.')
    if (appType !== tenant.appType) w.push('Changing the type switches the owner’s whole app (menus, pages, features).')
    if (status === 'suspended' && tenant.status === 'active')
      w.push('Suspending blocks the owner and all staff from signing in until reactivated.')
    return w
  }, [tenant, slug, appType, status])

  const canSave = !!tenant && name.trim().length > 1 && !['invalid', 'reserved', 'taken', 'checking'].includes(slugState)

  const save = async () => {
    if (!tenant) return
    setSaving(true)
    try {
      const patch: Parameters<typeof actions.update>[1] = {}
      if (name.trim() !== tenant.name) patch.name = name.trim()
      if (slug !== tenant.slug) patch.slug = slug
      if (appType !== tenant.appType) patch.appType = appType
      if (status !== tenant.status) patch.status = status
      if (Object.keys(patch).length > 0) await actions.update(tenant.id, patch)
      onOpenChange(false)
    } catch {
      // toast shown
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={!!tenant}
      onOpenChange={onOpenChange}
      title={`Edit ${tenant?.name ?? 'app'}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Business name" htmlFor="ea-name">
          <Input id="ea-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Subdomain" htmlFor="ea-slug">
          <div className="flex items-stretch rounded-xl border border-stone-200 focus-within:border-endeavour focus-within:ring-2 focus-within:ring-endeavour/15 overflow-hidden">
            <input
              id="ea-slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="flex-1 min-w-0 h-10 px-3 text-base sm:text-sm text-stone-800 focus:outline-none"
            />
            <span className="px-3 flex items-center bg-stone-50 border-l border-stone-200 text-sm text-stone-500 whitespace-nowrap">
              .{ROOT_DOMAIN || 'yourdomain.com'}
            </span>
          </div>
          {slug !== tenant?.slug && <SlugHint state={slugState} slug={slug} />}
        </Field>
        <Field label="Business type">
          <VerticalPicker value={appType} onChange={setAppType} />
        </Field>
        <Field label="Status">
          <Segmented
            ariaLabel="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        </Field>
        {warnings.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            {warnings.map((w) => (
              <p key={w} className="flex gap-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  )
}
