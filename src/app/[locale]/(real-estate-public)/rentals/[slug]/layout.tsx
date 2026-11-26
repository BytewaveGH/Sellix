'use client'

// Every page of a landlord's site uses their colour and shows their initials
// as the browser-tab icon.

import { useParams } from 'next/navigation'
import { usePublicSite } from '@/app/[locale]/(real-estate)/real-estate/_logics/public-hooks'
import { accentStyle, useSiteFavicon } from '../_components/site'
import { usePublicApp } from '@/components/install/use-public-app'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const { data } = usePublicSite(decodeURIComponent(String(params?.slug ?? '')))
  useSiteFavicon(data?.site)
  // "Add to Home Screen" saves this landlord's site as its own app.
  const site = data?.site
  usePublicApp(
    site && data
      ? { path: `/${params?.locale ?? 'en'}/rentals/${encodeURIComponent(data.slug)}`, name: site.name || 'Rentals', bg: /^#[0-9a-f]{6}$/i.test(site.accent) ? site.accent : '#0865AC', fg: '#FFFFFF', logo: site.logoUrl }
      : null
  )
  return <div style={accentStyle(data?.site.accent ?? '#0865AC')}>{children}</div>
}
