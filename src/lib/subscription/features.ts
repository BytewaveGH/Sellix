// Features a plan can include, per module, and the dashboard pages each one
// unlocks. Pages not listed here are core: every plan gets them.
//
// To gate a new page, add it here — the sidebar lock, the upgrade screen and
// the plan editor all read from this list.

import type { AppType } from '@/lib/app-type'

export const FEATURES = [
  // Retail
  {
    key: 'retail.analytics',
    module: 'retail',
    label: 'Analytics',
    description: 'Sales trends, best sellers and margins over time',
    routes: ['/stores/analytics'],
  },
  {
    key: 'retail.warehouses',
    module: 'retail',
    label: 'Warehouses',
    description: 'Several stock locations, categories and units',
    routes: ['/stores/products/categories'],
  },
  // Eatery
  {
    key: 'eatery.sales',
    module: 'eatery',
    label: 'Sales history & reports',
    description: 'Daily totals, CSV export and end-of-day reports',
    routes: ['/eatery/sales'],
  },
  {
    key: 'eatery.costing',
    module: 'eatery',
    label: 'Ingredients & costing',
    description: 'Stock, recipes, waste and profit per dish',
    routes: ['/eatery/stock'],
  },
  {
    key: 'eatery.branding',
    module: 'eatery',
    label: 'Brand & theme editor',
    description: 'Custom storefront styles, colours and fonts',
    routes: ['/eatery/brand'],
  },
  // Real estate
  {
    key: 'real-estate.documents',
    module: 'real-estate',
    label: 'Documents',
    description: 'Leases and receipts, shareable on WhatsApp',
    routes: ['/real-estate/documents'],
  },
  {
    key: 'real-estate.short-stays',
    module: 'real-estate',
    label: 'Short stays',
    description: 'Nightly bookings alongside long-term rentals',
    routes: ['/real-estate/bookings'],
  },
  {
    key: 'real-estate.maintenance',
    module: 'real-estate',
    label: 'Repairs',
    description: 'Maintenance requests and costs per unit',
    routes: ['/real-estate/maintenance'],
  },
  {
    key: 'real-estate.website',
    module: 'real-estate',
    label: 'Public website',
    description: 'Vacant rooms and short stays online, with photos, booking requests and the Sellix Homes listing',
    routes: ['/real-estate/website'],
  },
  // Amusement
  {
    key: 'amusement.bookings',
    module: 'amusement',
    label: 'Bookings',
    description: 'Group and party reservations',
    routes: ['/amusement/bookings'],
  },
  {
    key: 'amusement.leaderboard',
    module: 'amusement',
    label: 'Leaderboard',
    description: 'Scores and a public lobby display',
    routes: ['/amusement/leaderboard'],
  },
] as const satisfies readonly { key: string; module: AppType; label: string; description: string; routes: readonly string[] }[]

export type FeatureKey = (typeof FEATURES)[number]['key']
export type Feature = (typeof FEATURES)[number]

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[]

export const isFeatureKey = (v: unknown): v is FeatureKey => FEATURE_KEYS.includes(v as FeatureKey)

export const featureMeta = (key: string): Feature | undefined => FEATURES.find((f) => f.key === key)

export const featuresFor = (module: string): Feature[] => FEATURES.filter((f) => f.module === module)

// The feature a dashboard URL needs, if any: /en/stores/analytics/x → retail.analytics.
export const featureForPath = (pathname: string | null | undefined): Feature | null => {
  const bare = (pathname ?? '').replace(/^\/(en|fr)(?=\/|$)/, '') || '/'
  return FEATURES.find((f) => f.routes.some((r) => bare === r || bare.startsWith(`${r}/`))) ?? null
}
