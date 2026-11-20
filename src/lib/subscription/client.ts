'use client'

// The signed-in business's subscription, for gating the dashboard.
//
// Fails open: if billing can't be loaded (backend down, endpoint not shipped),
// the dashboard behaves as if there were no subscription — full access. A
// billing outage must never lock a paying business out of its tills. The
// backend enforces access for real (402 on API calls); this is the UX layer.

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BILLING_CHANGED_EVENT } from './events'
import { useSession } from 'next-auth/react'
import { accessFor, type Access } from './access'
import type { BillingAction } from './billing'
import { DEFAULT_CATALOG } from './plans'
import type { TenantBilling } from './server-store'
import type { Subscription } from './types'

export const BILLING_KEY = ['billing'] as const

const request = async <T>(init?: RequestInit): Promise<T> => {
  const res = await fetch('/api/billing', init?.body ? { ...init, headers: { 'Content-Type': 'application/json' } } : init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message ?? 'Billing is unavailable right now')
  return body?.data as T
}

export const useBilling = () => {
  const { data: session, status } = useSession()
  const user = session?.user
  const enabled = status === 'authenticated' && !!user?.tenant && user.accountType !== 'super-admin'
  const q = useQuery({
    queryKey: BILLING_KEY,
    queryFn: () => request<TenantBilling>(),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  })
  // A 402 from the API means our cached view is out of date.
  const qc = useQueryClient()
  useEffect(() => {
    const reload = () => void qc.invalidateQueries({ queryKey: BILLING_KEY })
    window.addEventListener(BILLING_CHANGED_EVENT, reload)
    return () => window.removeEventListener(BILLING_CHANGED_EVENT, reload)
  }, [qc])
  const catalog = q.data?.catalog ?? DEFAULT_CATALOG
  const access: Access = accessFor(q.data?.subscription ?? null, catalog.plans, catalog.settings, new Date())
  return {
    access,
    subscription: q.data?.subscription ?? null,
    // Pay as you sell: sales counted so far this period, if any.
    usage: q.data?.usage ?? null,
    catalog,
    // True once we know (loaded, failed, or not applicable) — gates wait for it.
    settled: !enabled || q.isSuccess || q.isError,
    unavailable: q.isError,
    isOwner: !!user && user.accountType !== 'employee',
  }
}

export const useBillingRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (action: Extract<BillingAction, { type: 'request-plan' | 'clear-request' }>) =>
      request<Subscription>({ method: 'POST', body: JSON.stringify(action) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BILLING_KEY }),
  })
}
