'use client'

// The public website's data: no sign-in, the business picked by its slug.

import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { publicApiClient } from '@/lib/public-axios-client'
import { createApiPublicSource, createLocalPublicSource, DATA_SOURCE_KIND, type PublicSiteSource } from './data-source'
import { shouldRetry, retryDelay } from './errors'
import type { BookingRequest } from './site'

const publicRequest = (c: Parameters<typeof publicApiClient.request>[0]) => publicApiClient.request(c)

export const usePublicSiteSource = (): PublicSiteSource =>
  useMemo(() => (DATA_SOURCE_KIND === 'local' ? createLocalPublicSource() : createApiPublicSource(publicRequest)), [])

export const usePublicSite = (slug: string) => {
  const source = usePublicSiteSource()
  const qc = useQueryClient()
  const key = ['real-estate-site', source.kind, slug]

  // Local mode: the owner's dashboard may be another tab of this browser.
  useEffect(() => {
    if (source.kind !== 'local') return
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(`sellix-real-estate:${slug}:`)) void qc.invalidateQueries({ queryKey: ['real-estate-site', 'local', slug] })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [source.kind, slug, qc])

  return useQuery({
    queryKey: key,
    queryFn: () => source.site(slug),
    enabled: !!slug,
    staleTime: 60_000,
    retry: shouldRetry,
    retryDelay,
    refetchOnWindowFocus: false,
  })
}

// Sellix Homes: free rooms from every landlord's site.
export const useRentalsDirectory = () => {
  const source = usePublicSiteSource()
  const qc = useQueryClient()
  useEffect(() => {
    if (source.kind !== 'local') return
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('sellix-real-estate:')) void qc.invalidateQueries({ queryKey: ['real-estate-directory', 'local'] })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [source.kind, qc])
  return useQuery({
    queryKey: ['real-estate-directory', source.kind],
    queryFn: () => source.directory(),
    staleTime: 60_000,
    retry: shouldRetry,
    retryDelay,
    refetchOnWindowFocus: false,
  })
}

export const useBookingRequest = (slug: string) => {
  const source = usePublicSiteSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (r: BookingRequest) => source.requestBooking(slug, r),
    // The calendar may have changed either way.
    onSettled: () => qc.invalidateQueries({ queryKey: ['real-estate-site', source.kind, slug] }),
  })
}
