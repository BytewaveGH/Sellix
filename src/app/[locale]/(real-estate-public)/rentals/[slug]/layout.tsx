// Every page of a rentals site. The manifest is in the HTML from the start, so
// saving the page to a phone's home screen opens this rentals site, not the sign-in.

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { publicAppMetadata } from '@/lib/public-app'
import { hostTenantSlug } from '@/lib/tenant'
import { SiteShell } from './shell'

const decoded = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function generateMetadata({ params }: { params: { locale: string; slug: string } }): Metadata {
  // Encoded the same way as the page does (shell.tsx), so it's one app.
  return publicAppMetadata(`/${params.locale}/rentals/${encodeURIComponent(decoded(params.slug))}`, hostTenantSlug(headers().get('host')))
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
