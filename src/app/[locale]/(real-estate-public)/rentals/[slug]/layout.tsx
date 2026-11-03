'use client'

// Every page of a landlord's site uses their colour and shows their initials
// as the browser-tab icon.

import { useParams } from 'next/navigation'
import { usePublicSite } from '@/app/[locale]/(real-estate)/real-estate/_logics/public-hooks'
import { accentStyle, useSiteFavicon } from '../_components/site'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const { data } = usePublicSite(decodeURIComponent(String(params?.slug ?? '')))
  useSiteFavicon(data?.site)
  return <div style={accentStyle(data?.site.accent ?? '#0865AC')}>{children}</div>
}
