'use client'

import { useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useAxios } from '@/hooks/use-axios'
import { usePermissions } from '@/hooks/use-permissions'
import { apiErrorMessage, apiStatus } from '@/lib/api-error'
import { createApiSource, createLocalSource, DATA_SOURCE_KIND, type DataSource, type DocumentDraft } from './data-source'
import { realEstateAccess, RESOURCE_AREA, type Area, type RealEstateAccess } from './access'
import { classifyLoadError, isFormError, loadErrorMessage, retryDelay, shouldRetry, type LoadErrorKind } from './errors'
import { compressFile } from '@/app/[locale]/(stores)/stores/pos/_logics/scanner/image'
import { prepareImage } from '@/lib/eatery/images'
import type { SiteSettings } from './site'
import type { DocumentRecord, ResourceMap, ResourceName } from './types'

const RESOURCES: ResourceName[] = [
  'unitTypes',
  'properties',
  'units',
  'tenants',
  'leases',
  'payments',
  'bookings',
  'maintenance',
  'projects',
  'phases',
  'expenses',
  'documents',
]

// Added after the first eight. A backend without them yet answers 404 on the
// list, which just means "none".
const OPTIONAL: ResourceName[] = ['projects', 'phases', 'expenses', 'documents']

export const useDataSource = (): { source: DataSource; ready: boolean; scope: string } => {
  const request = useAxios()
  const { data: session, status } = useSession()
  const scope = session?.user?.tenant || 'default'
  const source = useMemo(() => (DATA_SOURCE_KIND === 'local' ? createLocalSource(scope) : createApiSource(request)), [scope, request])
  // The API needs a signed-in, tenant-bound session; local data only needs the scope.
  return { source, ready: status === 'authenticated', scope }
}

export const useRealEstateAccess = (): RealEstateAccess => {
  const { canViewReports, canManageProducts, canManageSales, canManageOperations } = usePermissions()
  return useMemo(
    () => realEstateAccess({ canViewReports, canManageProducts, canManageSales, canManageOperations }),
    [canViewReports, canManageProducts, canManageSales, canManageOperations]
  )
}

// A failed query stays failed until the user asks again: no refetch when
// another section mounts, the window regains focus or the network returns.
const notFailed = (q: Query) => q.state.status !== 'error'

export type Portfolio = { [R in ResourceName]: ResourceMap[R][] } & {
  isLoading: boolean
  // Page-level failure (anything but a section's 403), shown as an error panel.
  error: string | null
  errorKind: LoadErrorKind | null
  // Refetch the collections that failed, once.
  retry: () => void
  isRetrying: boolean
  // Permission, and any 403 actually received, per area.
  can: { read: (a: Area) => boolean; write: (a: Area) => boolean }
  propertyById: Map<number, ResourceMap['properties']>
  unitById: Map<number, ResourceMap['units']>
  unitTypeById: Map<number, ResourceMap['unitTypes']>
  tenantById: Map<number, ResourceMap['tenants']>
}

// Every collection is small (a landlord's portfolio), so screens load them all
// and derive what they need. React Query shares and caches the requests.
export const usePortfolio = (): Portfolio => {
  const { source, ready, scope } = useDataSource()
  const access = useRealEstateAccess()
  const results = useQueries({
    queries: RESOURCES.map((r) => ({
      queryKey: ['real-estate', source.kind, scope, r],
      queryFn: async () => {
        try {
          return await source.list(r)
        } catch (err) {
          if (OPTIONAL.includes(r) && apiStatus(err) === 404) return []
          throw err
        }
      },
      // Never ask for what this user isn't allowed to read.
      enabled: ready && access[RESOURCE_AREA[r]].read,
      staleTime: 30_000,
      // Network errors and 5xx only, at most twice. 4xx answers are final.
      retry: shouldRetry,
      retryDelay,
      retryOnMount: false,
      refetchOnMount: notFailed,
      refetchOnWindowFocus: false,
      refetchOnReconnect: notFailed,
    })),
  })

  return useMemo(() => {
    const data = Object.fromEntries(RESOURCES.map((r, i) => [r, (results[i].data as unknown[]) ?? []])) as {
      [R in ResourceName]: ResourceMap[R][]
    }
    const denied = new Set<Area>()
    let fatal: unknown = null
    results.forEach((r, i) => {
      if (!r.error) return
      if (classifyLoadError(r.error) === 'forbidden') denied.add(RESOURCE_AREA[RESOURCES[i]])
      else fatal ??= r.error
    })
    return {
      ...data,
      // A failure ends the loading state even while other collections are still out.
      isLoading: !ready || (!fatal && results.some((r) => r.isLoading)),
      error: fatal ? loadErrorMessage(fatal) : null,
      errorKind: fatal ? classifyLoadError(fatal) : null,
      retry: () => results.forEach((r) => r.isError && !r.isFetching && void r.refetch()),
      isRetrying: results.some((r) => r.isError && r.isFetching),
      can: {
        read: (a: Area) => access[a].read && !denied.has(a),
        write: (a: Area) => access[a].write && !denied.has(a),
      },
      propertyById: new Map(data.properties.map((p) => [p.id, p])),
      unitById: new Map(data.units.map((u) => [u.id, u])),
      unitTypeById: new Map(data.unitTypes.map((t) => [t.id, t])),
      tenantById: new Map(data.tenants.map((t) => [t.id, t])),
    }
    // results is a new array each render; its data/error/fetching identities are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, access, ...results.map((r) => r.data), ...results.map((r) => r.error), ...results.map((r) => r.isFetching)])
}

// The public website's settings (one record per business).
export const useSiteSettings = () => {
  const { source, ready, scope } = useDataSource()
  return useQuery({
    queryKey: ['real-estate', source.kind, scope, 'site'],
    queryFn: () => source.getSite(),
    enabled: ready,
    staleTime: 30_000,
    retry: shouldRetry,
    retryDelay,
    refetchOnWindowFocus: false,
  })
}

export type SiteImageKind = 'photo' | 'logo' | 'cover'

// Website images: resized before upload so listings load fast on mobile data.
// Local mode keeps them inside browser storage, so they're made smaller there.
// Logos are cropped square (512 px), like the eatery's.
export const prepareSitePhoto = async (file: Blob, kind: SiteImageKind = 'photo') => {
  if (kind === 'logo') return prepareImage(file, 'logo')
  const local = DATA_SOURCE_KIND === 'local'
  const out = await compressFile(file, { maxEdge: local ? 1200 : 1600, quality: 0.75, maxBytes: (local ? 180 : 500) * 1024 })
  if (!out) throw new Error('Couldn’t make that photo small enough — try another')
  return out
}

// Writes. Each call refreshes all real-estate data (cascades on delete touch
// several collections). Writes are never retried. Failures are surfaced, then
// rethrown:
// - 400/409/422 on an `inline` call → `error`, for the open form or dialog to show;
// - 404 → a toast, and the lists are refetched once so the stale row goes;
// - anything else → a toast.
export const useRealEstateActions = (opts: { inline?: boolean } = {}) => {
  const { source, scope } = useDataSource()
  const qc = useQueryClient()
  const [error, setError] = useState<{ message: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['real-estate', source.kind, scope] })

  const run = async <T>(fn: () => Promise<T>, failMsg: string, inline = opts.inline): Promise<T> => {
    setError(null)
    try {
      const out = await fn()
      await refresh()
      return out
    } catch (err) {
      const message = apiErrorMessage(err, failMsg)
      if (apiStatus(err) === 404) {
        toast.error(message === 'not found' ? 'That record no longer exists.' : message)
        void refresh()
      } else if (inline && isFormError(err)) {
        setError({ message })
      } else {
        toast.error(message)
      }
      throw err
    }
  }

  return {
    kind: source.kind,
    // The last 400/409/422 of an `inline` call; cleared when the next call starts.
    error,
    create: <R extends ResourceName>(r: R, body: Omit<ResourceMap[R], 'id'>) => run(() => source.create(r, body), 'Couldn’t save.'),
    // Sequential so generated unit names keep their order.
    createMany: <R extends ResourceName>(r: R, bodies: Omit<ResourceMap[R], 'id'>[]) =>
      run(async () => {
        const out: ResourceMap[R][] = []
        for (const b of bodies) out.push(await source.create(r, b))
        return out
      }, 'Couldn’t save.'),
    update: <R extends ResourceName>(r: R, id: number, body: Partial<Omit<ResourceMap[R], 'id'>>) =>
      run(() => source.update(r, id, body), 'Couldn’t save changes.'),
    // `inline` when called from a ConfirmDialog, which shows a conflict in place.
    remove: (r: ResourceName, id: number, o: { inline?: boolean } = {}) =>
      run(() => source.remove(r, id), 'Couldn’t delete.', o.inline ?? opts.inline),
    uploadDocument: (meta: DocumentDraft, file: File) => run(() => source.uploadDocument(meta, file), `Couldn’t upload ${file.name}.`),
    // Reads don't refresh anything; failures still toast.
    getFile: async (doc: DocumentRecord) => {
      try {
        return await source.getFile(doc)
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Couldn’t open the file.'))
        throw err
      }
    },
    shareLink: (doc: DocumentRecord) => source.shareLink(doc).catch(() => null),
    saveSite: (site: SiteSettings) => run(() => source.saveSite(site), 'Couldn’t save the website settings.'),
    // Resolves to the photo's link; nothing is saved until the record using it is.
    uploadImage: async (file: File, kind: SiteImageKind = 'photo') => {
      try {
        return await source.uploadImage(await prepareSitePhoto(file, kind))
      } catch (err) {
        toast.error(apiErrorMessage(err, err instanceof Error ? err.message : 'Couldn’t upload the photo.'))
        throw err
      }
    },
  }
}
