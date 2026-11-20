'use client'

// Console billing data: the plan catalog and every business's subscription.
// Like the rest of the console, it goes through /api/platform/* only.

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { BillingAction } from '@/lib/subscription/billing'
import { billingAttention, billingRows } from '@/lib/subscription/insights'
import type { Catalog, Subscription } from '@/lib/subscription/types'
import type { UsageReport } from '@/lib/subscription/usage'
import { call, useTenants } from './api'

const KEY = ['platform', 'billing'] as const
const NO_SUBS: Subscription[] = []

export const billingApi = {
  catalog: () => call<Catalog>('/api/platform/billing/catalog', undefined, 'Couldn’t load plans'),
  saveCatalog: (catalog: Catalog) =>
    call<Catalog>('/api/platform/billing/catalog', { method: 'PUT', body: JSON.stringify(catalog) }, 'Couldn’t save plans'),
  subscriptions: () => call<Subscription[]>('/api/platform/subscriptions', undefined, 'Couldn’t load subscriptions').then((d) => d ?? []),
  usage: (tenantId: number) => call<UsageReport | null>(`/api/platform/tenants/${tenantId}/usage`, undefined, 'Couldn’t load sales for billing'),
  act: (tenantId: number, action: BillingAction) =>
    call<Subscription>(
      `/api/platform/tenants/${tenantId}/subscription`,
      { method: 'POST', body: JSON.stringify(action) },
      'Couldn’t update the subscription'
    ),
}

export const useCatalog = () => useQuery({ queryKey: [...KEY, 'catalog'], queryFn: billingApi.catalog, staleTime: 60_000, retry: false })

// Pay as you sell: one business's sales this billing period (null = not counted yet).
export const useUsage = (tenantId: number, enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, 'usage', tenantId],
    queryFn: () => billingApi.usage(tenantId),
    enabled,
    staleTime: 60_000,
    retry: false,
  })

export const useSubscriptions = () => {
  const q = useQuery({ queryKey: [...KEY, 'subscriptions'], queryFn: billingApi.subscriptions, staleTime: 30_000, retry: false })
  return { ...q, data: q.data ?? NO_SUBS }
}

// Tenants joined with their subscription and derived access, plus what needs
// the operator. `ready` is false until the catalog and subscriptions arrive.
export const useBillingBook = () => {
  const tenants = useTenants()
  const catalog = useCatalog()
  const subs = useSubscriptions()
  const view = useMemo(() => {
    if (!catalog.data) return null
    const now = new Date()
    const rows = billingRows(tenants.data, subs.data, catalog.data, now)
    return { rows, attention: billingAttention(rows, now), catalog: catalog.data }
  }, [tenants.data, subs.data, catalog.data])
  return {
    view,
    subs: subs.data,
    isLoading: tenants.isLoading || catalog.isLoading || subs.isLoading,
    error: catalog.error ?? subs.error ?? null,
  }
}

export const useBillingActions = () => {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const run = async <T>(fn: () => Promise<T>, success: string): Promise<T> => {
    try {
      const out = await fn()
      toast.success(success)
      await refresh()
      return out
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      throw err
    }
  }
  return {
    act: (tenantId: number, action: BillingAction, success: string) => run(() => billingApi.act(tenantId, action), success),
    saveCatalog: (catalog: Catalog) => run(() => billingApi.saveCatalog(catalog), 'Plans saved'),
  }
}
