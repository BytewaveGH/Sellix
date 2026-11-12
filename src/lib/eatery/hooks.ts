'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useAxios } from '@/hooks/use-axios'
import { publicApiClient } from '@/lib/public-axios-client'
import { apiErrorMessage, apiStatus } from '@/lib/api-error'
import { createApiSource, createLocalSource, DATA_SOURCE_KIND, type EaterySource, type OrderTicket } from './data-source'
import { prepareImage, type ImageKind } from './images'
import { itemNames, offlineCounterOrder, offlineOrderBody } from './offline-order'
import { nextReceiptNo } from '../till'
import { dressForFestival } from './festivals'
import type { CounterOrderInput, DirectoryEntry, ResourceMap, ResourceName, Restaurant, StorefrontBundle } from './types'

// Network errors and 5xx only, at most twice; a failed query waits for the user.
const retry = (count: number, err: unknown) => count < 2 && (apiStatus(err) === undefined || (apiStatus(err) ?? 0) >= 500)
const notFailed = (q: { state: { status: string } }) => q.state.status !== 'error'
const QUERY_DEFAULTS = {
  retry,
  retryOnMount: false,
  refetchOnMount: notFailed,
  refetchOnWindowFocus: false,
  refetchOnReconnect: notFailed,
} as const

// Re-render every `ms` so "open now", happy hour and time-based items stay current.
export const useNow = (ms = 30_000) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const publicRequest = (c: Parameters<typeof publicApiClient.request>[0]) => publicApiClient.request(c)

// In local mode the owner's dashboard and the customer's page may be two tabs
// of the same browser: pick up each other's writes.
const useCrossTabSync = () => {
  const qc = useQueryClient()
  useEffect(() => {
    if (DATA_SOURCE_KIND !== 'local') return
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('sellix-eatery:v1:')) void qc.invalidateQueries({ queryKey: ['eatery'] })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [qc])
}

// ── Public ──

export const usePublicSource = (): EaterySource => {
  const request = useAxios()
  return useMemo(() => (DATA_SOURCE_KIND === 'local' ? createLocalSource(null) : createApiSource(request, publicRequest)), [request])
}

// Customers see each restaurant in today's festival look, if the owner allows
// it (festivals.ts). Re-dressed once a day, not on every refetch.
const useFestivalDress = () => {
  const day = useNow(60_000).toDateString()
  return useCallback(<R extends Pick<Restaurant, 'theme'>>(r: R): R => ({ ...r, theme: dressForFestival(r.theme, new Date(day)) }), [day])
}

export const useDirectory = () => {
  const source = usePublicSource()
  const dress = useFestivalDress()
  useCrossTabSync()
  return useQuery({
    queryKey: ['eatery', source.kind, 'directory'],
    queryFn: () => source.directory(),
    select: useCallback((list: DirectoryEntry[]) => list.map(dress), [dress]),
    staleTime: 60_000,
    ...QUERY_DEFAULTS,
  })
}

export const useStorefront = (slug: string) => {
  const source = usePublicSource()
  const dress = useFestivalDress()
  useCrossTabSync()
  return useQuery({
    queryKey: ['eatery', source.kind, 'store', slug],
    queryFn: () => source.storefront(slug),
    select: useCallback((b: StorefrontBundle | null) => b && { ...b, restaurant: dress(b.restaurant) }, [dress]),
    staleTime: 30_000,
    ...QUERY_DEFAULTS,
  })
}

export const useTrackedOrder = (ticket: OrderTicket | null) => {
  const source = usePublicSource()
  useCrossTabSync()
  return useQuery({
    queryKey: ['eatery', source.kind, 'order', ticket?.slug, ticket?.code],
    queryFn: () => source.trackOrder(ticket!),
    enabled: !!ticket,
    // Follow the kitchen while the order is open.
    refetchInterval: (q) => (q.state.data && ['completed', 'cancelled'].includes(q.state.data.status) ? false : 10_000),
    ...QUERY_DEFAULTS,
  })
}

// ── Owner ──

export const useOwnerSource = (): { source: EaterySource; ready: boolean; scope: string } => {
  const request = useAxios()
  const { data: session, status } = useSession()
  const scope = session?.user?.tenant || 'default'
  const source = useMemo(
    () => (DATA_SOURCE_KIND === 'local' ? createLocalSource(scope) : createApiSource(request, publicRequest)),
    [scope, request]
  )
  return { source, ready: status === 'authenticated', scope }
}

const OWNER_RESOURCES: ResourceName[] = [
  'restaurants',
  'categories',
  'items',
  'promotions',
  'orders',
  'ingredients',
  'recipes',
  'stockMoves',
  'expenses',
  'packaging',
]
const SELECTED_KEY = 'sellix-eatery:selected'

const readSelected = () => {
  try {
    return Number(window.localStorage.getItem(SELECTED_KEY)) || null
  } catch {
    return null
  }
}

// Say what actually went wrong — most often, in API mode, that the eatery
// endpoints aren't on the server yet.
export const ownerLoadMessage = (err: unknown, kind: 'api' | 'local') => {
  const status = apiStatus(err)
  const msg = apiErrorMessage(err, '')
  if (kind === 'api' && (status === 404 || status === 405))
    return 'The eatery service isn’t on the Sellix server yet. Until it is, run the eatery in this browser: set NEXT_PUBLIC_EATERY_DATA_SOURCE=local in .env.local and restart the app.'
  if (status === 403 && /unknown tenant|tenant mismatch/i.test(msg))
    return 'This business isn’t available right now. Please try again in a moment or contact support.'
  if (status === 403) return 'You don’t have access to the eatery.'
  if (status === undefined)
    return kind === 'api'
      ? 'Couldn’t reach the Sellix server. Check your connection and try again.'
      : msg || 'Couldn’t read the data saved in this browser.'
  return msg ? `${msg} (${status})` : `Couldn’t load your restaurants (error ${status}).`
}

export type OwnerData = { [R in ResourceName]: ResourceMap[R][] } & {
  isLoading: boolean
  error: string | null
  retry: () => void
  // The restaurant being managed (remembered per device).
  restaurant: Restaurant | null
  select: (id: number) => void
}

export const useOwnerData = (): OwnerData => {
  const { source, ready, scope } = useOwnerSource()
  useCrossTabSync()
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => setSelected(readSelected()), [])
  const results = useQueries({
    queries: OWNER_RESOURCES.map((r) => ({
      queryKey: ['eatery', source.kind, 'owner', scope, r],
      queryFn: () => source.list(r),
      enabled: ready,
      staleTime: 15_000,
      // New orders arrive on their own.
      refetchInterval: r === 'orders' ? 8_000 : (false as const),
      ...QUERY_DEFAULTS,
    })),
  })
  const select = useCallback((id: number) => {
    setSelected(id)
    try {
      window.localStorage.setItem(SELECTED_KEY, String(id))
    } catch {
      // per-device convenience only
    }
  }, [])

  return useMemo(() => {
    const data = Object.fromEntries(OWNER_RESOURCES.map((r, i) => [r, (results[i].data as unknown[]) ?? []])) as {
      [R in ResourceName]: ResourceMap[R][]
    }
    const failed = results.find((r) => r.error)
    const restaurant = data.restaurants.find((r) => r.id === selected) ?? data.restaurants[0] ?? null
    const rid = restaurant?.id
    return {
      restaurants: data.restaurants,
      categories: data.categories.filter((c) => c.restaurantId === rid).sort((a, b) => a.position - b.position),
      items: data.items.filter((i) => i.restaurantId === rid).sort((a, b) => a.position - b.position),
      promotions: data.promotions.filter((p) => p.restaurantId === rid),
      orders: data.orders.filter((o) => o.restaurantId === rid).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      ingredients: data.ingredients.filter((x) => x.restaurantId === rid).sort((a, b) => a.name.localeCompare(b.name)),
      recipes: data.recipes.filter((x) => x.restaurantId === rid),
      stockMoves: data.stockMoves.filter((x) => x.restaurantId === rid).sort((a, b) => (a.date < b.date ? 1 : -1)),
      expenses: data.expenses.filter((x) => x.restaurantId === rid).sort((a, b) => (a.date < b.date ? 1 : -1)),
      packaging: data.packaging.filter((x) => x.restaurantId === rid),
      isLoading: !ready || (!failed && results.some((r) => r.isLoading)),
      error: failed ? ownerLoadMessage(failed.error, source.kind) : null,
      retry: () => results.forEach((r) => r.isError && void r.refetch()),
      restaurant,
      select,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected, select, ...results.map((r) => r.data), ...results.map((r) => r.error)])
}

// Writes. 400/409/422 go to `error` for the open form to show; others toast.
export const useEateryActions = () => {
  const { source, scope } = useOwnerSource()
  const qc = useQueryClient()
  const [error, setError] = useState<{ message: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['eatery', source.kind] })
  // The menu already on this device, to price a counter order made offline.
  const loaded = <R extends ResourceName>(r: R) => (qc.getQueryData(['eatery', source.kind, 'owner', scope, r]) as ResourceMap[R][] | undefined) ?? []
  const offlinePreview = (restaurantId: number, input: CounterOrderInput) => {
    const restaurant = loaded('restaurants').find((r) => r.id === restaurantId)
    if (!restaurant) return undefined
    const menu = { restaurant, categories: loaded('categories'), items: loaded('items'), promotions: loaded('promotions') }
    const now = new Date()
    // Only used if the order has to wait offline; a live order is numbered by the server.
    let receiptNo: string | undefined
    const number = () => (receiptNo ??= nextReceiptNo())
    return {
      result: (tempId: number) => offlineCounterOrder(menu, input, tempId, now, number()),
      body: () => offlineOrderBody(menu, input, number(), now),
      names: itemNames(menu, input),
    }
  }

  const run = async <T>(fn: () => Promise<T>, fail: string, quiet = false): Promise<T> => {
    setError(null)
    try {
      const out = await fn()
      await refresh()
      return out
    } catch (err) {
      const message = apiErrorMessage(err, fail)
      if ([400, 409, 422].includes(apiStatus(err) ?? 0)) setError({ message })
      else if (!quiet) toast.error(message)
      if (apiStatus(err) === 404) void refresh()
      throw err
    }
  }

  return {
    kind: source.kind,
    scope,
    error,
    clearError: () => setError(null),
    create: <R extends ResourceName>(r: R, body: Omit<ResourceMap[R], 'id'>) => run(() => source.create(r, body), 'Couldn’t save.'),
    update: <R extends ResourceName>(r: R, id: number, body: Partial<Omit<ResourceMap[R], 'id'>>) =>
      run(() => source.update(r, id, body), 'Couldn’t save changes.'),
    remove: (r: ResourceName, id: number) => run(() => source.remove(r, id), 'Couldn’t delete.'),
    // Prepare (crop/compress) and store a logo or cover; returns its URL.
    uploadImage: (restaurantId: number, file: File, kind: ImageKind) =>
      run(async () => source.uploadImage(restaurantId, await prepareImage(file, kind), kind), 'Couldn’t upload the image.', true),
    // Counter (POS) order: priced by the source, accepted at once.
    createCounterOrder: (restaurantId: number, input: CounterOrderInput) =>
      run(() => source.createCounterOrder(restaurantId, input, offlinePreview(restaurantId, input)), 'Couldn’t send the order.'),
    claimDemo: () => run(() => (source.claimDemo ? source.claimDemo() : Promise.resolve([])), 'Couldn’t add the examples.'),
    // Sequential, for building a menu from a preset.
    createMany: <R extends ResourceName>(r: R, bodies: Omit<ResourceMap[R], 'id'>[]) =>
      run(async () => {
        const out: ResourceMap[R][] = []
        for (const b of bodies) out.push(await source.create(r, b))
        return out
      }, 'Couldn’t save.'),
  }
}
