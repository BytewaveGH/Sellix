'use client'

// Console analytics data (§15), through /api/platform/* like everything else.
// `null` data = the backend doesn't count it yet.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { monthlyEquivalent } from '@/lib/subscription/access'
import { usageRows, type PlatformUsage, type TenantActivity, type UsageRow } from '@/lib/platform/analytics'
import { call, useTenants, useTenantsStats } from './api'
import { useBillingBook } from './billing'
import type { TenantRecord } from './types'

export const analyticsApi = {
  platform: (days: number) => call<PlatformUsage | null>(`/api/platform/analytics?days=${days}`, undefined, 'Couldn’t load analytics'),
  tenant: (id: number, days: number) =>
    call<TenantActivity | null>(`/api/platform/tenants/${id}/activity?days=${days}`, undefined, 'Couldn’t load this business’s activity'),
}

export const usePlatformUsage = (days: number) =>
  useQuery({ queryKey: ['platform', 'analytics', days], queryFn: () => analyticsApi.platform(days), staleTime: 120_000, retry: false })

export const useTenantActivity = (id: number | null, days: number) =>
  useQuery({
    queryKey: ['platform', 'activity', id, days],
    queryFn: () => analyticsApi.tenant(id!, days),
    enabled: id !== null,
    staleTime: 120_000,
    retry: false,
  })

const DAY = 86_400_000

// Every business with its usage, health and billing, ready for the table.
// Until the backend sends usage, health comes from each business's
// "last activity" in the existing stats.
export const useUsageBook = (days: number) => {
  const tenants = useTenants()
  const usage = usePlatformUsage(days)
  const book = useBillingBook()
  const fallbackNeeded = usage.isSuccess && usage.data === null
  const stats = useTenantsStats(fallbackNeeded ? tenants.data.map((t) => t.id) : [])
  const statsKey = stats.map((s) => s.dataUpdatedAt).join(',')

  const rows = useMemo<UsageRow<TenantRecord>[]>(() => {
    const now = new Date()
    const lastSeen = new Map(tenants.data.map((t, i) => [t.id, stats[i]?.data?.lastActivityAt ?? null]))
    const billing = new Map(
      (book.view?.rows ?? []).map((r) => [
        r.tenant.id,
        {
          state: r.access.state,
          planName: r.access.plan?.name,
          monthly: r.sub && r.access.plan ? monthlyEquivalent(r.access.plan, r.sub.cycle) : 0,
          trialEndsInDays: r.access.state === 'trialing' && r.access.endsAt ? Math.ceil((r.access.endsAt.getTime() - now.getTime()) / DAY) : null,
        },
      ])
    )
    return usageRows(
      tenants.data,
      usage.data?.tenants ?? null,
      usage.data?.days ?? days,
      now,
      (t) => lastSeen.get(t.id),
      (t) => billing.get(t.id)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants.data, usage.data, book.view, days, statsKey])

  return {
    rows,
    usage: usage.data ?? null,
    // The backend answered, but doesn't count usage yet.
    waiting: fallbackNeeded,
    isLoading: tenants.isLoading || usage.isLoading,
    error: usage.error ?? null,
  }
}
