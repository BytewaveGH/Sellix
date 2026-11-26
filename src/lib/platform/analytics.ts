// Platform analytics: how much each business uses the app, worked out from
// the figures the backend counts (BACKEND_REQUIREMENTS.md §15). Pure, so the
// scoring is testable; the console pages only lay it out.

// ── What the backend sends ──────────────────────────────────────────────────

// One business over a period (GET /platform/analytics, one row per tenant).
export interface TenantUsageSummary {
  tenantId: number
  // Completed sales/orders/payments in the period, in cedis and count.
  revenue: number
  sales: number
  // Days with at least one sale or sign-in.
  activeDays: number
  // Staff accounts (owner included) who signed in or sold, and all of them.
  activeStaff: number
  staffCount: number
  signIns: number
  // Minutes someone was using the app (tracker "active" events).
  activeMinutes: number
  lastActivityAt: string | null
  // Devices seen in the period, and how many of them are the desktop app.
  devices: number
  desktopDevices: number
  // Sales rung up offline (synced later) — how much the offline mode matters.
  offlineSales: number
  // Devices holding sales that haven't reached the server for 2+ days.
  stuckDevices: number
  // The period before, same length — for trends.
  previous: { revenue: number; sales: number; activeDays: number }
}

export interface PlatformUsage {
  from: string
  to: string
  days: number
  updatedAt: string
  tenants: TenantUsageSummary[]
}

export interface DailyUsage {
  date: string // yyyy-MM-dd, the business's day
  revenue: number
  sales: number
  signIns: number
  activeStaff: number
  activeMinutes: number
  offlineSales: number
}

export interface StaffUsage {
  id: number
  name: string
  role: string
  lastSeenAt: string | null
  signIns: number
  sales: number
  revenue: number
  activeMinutes: number
}

export interface DeviceUsage {
  id: string
  kind: 'desktop' | 'web'
  appVersion?: string | null
  lastSeenAt: string | null
  lastSyncAt: string | null
  // Sales/changes kept on the device, not on the server yet.
  pending: number
}

// Screen areas from the tracker ("stores.pos", "eatery.menu").
export interface AreaUsage {
  area: string
  views: number
  activeMinutes: number
  lastUsedAt: string | null
}

// One business in detail (GET /platform/tenants/:id/activity).
export interface TenantActivity {
  tenantId: number
  from: string
  to: string
  updatedAt: string
  summary: TenantUsageSummary
  daily: DailyUsage[]
  staff: StaffUsage[]
  devices: DeviceUsage[]
  areas: AreaUsage[]
  // What they've set up: products, menu items, units, rides… (label → count)
  records: Record<string, number>
}

// ── Health ──────────────────────────────────────────────────────────────────

export type Health = 'thriving' | 'steady' | 'at-risk' | 'dormant' | 'new'

export const HEALTH: Record<Health, { label: string; hint: string; className: string; dot: string }> = {
  thriving: {
    label: 'Thriving',
    hint: 'Used most days by the team',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    dot: 'bg-emerald-500',
  },
  steady: { label: 'Steady', hint: 'Used regularly', className: 'bg-sky-50 text-sky-700 ring-sky-600/15', dot: 'bg-sky-500' },
  'at-risk': {
    label: 'At risk',
    hint: 'Little use, or dropping fast',
    className: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  dormant: {
    label: 'Dormant',
    hint: 'Nothing for 14 days or more',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/15',
    dot: 'bg-rose-500',
  },
  new: {
    label: 'Getting started',
    hint: 'Registered in the last 14 days',
    className: 'bg-violet-50 text-violet-700 ring-violet-600/15',
    dot: 'bg-violet-500',
  },
}

export const HEALTH_ORDER: Health[] = ['thriving', 'steady', 'new', 'at-risk', 'dormant']

const DAY = 86_400_000
const daysSince = (iso: string | null | undefined, now: Date) => {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? Infinity : (now.getTime() - t) / DAY
}

// % change, or null when there's nothing to compare with.
export const trend = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? null : 0

export interface Engagement {
  score: number
  health: Health
  // Plain reasons behind the score, for the console.
  reasons: string[]
}

// 0–100: how many days it's used (40), how much of the team uses it (20),
// how recently (20), minutes of real use per active day (10), and whether
// sales are holding up (10).
export const engagement = (s: TenantUsageSummary, days: number, now: Date, registeredAt?: string): Engagement => {
  const reasons: string[] = []
  const period = Math.max(1, days)
  const dayShare = Math.min(1, s.activeDays / period)
  const staffShare = s.staffCount > 0 ? Math.min(1, s.activeStaff / s.staffCount) : s.activeStaff > 0 ? 1 : 0
  const idle = daysSince(s.lastActivityAt, now)
  const recency = idle <= 1 ? 1 : idle <= 3 ? 0.75 : idle <= 7 ? 0.4 : 0
  const minutesPerDay = s.activeDays > 0 ? s.activeMinutes / s.activeDays : 0
  const depth = Math.min(1, minutesPerDay / 60)
  const change = trend(s.sales, s.previous.sales)
  const momentum = change === null ? 1 : change >= 0 ? 1 : change > -25 ? 0.6 : change > -50 ? 0.3 : 0
  const score = Math.round(dayShare * 40 + staffShare * 20 + recency * 20 + depth * 10 + momentum * 10)

  if (s.activeDays) reasons.push(`Used ${s.activeDays} of ${period} days`)
  if (s.staffCount) reasons.push(`${s.activeStaff} of ${s.staffCount} staff active`)
  if (idle === Infinity) reasons.push('No activity recorded')
  else if (idle > 2) reasons.push(`Last activity ${Math.floor(idle)} days ago`)
  if (change !== null && change <= -25) reasons.push(`Sales down ${Math.abs(change)}%`)
  if (s.stuckDevices) reasons.push(`${s.stuckDevices} device${s.stuckDevices === 1 ? '' : 's'} with unsent sales`)

  const young = daysSince(registeredAt, now) < 14
  // Sales halving is a warning however busy the till looks; a quarter off
  // keeps it from "thriving".
  const falling = change !== null && change <= -50
  const slipping = change !== null && change <= -25
  const health: Health =
    idle >= 14 && !(young && idle === Infinity)
      ? 'dormant'
      : young && score < 60
        ? 'new'
        : falling
          ? 'at-risk'
          : score >= 70 && !slipping
            ? 'thriving'
            : score >= 40
              ? 'steady'
              : 'at-risk'
  return { score, health, reasons }
}

// Without the analytics endpoint: health from the last activity only.
export const healthFromLastActivity = (lastActivityAt: string | null | undefined, now: Date, registeredAt?: string): Health => {
  const idle = daysSince(lastActivityAt, now)
  if (daysSince(registeredAt, now) < 14 && idle >= 14) return 'new'
  return idle >= 14 ? 'dormant' : idle > 7 ? 'at-risk' : 'steady'
}

// ── The whole platform ──────────────────────────────────────────────────────

export interface PlatformTotals {
  businesses: number
  // Used at least once in the period / on at least half its days.
  active: number
  regular: number
  revenue: number
  sales: number
  previousRevenue: number
  previousSales: number
  activeStaff: number
  activeMinutes: number
  // Share of businesses with the desktop app, and of sales made offline.
  desktopShare: number
  offlineShare: number
  stuckDevices: number
}

export const platformTotals = (rows: TenantUsageSummary[], days: number): PlatformTotals => {
  const sum = (f: (s: TenantUsageSummary) => number) => rows.reduce((n, s) => n + (f(s) || 0), 0)
  const sales = sum((s) => s.sales)
  return {
    businesses: rows.length,
    active: rows.filter((s) => s.activeDays > 0).length,
    regular: rows.filter((s) => s.activeDays >= Math.max(1, days / 2)).length,
    revenue: Math.round(sum((s) => s.revenue) * 100) / 100,
    sales,
    previousRevenue: Math.round(sum((s) => s.previous.revenue) * 100) / 100,
    previousSales: sum((s) => s.previous.sales),
    activeStaff: sum((s) => s.activeStaff),
    activeMinutes: sum((s) => s.activeMinutes),
    desktopShare: rows.length ? rows.filter((s) => s.desktopDevices > 0).length / rows.length : 0,
    offlineShare: sales ? sum((s) => s.offlineSales) / sales : 0,
    stuckDevices: sum((s) => s.stuckDevices),
  }
}

// ── Rows for the console ────────────────────────────────────────────────────

export interface UsageRow<T> {
  tenant: T
  usage: TenantUsageSummary | null
  engagement: Engagement
  // Billing, when known: what they pay us per month and their billing state.
  billing?: { state: string; planName?: string; monthly: number; trialEndsInDays?: number | null }
}

type TenantLike = { id: number; createdAt: string; status: string }

export const usageRows = <T extends TenantLike>(
  tenants: T[],
  usage: TenantUsageSummary[] | null,
  days: number,
  now: Date,
  fallback: (t: T) => string | null | undefined = () => null,
  billing: (t: T) => UsageRow<T>['billing'] = () => undefined
): UsageRow<T>[] => {
  const byId = new Map((usage ?? []).map((u) => [u.tenantId, u]))
  return tenants.map((tenant) => {
    const u = byId.get(tenant.id) ?? null
    const e: Engagement = u
      ? engagement(u, days, now, tenant.createdAt)
      : { score: 0, health: healthFromLastActivity(fallback(tenant), now, tenant.createdAt), reasons: [] }
    return { tenant, usage: u, engagement: e, billing: billing(tenant) }
  })
}

export type UsageSort = 'score' | 'revenue' | 'sales' | 'recent' | 'trend' | 'name'

export const sortUsage = <T extends TenantLike & { name: string }>(rows: UsageRow<T>[], by: UsageSort) => {
  const v = (r: UsageRow<T>) => {
    switch (by) {
      case 'revenue':
        return r.usage?.revenue ?? -1
      case 'sales':
        return r.usage?.sales ?? -1
      case 'recent':
        return r.usage?.lastActivityAt ? new Date(r.usage.lastActivityAt).getTime() : -1
      case 'trend':
        return r.usage ? (trend(r.usage.revenue, r.usage.previous.revenue) ?? 1000) : -1000
      default:
        return r.engagement.score
    }
  }
  return [...rows].sort((a, b) => (by === 'name' ? a.tenant.name.localeCompare(b.tenant.name) : v(b) - v(a)))
}

export interface UsageAlert<T> {
  kind: 'paying-idle' | 'trial-low' | 'dropping' | 'unsent' | 'never-used'
  row: UsageRow<T>
  message: string
}

// What the platform team should follow up on, most urgent first.
export const usageAlerts = <T extends TenantLike & { name: string }>(rows: UsageRow<T>[]): UsageAlert<T>[] => {
  const out: UsageAlert<T>[] = []
  for (const r of rows) {
    if (r.tenant.status !== 'active') continue
    const h = r.engagement.health
    const paying = r.billing && (r.billing.state === 'active' || r.billing.state === 'past_due') && r.billing.monthly > 0
    if (r.usage?.stuckDevices)
      out.push({
        kind: 'unsent',
        row: r,
        message: `${r.usage.stuckDevices} device${r.usage.stuckDevices === 1 ? ' has' : 's have'} sales not sent for 2+ days`,
      })
    if (paying && (h === 'dormant' || h === 'at-risk'))
      out.push({
        kind: 'paying-idle',
        row: r,
        message: `Pays ₵${Math.round(r.billing!.monthly)}/month but is ${HEALTH[h].label.toLowerCase()}`,
      })
    else if (r.billing?.state === 'trialing' && (r.billing.trialEndsInDays ?? 99) <= 7 && r.engagement.score < 40)
      out.push({
        kind: 'trial-low',
        row: r,
        message: `Trial ends in ${Math.max(0, r.billing.trialEndsInDays ?? 0)} days, little use so far`,
      })
    else if (r.usage && (trend(r.usage.sales, r.usage.previous.sales) ?? 0) <= -50)
      out.push({
        kind: 'dropping',
        row: r,
        message: `Sales down ${Math.abs(trend(r.usage.sales, r.usage.previous.sales)!)}% on the period before`,
      })
    else if (r.usage && r.usage.lastActivityAt === null && r.usage.signIns === 0)
      out.push({ kind: 'never-used', row: r, message: 'Never signed in' })
  }
  const rank: Record<UsageAlert<T>['kind'], number> = { unsent: 0, 'paying-idle': 1, 'trial-low': 2, dropping: 3, 'never-used': 4 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind])
}

export const healthCounts = (rows: { engagement: Engagement }[]) =>
  HEALTH_ORDER.map((h) => ({ health: h, count: rows.filter((r) => r.engagement.health === h).length }))

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const usageToCsv = <T extends TenantLike & { name: string; slug: string; appType: string }>(rows: UsageRow<T>[], days: number) =>
  [
    [
      'Business',
      'Subdomain',
      'Type',
      'Health',
      'Score',
      `Sales ₵ (${days}d)`,
      'Sales ₵ before',
      'Transactions',
      'Active days',
      'Active staff',
      'Staff',
      'Minutes of use',
      'Devices',
      'Desktop devices',
      'Offline sales',
      'Last activity',
      'Plan',
      'Billing',
    ],
    ...rows.map((r) => {
      const u = r.usage
      return [
        r.tenant.name,
        r.tenant.slug,
        r.tenant.appType,
        HEALTH[r.engagement.health].label,
        u ? r.engagement.score : '',
        u?.revenue ?? '',
        u?.previous.revenue ?? '',
        u?.sales ?? '',
        u?.activeDays ?? '',
        u?.activeStaff ?? '',
        u?.staffCount ?? '',
        u?.activeMinutes ?? '',
        u?.devices ?? '',
        u?.desktopDevices ?? '',
        u?.offlineSales ?? '',
        u?.lastActivityAt ?? '',
        r.billing?.planName ?? '',
        r.billing?.state ?? '',
      ]
    }),
  ]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n')

// ── One business: charts ────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Every day of the period, zeros where the backend sent nothing.
export const fillDays = (daily: DailyUsage[], to: Date, days: number): DailyUsage[] => {
  const byDate = new Map(daily.map((d) => [d.date, d]))
  return Array.from({ length: days }, (_, i) => {
    const date = iso(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (days - 1 - i))))
    return byDate.get(date) ?? { date, revenue: 0, sales: 0, signIns: 0, activeStaff: 0, activeMinutes: 0, offlineSales: 0 }
  })
}

// Busiest weekday from the daily figures (0 = Sunday).
export const weekdayProfile = (daily: DailyUsage[]) => {
  const totals = Array.from({ length: 7 }, () => ({ sales: 0, days: 0 }))
  for (const d of daily) {
    const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay()
    totals[wd].sales += d.sales
    totals[wd].days += 1
  }
  return totals.map((t, wd) => ({ weekday: wd, average: t.days ? Math.round((t.sales / t.days) * 10) / 10 : 0 }))
}

const AREA_NAMES: Record<string, string> = {
  home: 'Home',
  stores: 'Store dashboard',
  'stores.pos': 'Till (POS)',
  'stores.products': 'Products',
  'stores.analytics': 'Analytics',
  'stores.sales': 'Sales',
  'stores.customers': 'Customers',
  'stores.inventory': 'Inventory',
  eatery: 'Eatery dashboard',
  'eatery.pos': 'Counter (POS)',
  'eatery.orders': 'Orders',
  'eatery.menu': 'Menu',
  'eatery.stock': 'Ingredients & stock',
  'eatery.sales': 'Sales',
  'eatery.brand': 'Brand',
  'real-estate': 'Real estate dashboard',
  'real-estate.tenants': 'Tenants',
  'real-estate.payments': 'Rent payments',
  'real-estate.bookings': 'Short stays',
  'real-estate.maintenance': 'Repairs',
  'real-estate.documents': 'Documents',
  amusement: 'Park dashboard',
  'amusement.tickets': 'Ticket counter',
  'amusement.gate': 'Gate check-in',
  'amusement.bookings': 'Bookings',
  'amusement.leaderboard': 'Leaderboard',
  billing: 'Billing',
  settings: 'Settings',
  employees: 'Staff',
}

export const areaLabel = (area: string) =>
  AREA_NAMES[area] ??
  area
    .split('.')
    .map((p) => p.replace(/-/g, ' '))
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' · ')

// Desktop installs on an old version, or quiet for a while.
export const deviceStatus = (d: DeviceUsage, now: Date, latestVersion?: string) => {
  const idle = daysSince(d.lastSeenAt, now)
  const unsynced = d.pending > 0 && daysSince(d.lastSyncAt, now) >= 2
  return {
    unsynced,
    outdated: d.kind === 'desktop' && !!latestVersion && !!d.appVersion && compareVersions(d.appVersion, latestVersion) < 0,
    idle: idle >= 7,
  }
}

export const compareVersions = (a: string, b: string) => {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

// The newest desktop version seen across devices.
export const latestVersion = (devices: DeviceUsage[]) =>
  devices
    .map((d) => d.appVersion)
    .filter((v): v is string => !!v)
    .sort(compareVersions)
    .at(-1)
