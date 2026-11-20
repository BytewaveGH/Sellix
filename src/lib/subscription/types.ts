// Subscriptions: what a business pays for and what that unlocks.
//
// Stored records hold intent only (plan, cycle, period end, cancel flag).
// Whether a business is past due or expired is derived from dates and the
// grace period (access.ts), so nothing needs a scheduled job to flip states.

import type { FeatureKey } from './features'
import type { UsagePricing } from './usage'

export type BillingCycle = 'monthly' | 'yearly'

export interface PlanLimits {
  // Staff accounts the owner can create. null = unlimited.
  staff: number | null
}

export interface Plan {
  id: string
  name: string
  tagline: string
  // Whole cedis.
  monthlyPrice: number
  yearlyPrice: number
  limits: PlanLimits
  // Gated features this plan unlocks. Core module pages are always included.
  features: FeatureKey[]
  trialDays: number
  // Shown as "Most popular" on the comparison.
  highlighted?: boolean
  // Hidden from new sign-ups and upgrade options; existing subscribers keep it.
  archived?: boolean
  // "Pay as you sell" (usage.ts): no monthly price, every feature, unlimited
  // staff, and a service fee on sales billed monthly. Prices, features, staff
  // and trial above are ignored (parseCatalog normalises them).
  usage?: UsagePricing
}

export interface BillingSettings {
  currency: 'GHS'
  // Days after a period ends before access is cut off.
  graceDays: number
  // Shown to owners on their billing page, e.g. MoMo number and reference rules.
  paymentInstructions: string
  supportContact: string
}

export interface Catalog {
  plans: Plan[]
  settings: BillingSettings
}

export type PaymentMethod = 'momo' | 'bank' | 'cash' | 'card' | 'other'

export interface Payment {
  id: string
  amount: number
  method: PaymentMethod
  reference?: string
  paidAt: string
  // The period this payment paid for.
  periodStart: string
  periodEnd: string
  planId: string
  cycle: BillingCycle
}

export interface PlanRequest {
  planId: string
  cycle: BillingCycle
  note?: string
  requestedAt: string
}

export interface BillingEvent {
  at: string
  // 'assign' | 'record-payment' | ... (the action type) — kept as a string so
  // older records stay readable when actions are added.
  type: string
  summary: string
  actor: 'platform' | 'owner'
}

// Stored status. 'past_due' and 'expired' are never stored — see access.ts.
export type StoredStatus = 'trialing' | 'active' | 'canceled'

export interface Subscription {
  tenantId: number
  planId: string
  cycle: BillingCycle
  status: StoredStatus
  // Trialing: access runs to trialEndsAt. Paid: to currentPeriodEnd.
  trialEndsAt?: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt?: string
  request?: PlanRequest
  payments: Payment[]
  events: BillingEvent[]
  updatedAt: string
}

// Derived state, in the order a business moves through it.
// 'none' = no subscription record (registered before billing existed) — full access.
export type BillingState = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
