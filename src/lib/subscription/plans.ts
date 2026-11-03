// The catalog a fresh platform starts with. Prices and contents are a starting
// point — the super admin edits them under Console → Plans.

import type { Catalog } from './types'

export const DEFAULT_CATALOG: Catalog = {
  plans: [
    {
      id: 'starter',
      name: 'Starter',
      tagline: 'Everything to run day to day',
      monthlyPrice: 150,
      yearlyPrice: 1500,
      limits: { staff: 3 },
      features: [],
      trialDays: 14,
    },
    {
      id: 'growth',
      name: 'Growth',
      tagline: 'Reports and tools for a growing team',
      monthlyPrice: 350,
      yearlyPrice: 3500,
      limits: { staff: 10 },
      features: [
        'retail.analytics',
        'eatery.sales',
        'eatery.costing',
        'real-estate.documents',
        'real-estate.maintenance',
        'real-estate.website',
        'amusement.bookings',
      ],
      trialDays: 14,
      highlighted: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      tagline: 'Every feature, unlimited staff',
      monthlyPrice: 750,
      yearlyPrice: 7500,
      limits: { staff: null },
      features: [
        'retail.analytics',
        'retail.warehouses',
        'eatery.sales',
        'eatery.costing',
        'eatery.branding',
        'real-estate.documents',
        'real-estate.short-stays',
        'real-estate.maintenance',
        'real-estate.website',
        'amusement.bookings',
        'amusement.leaderboard',
      ],
      trialDays: 14,
    },
  ],
  settings: {
    currency: 'GHS',
    graceDays: 7,
    paymentInstructions: 'Pay by MoMo or bank transfer and use your business address (subdomain) as the reference.',
    supportContact: '',
  },
}
