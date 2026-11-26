// Every page of a storefront. The manifest is in the HTML from the start, so
// saving the page to a phone's home screen opens this storefront, not the sign-in.

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { publicAppMetadata } from '@/lib/public-app'
import { hostTenantSlug } from '@/lib/tenant'
import { RestaurantShell } from './shell'

export function generateMetadata({ params }: { params: { locale: string; slug: string } }): Metadata {
  return publicAppMetadata(`/${params.locale}/eat/${params.slug}`, hostTenantSlug(headers().get('host')))
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RestaurantShell>{children}</RestaurantShell>
}
