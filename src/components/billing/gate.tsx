'use client'

// Wraps every business dashboard page (ILayout):
// - canceled/expired → a lock screen (data kept; the owner can still reach billing)
// - a page whose feature isn't on the plan → an upgrade screen
// - otherwise the page, under a banner when the trial is ending or payment is due.
//
// While billing loads, or if it can't be loaded, pages render normally (fail open).

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { AlertTriangle, ArrowRight, Lock, LogOut, ShieldCheck, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Card, CopyButton } from '@/components/kit/ui'
import { canUseFeature, cedis, cheapestPlanWith, cycleLabel, priceFor } from '@/lib/subscription/access'
import { featureForPath, type Feature } from '@/lib/subscription/features'
import { useBilling } from '@/lib/subscription/client'
import { shortDate } from './bits'

const BILLING_RE = /^\/(en|fr)\/billing(\/|$)/

const useLocale = () => (useParams()?.locale as string) || 'en'

export const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const billing = useBilling()
  const pending = !billing.settled || BILLING_RE.test(pathname ?? '')
  if (!pending && !billing.access.hasAccess) return <LockedScreen />
  const feature = featureForPath(pathname)
  if (!pending && feature && !canUseFeature(billing.access, feature.key)) return <UpgradeScreen feature={feature} />
  // The page keeps the same place in the tree whether or not the banner shows:
  // when it moved, React rebuilt the page as billing loaded, closing any form
  // or drawer opened in the first second.
  return (
    <>
      {!pending && <BillingBanner />}
      {children}
    </>
  )
}

// ── Screens ──────────────────────────────────────────────────────────────────

const Screen = ({ icon: Icon, tone, children }: { icon: typeof Lock; tone: 'rose' | 'blue'; children: React.ReactNode }) => (
  <div className="min-h-[70vh] flex items-center justify-center py-10">
    <Card className="w-full max-w-lg p-6 sm:p-8 text-center">
      <span
        className={cn(
          'mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-5',
          tone === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-endeavour/10 text-endeavour'
        )}
      >
        <Icon className="h-7 w-7" />
      </span>
      {children}
    </Card>
  </div>
)

export const HowToPay = ({ className }: { className?: string }) => {
  const { catalog } = useBilling()
  const { data: session } = useSession()
  const reference = session?.user?.tenant ?? ''
  const { paymentInstructions, supportContact } = catalog.settings
  if (!paymentInstructions && !supportContact) return null
  return (
    <div className={cn('rounded-xl border border-stone-200 bg-stone-50 p-4 text-left', className ?? 'mt-6')}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">How to pay</p>
      {paymentInstructions && <p className="text-sm text-stone-700 mt-1.5 whitespace-pre-line">{paymentInstructions}</p>}
      {reference && (
        <p className="mt-2 inline-flex items-center gap-1 text-sm text-stone-600">
          Reference: <span className="font-mono font-semibold text-stone-900">{reference}</span>
          <CopyButton value={reference} label="Copy reference" />
        </p>
      )}
      {supportContact && <p className="text-xs text-stone-500 mt-2">Questions? {supportContact}</p>}
    </div>
  )
}

export const LockedScreen = () => {
  const locale = useLocale()
  const { access, subscription, isOwner } = useBilling()
  const trialEnded = access.state === 'expired' && subscription?.status === 'trialing'
  const title =
    access.state === 'canceled' ? 'Your subscription was canceled' : trialEnded ? 'Your trial has ended' : 'Your subscription has ended'
  return (
    <Screen icon={Lock} tone="rose">
      <h1 className="text-xl font-extrabold tracking-tight text-stone-900">{title}</h1>
      <p className="text-sm text-stone-500 mt-2 max-w-sm mx-auto">
        {isOwner
          ? 'Your records are safe — nothing has been deleted. Renew to pick up exactly where you left off.'
          : 'Your records are safe. Ask the business owner to renew the subscription, then sign in again.'}
      </p>
      {isOwner && access.plan && (
        <p className="mt-4 text-sm text-stone-700">
          <span className="font-semibold">{access.plan.name}</span> · {cedis(access.plan.monthlyPrice)}/month
        </p>
      )}
      {isOwner && <HowToPay />}
      <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
        {isOwner && (
          <Link href={`/${locale}/billing`}>
            <Button className="w-full sm:w-auto">
              Plans & billing <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <Button variant="secondary" icon={LogOut} onClick={() => signOut({ callbackUrl: `/${locale}` })}>
          Sign out
        </Button>
      </div>
    </Screen>
  )
}

export const UpgradeScreen = ({ feature }: { feature: Feature }) => {
  const locale = useLocale()
  const { access, catalog, isOwner } = useBilling()
  const plan = cheapestPlanWith(catalog.plans, feature.key)
  return (
    <Screen icon={Sparkles} tone="blue">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-endeavour/80">
        {plan ? `${plan.name} feature` : 'Not on your plan'}
      </p>
      <h1 className="text-xl font-extrabold tracking-tight text-stone-900 mt-1.5">{feature.label}</h1>
      <p className="text-sm text-stone-500 mt-2 max-w-sm mx-auto">{feature.description}.</p>
      <p className="text-sm text-stone-600 mt-4">
        You’re on <span className="font-semibold">{access.plan?.name ?? 'your current plan'}</span>
        {plan && (
          <>
            . {plan.name} adds this from{' '}
            <span className="font-semibold">
              {cedis(priceFor(plan, 'monthly'))}/{cycleLabel('monthly')}
            </span>
          </>
        )}
        .
      </p>
      <div className="mt-6 flex justify-center">
        {isOwner ? (
          <Link href={`/${locale}/billing`}>
            <Button>
              Compare plans <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <p className="text-xs text-stone-500 inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Ask the business owner to upgrade.
          </p>
        )}
      </div>
    </Screen>
  )
}

// ── Banner ───────────────────────────────────────────────────────────────────

const DISMISS_KEY = 'sellix-billing-banner-dismissed'
const today = () => new Date().toISOString().slice(0, 10)

export const BillingBanner = () => {
  const locale = useLocale()
  const { access, subscription, isOwner } = useBilling()
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === today())
    } catch {
      setDismissed(false)
    }
  }, [])

  if (!isOwner) return null
  const days = Math.max(0, access.daysLeft ?? 0)
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  let tone: 'amber' | 'sky' | 'stone' | null = null
  let text = ''
  // Past due can't be dismissed: access stops when grace runs out.
  let dismissible = true
  if (access.state === 'past_due') {
    tone = 'amber'
    dismissible = false
    text = `Payment overdue since ${shortDate(access.endsAt!)}. The dashboard locks ${access.lockAt ? `on ${shortDate(access.lockAt)}` : 'soon'} — your data stays safe.`
  } else if (access.state === 'trialing' && days <= 7) {
    tone = 'sky'
    text = `Your free trial ends ${when}. Choose a plan to keep going without interruption.`
  } else if (access.state === 'active' && subscription?.cancelAtPeriodEnd && days <= 14) {
    tone = 'stone'
    text = `Your subscription ends ${when} and won’t renew.`
  }
  if (!tone || (dismissible && dismissed)) return null

  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
        tone === 'amber' && 'border-amber-200 bg-amber-50 text-amber-900',
        tone === 'sky' && 'border-sky-200 bg-sky-50 text-sky-900',
        tone === 'stone' && 'border-stone-200 bg-stone-50 text-stone-700'
      )}
    >
      <span className="flex items-start gap-2 flex-1">
        {tone === 'amber' ? (
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
        )}
        {text}
      </span>
      <span className="flex items-center gap-1 self-end sm:self-auto">
        <Link href={`/${locale}/billing`} className="font-semibold underline-offset-2 hover:underline whitespace-nowrap px-2 py-1">
          {access.state === 'past_due' ? 'Pay now' : 'See plans'}
        </Link>
        {dismissible && (
          <button
            type="button"
            aria-label="Dismiss for today"
            onClick={() => {
              setDismissed(true)
              try {
                localStorage.setItem(DISMISS_KEY, today())
              } catch {}
            }}
            className="h-8 w-8 rounded-lg flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </span>
    </div>
  )
}
