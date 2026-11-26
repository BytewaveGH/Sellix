// The customer-facing eatery site: no sign-in, no dashboard shell.
import '@/components/eatery/fonts'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { publicAppMetadata } from '@/lib/public-app'
import { hostTenantSlug } from '@/lib/tenant'

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  return {
    title: 'Sellix Eats — order from local restaurants, bars and cafés',
    description: 'Browse menus and order for pickup, delivery or at your table.',
    // Saved to a phone, it opens Sellix Eats, not the sign-in.
    ...publicAppMetadata(`/${params.locale}/eat`, hostTenantSlug(headers().get('host'))),
  }
}

export default function EatLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#FAF7F2]">{children}</div>
}
