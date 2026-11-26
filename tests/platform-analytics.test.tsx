// Console analytics (BACKEND_REQUIREMENTS.md §15): health scoring, follow-ups,
// the Usage & engagement page and a business's Usage tab; the usage tracker;
// and the desktop app as a core feature on every plan.
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const nav = vi.hoisted(() => ({ params: { locale: 'en' } as Record<string, string> }))
vi.mock('next/navigation', () => ({ useParams: () => nav.params, useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/tenant-services', () => ({ TenantServices: { Resolve: async () => ({ exists: false }) } }))
vi.mock('@/lib/tenant', async (orig) => ({ ...(await orig<typeof import('@/lib/tenant')>()), ROOT_DOMAIN: 'localhost:3000' }))

import {
  engagement,
  fillDays,
  healthFromLastActivity,
  platformTotals,
  usageAlerts,
  usageRows,
  usageToCsv,
  type TenantActivity,
  type TenantUsageSummary,
} from '@/lib/platform/analytics'
import { areaOf, createTracker, PAUSE_MS } from '@/lib/activity/tracker'
import { parseCatalog } from '@/lib/subscription/billing'
import { DEFAULT_CATALOG } from '@/lib/subscription/plans'
import { CORE_FEATURES } from '@/lib/subscription/features'
import type { TenantRecord } from '@/app/[locale]/(super-admin)/super-admin/_logics/types'
import AnalyticsPage from '@/app/[locale]/(super-admin)/super-admin/analytics/page'
import AppDetailPage from '@/app/[locale]/(super-admin)/super-admin/apps/[id]/page'
import PlansPage from '@/app/[locale]/(super-admin)/super-admin/plans/page'

const NOW = new Date('2026-11-26T12:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

const usage = (tenantId: number, over: Partial<TenantUsageSummary> = {}): TenantUsageSummary => ({
  tenantId,
  revenue: 12_000,
  sales: 400,
  activeDays: 26,
  activeStaff: 3,
  staffCount: 3,
  signIns: 60,
  activeMinutes: 26 * 90,
  lastActivityAt: ago(0.1),
  devices: 2,
  desktopDevices: 1,
  offlineSales: 40,
  stuckDevices: 0,
  previous: { revenue: 10_000, sales: 380, activeDays: 25 },
  ...over,
})

const tenant = (id: number, over: Partial<TenantRecord> = {}): TenantRecord => ({
  id,
  name: `App ${id}`,
  slug: `app-${id}`,
  appType: 'retail',
  status: 'active',
  createdAt: '2026-06-01T10:00:00Z',
  ownerName: `Owner ${id}`,
  ownerEmail: `owner${id}@x.com`,
  ...over,
})

describe('health', () => {
  it('a shop used every day by the whole team is thriving', () => {
    const e = engagement(usage(1), 30, NOW, '2026-06-01')
    expect(e.health).toBe('thriving')
    expect(e.score).toBeGreaterThanOrEqual(85)
    expect(e.reasons).toContain('Used 26 of 30 days')
  })

  it('a few days of use is steady; little use or a big drop is at risk', () => {
    expect(engagement(usage(1, { activeDays: 12, activeStaff: 1, activeMinutes: 300, lastActivityAt: ago(2) }), 30, NOW).health).toBe('steady')
    const dropping = engagement(usage(1, { sales: 100, previous: { revenue: 10_000, sales: 380, activeDays: 25 } }), 30, NOW)
    expect(dropping.health).not.toBe('thriving')
    expect(dropping.reasons).toContain('Sales down 74%')
    expect(engagement(usage(1, { activeDays: 3, activeStaff: 1, activeMinutes: 20, lastActivityAt: ago(6) }), 30, NOW).health).toBe('at-risk')
  })

  it('nothing for 14 days is dormant; a new business is getting started', () => {
    expect(engagement(usage(1, { lastActivityAt: ago(20), activeDays: 2 }), 30, NOW).health).toBe('dormant')
    expect(engagement(usage(1, { lastActivityAt: null, activeDays: 0, activeStaff: 0, sales: 0, activeMinutes: 0 }), 30, NOW, ago(3)).health).toBe('new')
    expect(healthFromLastActivity(ago(30), NOW)).toBe('dormant')
    expect(healthFromLastActivity(ago(2), NOW)).toBe('steady')
  })

  it('platform totals: active businesses, desktop share, offline share', () => {
    const t = platformTotals([usage(1), usage(2, { desktopDevices: 0, activeDays: 0, offlineSales: 0 })], 30)
    expect(t).toMatchObject({ businesses: 2, active: 1, regular: 1, revenue: 24_000, sales: 800, desktopShare: 0.5, offlineShare: 0.05 })
  })

  it('follow-ups: unsent sales first, then paying but idle, trial with little use, dropping', () => {
    const tenants = [tenant(1), tenant(2), tenant(3), tenant(4)]
    const rows = usageRows(
      tenants,
      [
        usage(1, { stuckDevices: 1 }),
        usage(2, { lastActivityAt: ago(20), activeDays: 1 }),
        usage(3, { activeDays: 1, activeStaff: 0, activeMinutes: 5, lastActivityAt: ago(9), sales: 3, previous: { revenue: 0, sales: 0, activeDays: 0 } }),
        usage(4, { sales: 100 }),
      ],
      30,
      NOW,
      () => null,
      (t) =>
        t.id === 2
          ? { state: 'active', planName: 'Growth', monthly: 350 }
          : t.id === 3
            ? { state: 'trialing', planName: 'Starter', monthly: 0, trialEndsInDays: 3 }
            : undefined
    )
    expect(usageAlerts(rows).map((a) => [a.kind, a.row.tenant.id])).toEqual([
      ['unsent', 1],
      ['paying-idle', 2],
      ['trial-low', 3],
      ['dropping', 4],
    ])
    expect(usageAlerts(rows)[1].message).toBe('Pays ₵350/month but is dormant')
  })

  it('fills missing days with zeros and exports CSV', () => {
    const days = fillDays([{ date: '2026-11-25', revenue: 50, sales: 2, signIns: 1, activeStaff: 1, activeMinutes: 30, offlineSales: 0 }], NOW, 3)
    expect(days.map((d) => [d.date, d.sales])).toEqual([
      ['2026-11-24', 0],
      ['2026-11-25', 2],
      ['2026-11-26', 0],
    ])
    const csv = usageToCsv(usageRows([tenant(1, { name: '=Shop' })], [usage(1)], 30, NOW), 30)
    expect(csv.split('\r\n')[1]).toMatch(/^'=Shop,app-1,retail,Thriving,/)
  })
})

describe('usage tracker', () => {
  beforeEach(() => localStorage.clear())

  it('names screen areas without ids or the locale', () => {
    expect(areaOf('/en/stores/products/12/edit')).toBe('stores.products')
    expect(areaOf('/fr/eatery/pos?table=3')).toBe('eatery.pos')
    expect(areaOf('/en')).toBe('home')
  })

  it('batches views and one active minute at a time, kept on the device until sent', async () => {
    let t = NOW.getTime()
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
    const tracker = createTracker({ scope: 'acme:1', device: { id: 'till-1', kind: 'desktop', appVersion: '0.1.0' }, send, now: () => t })
    tracker.view('stores.pos', false)
    tracker.active('stores.pos', false)
    tracker.active('stores.pos', false) // same minute: ignored
    t += 61_000
    tracker.active('stores.pos', true)
    expect(tracker.pending()).toBe(3)

    await tracker.flush() // offline: kept
    expect(tracker.pending()).toBe(3)
    // Survives a reload.
    const again = createTracker({ scope: 'acme:1', device: { id: 'till-1', kind: 'desktop' }, send, now: () => t })
    expect(again.pending()).toBe(3)
    await again.flush()
    expect(again.pending()).toBe(0)
    const body = send.mock.calls[1][0]
    expect(body).toMatchObject({ method: 'POST', url: '/activity/events', offline: false })
    expect(body.data.device).toEqual({ id: 'till-1', kind: 'desktop' })
    expect(body.data.events.map((e: any) => [e.type, e.area, e.online])).toEqual([
      ['view', 'stores.pos', false],
      ['active', 'stores.pos', false],
      ['active', 'stores.pos', true],
    ])
  })

  it('pauses (and drops the backlog) while the server has no endpoint', async () => {
    let t = NOW.getTime()
    const send = vi.fn().mockRejectedValue({ response: { status: 404 } })
    const tracker = createTracker({ scope: 'acme:1', device: { id: 'x', kind: 'web' }, send, now: () => t })
    tracker.view('home', true)
    await tracker.flush()
    expect(tracker.pending()).toBe(0)
    tracker.view('home', true)
    await tracker.flush()
    expect(send).toHaveBeenCalledTimes(1) // paused
    t += PAUSE_MS + 1
    await tracker.flush()
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('desktop app is core', () => {
  it('is listed on every plan and the download link must be https', () => {
    expect(CORE_FEATURES.map((f) => f.key)).toEqual(['core.desktop', 'core.offline'])
    const ok = parseCatalog({ ...DEFAULT_CATALOG, settings: { ...DEFAULT_CATALOG.settings, desktopDownloadUrl: 'https://x.com/setup.exe' } })
    expect(ok.settings.desktopDownloadUrl).toBe('https://x.com/setup.exe')
    expect(() => parseCatalog({ ...DEFAULT_CATALOG, settings: { ...DEFAULT_CATALOG.settings, desktopDownloadUrl: 'http://x.com' } })).toThrow(/https/)
    // Older saved catalogs without the field still load.
    const { desktopDownloadUrl: _, ...old } = DEFAULT_CATALOG.settings
    expect(parseCatalog({ ...DEFAULT_CATALOG, settings: old }).settings.desktopDownloadUrl).toBe('')
  })
})

// ── Screens ──────────────────────────────────────────────────────────────────

const TENANTS = [tenant(1, { name: 'Belkis' }), tenant(2, { name: 'Bugy' }), tenant(3, { name: 'Nabest', appType: 'eatery' })]
let analytics: unknown = null
let activity: TenantActivity | null = null

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

beforeEach(() => {
  analytics = null
  activity = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })
      if (url === '/api/platform/tenants') return ok(TENANTS)
      if (url === '/api/platform/billing/catalog') return ok(init?.method === 'PUT' ? JSON.parse(String(init.body)) : DEFAULT_CATALOG)
      if (url === '/api/platform/subscriptions') return ok([])
      if (url.startsWith('/api/platform/analytics')) return ok(analytics)
      if (/\/activity\?days=/.test(url)) return ok(activity)
      const st = /^\/api\/platform\/tenants\/(\d+)\/stats$/.exec(url)
      if (st) return ok({ employeeCount: 3, productCount: 40, salesVolume: 1000, lastActivityAt: st[1] === '2' ? ago(40) : ago(1) })
      if (/employees$/.test(url)) return ok([])
      return new Response('{}', { status: 404 })
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

const withQuery = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('Usage & engagement page', () => {
  it('ranks businesses, shows totals and who to follow up', async () => {
    analytics = {
      from: ago(30),
      to: NOW.toISOString(),
      days: 30,
      updatedAt: NOW.toISOString(),
      tenants: [usage(1), usage(2, { lastActivityAt: ago(20), activeDays: 1, revenue: 100, sales: 4, desktopDevices: 0 }), usage(3, { stuckDevices: 1, revenue: 5000 })],
    }
    nav.params = { locale: 'en' }
    withQuery(<AnalyticsPage />)
    expect(await screen.findByText('Usage & engagement')).toBeTruthy()
    expect(await screen.findByText('3 / 3')).toBeTruthy() // active businesses
    expect(screen.getByText('67%')).toBeTruthy() // desktop share
    const follow = screen.getByText('Follow up').closest('.rounded-2xl') as HTMLElement
    expect(within(follow).getByText('1 device has sales not sent for 2+ days')).toBeTruthy()
    // Filter to dormant.
    fireEvent.change(screen.getByLabelText('Health'), { target: { value: 'dormant' } })
    const table = screen.getByRole('table')
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2))
    expect(within(table).getByText('Bugy')).toBeTruthy()
  })

  it('without the backend figures, says so and rates health from last activity', async () => {
    nav.params = { locale: 'en' }
    withQuery(<AnalyticsPage />)
    expect(await screen.findByText(/doesn’t send usage figures yet/)).toBeTruthy()
    const table = screen.getByRole('table')
    await waitFor(() => expect(within(within(table).getByText('Bugy').closest('tr')!).getByText('Dormant')).toBeTruthy())
  })
})

describe('a business’s Usage tab', () => {
  it('shows its figures, team, devices with unsent sales and screens used', async () => {
    activity = {
      tenantId: 3,
      from: ago(30),
      to: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      summary: usage(3, { stuckDevices: 1 }),
      daily: [{ date: '2026-11-25', revenue: 900, sales: 30, signIns: 3, activeStaff: 2, activeMinutes: 120, offlineSales: 4 }],
      staff: [{ id: 7, name: 'Esi Mensah', role: 'cashier', lastSeenAt: ago(0.2), signIns: 20, sales: 300, revenue: 9000, activeMinutes: 1500 }],
      devices: [
        { id: 'till-a', kind: 'desktop', appVersion: '0.1.0', lastSeenAt: ago(0.1), lastSyncAt: ago(3), pending: 12 },
        { id: 'till-b', kind: 'desktop', appVersion: '0.2.0', lastSeenAt: ago(0.1), lastSyncAt: ago(0.1), pending: 0 },
      ],
      areas: [{ area: 'eatery.pos', views: 120, activeMinutes: 1400, lastUsedAt: ago(0.1) }],
      records: { 'Menu items': 42 },
    }
    nav.params = { locale: 'en', id: '3' }
    withQuery(<AppDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Nabest' })).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Usage' }))
    expect(await screen.findByText('Esi Mensah')).toBeTruthy()
    expect(screen.getByText('12 unsent')).toBeTruthy()
    expect(screen.getByText('Update available')).toBeTruthy() // till-a is behind 0.2.0
    expect(screen.getByText('Counter (POS)')).toBeTruthy()
    expect(screen.getByText('Menu items')).toBeTruthy()
  })

  it('says when usage isn’t counted yet', async () => {
    nav.params = { locale: 'en', id: '1' }
    withQuery(<AppDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Belkis' })).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Usage' }))
    expect(await screen.findByText('Usage isn’t counted yet')).toBeTruthy()
  })
})

describe('Plans page', () => {
  it('shows the desktop app on every plan and saves its download link', async () => {
    nav.params = { locale: 'en' }
    withQuery(<PlansPage />)
    expect((await screen.findAllByLabelText(/Windows desktop app on .*: always included/)).length).toBe(DEFAULT_CATALOG.plans.length)
    fireEvent.change(screen.getByLabelText('Desktop app download link'), { target: { value: 'https://example.com/setup.exe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      const put = vi.mocked(fetch).mock.calls.find(([u, i]) => u === '/api/platform/billing/catalog' && i?.method === 'PUT')
      expect(put && JSON.parse(String(put[1]!.body)).settings.desktopDownloadUrl).toBe('https://example.com/setup.exe')
    })
  })
})
