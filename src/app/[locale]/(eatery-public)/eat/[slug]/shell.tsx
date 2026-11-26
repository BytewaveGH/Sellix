'use client'

// Every page of a restaurant's storefront (menu, checkout, order tracking)
// shows the restaurant's logo as the browser-tab icon, and installs as the
// restaurant's own app on customers' phones.

import { useParams } from 'next/navigation'
import { useStorefront } from '@/lib/eatery/hooks'
import { useBrandFavicon } from '@/components/eatery/use-brand-favicon'
import { usePublicApp } from '@/components/install/use-public-app'
import { resolveTheme } from '@/lib/eatery/theme'

export function RestaurantShell({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const { data } = useStorefront(String(params?.slug ?? ''))
  useBrandFavicon(data?.restaurant)
  // "Add to Home Screen" saves this restaurant as its own app for customers.
  const r = data?.restaurant
  const palette = r ? resolveTheme(r.theme).palette : null
  usePublicApp(
    r && palette
      ? { path: `/${params?.locale ?? 'en'}/eat/${r.slug}`, bg: palette.primary, fg: palette.onPrimary, logo: r.theme.imagery.logoUrl }
      : null
  )
  return children
}
