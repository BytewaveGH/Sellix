// Web app manifest (/manifest.webmanifest): lets phones and tablets install
// Sellix from the browser ("Add to Home screen" / "Install app"), opening
// full screen with its own icon. Each business installs from its own
// subdomain, so the app is named after it. Offline works through the same
// service worker as the web (public/sw.js).

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { hostTenantSlug } from '@/lib/tenant'

export const THEME_COLOR = '#0865AC'

// "belkis-hub" → "Belkis Hub"
export const businessName = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export default function manifest(): MetadataRoute.Manifest {
  const slug = hostTenantSlug(headers().get('host'))
  const business = slug ? businessName(slug) : null
  return {
    id: '/',
    name: business ? `${business} · Sellix` : 'Sellix POS',
    short_name: (business ?? 'Sellix').slice(0, 12),
    description: 'Sell, take orders and run your business — works offline when the internet drops.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: THEME_COLOR,
    categories: ['business', 'productivity', 'finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
