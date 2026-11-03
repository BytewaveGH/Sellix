// Server-only. Where subscriptions and the plan catalog are kept.
//
// - 'api'  — the Sellix backend (BACKEND_REQUIREMENTS.md §8): platform routes
//            with X-Platform-Key, tenant routes with the owner's own token.
// - 'file' — a JSON file on this server (.data/billing.json by default). For
//            running billing before the backend ships. Needs a writable disk,
//            so it suits `npm run dev` and single-server hosting, not serverless.
//
// Selected with BILLING_STORE (default 'api'). Never import from a client component.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { platformFetch } from '@/lib/platform-api'
import { BillingError, applyAction, parseAction, parseCatalog, OWNER_ACTIONS } from './billing'
import { plansInUse } from './insights'
import { DEFAULT_CATALOG } from './plans'
import type { Catalog, Subscription } from './types'

export interface TenantUser {
  tenant: string
  accessToken: string
}

// What a business sees about its own billing.
export interface TenantBilling {
  subscription: Subscription | null
  catalog: Catalog
}

export interface BillingStore {
  catalog(): Promise<Catalog>
  saveCatalog(input: unknown): Promise<Catalog>
  list(): Promise<Subscription[]>
  get(tenantId: number): Promise<Subscription | null>
  act(tenantId: number, action: unknown): Promise<Subscription>
  forTenant(user: TenantUser): Promise<TenantBilling>
  actForTenant(user: TenantUser, action: unknown): Promise<Subscription>
}

// ── File ─────────────────────────────────────────────────────────────────────

interface FileShape {
  catalog: Catalog
  subscriptions: Record<string, Subscription>
}

const filePath = () => process.env.BILLING_FILE || path.join(process.cwd(), '.data', 'billing.json')

const read = async (): Promise<FileShape> => {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath(), 'utf8')) as Partial<FileShape>
    return { catalog: parsed.catalog ?? DEFAULT_CATALOG, subscriptions: parsed.subscriptions ?? {} }
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { catalog: DEFAULT_CATALOG, subscriptions: {} }
    throw err
  }
}

// Writes go one at a time, each to a temp file then renamed, so concurrent
// requests can't interleave and a crash can't leave half a file.
let queue: Promise<unknown> = Promise.resolve()
const update = <T>(fn: (data: FileShape) => { data: FileShape; result: T }): Promise<T> => {
  const run = queue.then(async () => {
    const { data, result } = fn(await read())
    const file = filePath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2))
    await fs.rename(tmp, file)
    return result
  })
  queue = run.catch(() => {})
  return run
}

// The file store keys by tenant id; a signed-in owner only knows their slug.
let slugCache: { at: number; map: Map<string, number> } | null = null
const tenantIdForSlug = async (slug: string): Promise<number> => {
  if (!slugCache || Date.now() - slugCache.at > 60_000 || !slugCache.map.has(slug)) {
    const res = await platformFetch('/platform/tenants')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new BillingError(502, 'Couldn’t look up this business')
    slugCache = { at: Date.now(), map: new Map((body.data ?? []).map((t: { slug: string; id: number }) => [t.slug, Number(t.id)])) }
  }
  const id = slugCache.map.get(slug)
  if (id === undefined) throw new BillingError(404, 'Business not found')
  return id
}

export const fileStore = (now: () => Date = () => new Date()): BillingStore => {
  const act = (tenantId: number, action: unknown, actor: 'platform' | 'owner') =>
    update((data) => {
      const sub = applyAction(data.subscriptions[tenantId] ?? null, tenantId, action, data.catalog, { now: now(), actor })
      return { data: { ...data, subscriptions: { ...data.subscriptions, [tenantId]: sub } }, result: sub }
    })

  return {
    catalog: async () => (await read()).catalog,
    saveCatalog: (input) =>
      update((data) => {
        const catalog = parseCatalog(input, plansInUse(Object.values(data.subscriptions)))
        return { data: { ...data, catalog }, result: catalog }
      }),
    list: async () => Object.values((await read()).subscriptions),
    get: async (tenantId) => (await read()).subscriptions[tenantId] ?? null,
    act: (tenantId, action) => act(tenantId, action, 'platform'),
    forTenant: async (user) => {
      const [data, id] = await Promise.all([read(), tenantIdForSlug(user.tenant)])
      return { subscription: data.subscriptions[id] ?? null, catalog: data.catalog }
    },
    actForTenant: async (user, action) => act(await tenantIdForSlug(user.tenant), action, 'owner'),
  }
}

// ── API ──────────────────────────────────────────────────────────────────────

const unwrap = async <T>(res: Response, fallback: string): Promise<T> => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new BillingError(res.status, body?.error ?? body?.message ?? fallback)
  return body?.data as T
}

const tenantFetch = (user: TenantUser, p: string, init: RequestInit = {}) =>
  fetch(`${process.env.NEXT_PUBLIC_API_URL}${p}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.accessToken}`,
      'X-Tenant-Domain': user.tenant,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })

export const apiStore = (): BillingStore => ({
  catalog: async () => unwrap(await platformFetch('/platform/billing/catalog'), 'Couldn’t load plans'),
  saveCatalog: async (input) =>
    unwrap(
      await platformFetch('/platform/billing/catalog', { method: 'PUT', body: JSON.stringify(parseCatalog(input)) }),
      'Couldn’t save plans'
    ),
  list: async () => (await unwrap<Subscription[]>(await platformFetch('/platform/subscriptions'), 'Couldn’t load subscriptions')) ?? [],
  get: async (id) =>
    (await unwrap<Subscription | null>(await platformFetch(`/platform/tenants/${id}/subscription`), 'Couldn’t load subscription')) ?? null,
  act: async (id, action) =>
    unwrap(
      await platformFetch(`/platform/tenants/${id}/subscription/actions`, { method: 'POST', body: JSON.stringify(parseAction(action)) }),
      'Couldn’t update subscription'
    ),
  forTenant: async (user) => unwrap(await tenantFetch(user, '/billing'), 'Couldn’t load billing'),
  actForTenant: async (user, action) =>
    unwrap(
      await tenantFetch(user, '/billing/actions', { method: 'POST', body: JSON.stringify(parseAction(action)) }),
      'Couldn’t send request'
    ),
})

export const billingStore = (): BillingStore => (process.env.BILLING_STORE === 'file' ? fileStore() : apiStore())

// ── Route helpers ────────────────────────────────────────────────────────────

export const ownerMayDo = (action: unknown) => OWNER_ACTIONS.includes(parseAction(action).type)

// Runs a route body; BillingErrors become their status, anything else a 500.
export const respond = async (fn: () => Promise<unknown>, status = 200) => {
  try {
    return NextResponse.json({ data: (await fn()) ?? null }, { status })
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ message: err.message }, { status: err.status })
    console.error('[billing]', err)
    return NextResponse.json({ message: 'Billing is unavailable right now' }, { status: 500 })
  }
}
