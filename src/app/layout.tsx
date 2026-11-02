import { Providers } from '@/components/generals/providers'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { headers } from 'next/headers'
import { classifyHost } from '@/lib/tenant'
import './globals.css'
// import { Providers } from '@/components/providers'

// Self-hosted (variable font, weights 200–900, Latin; from @fontsource-variable/mulish,
// SIL OFL 1.1) so builds don't depend on reaching Google Fonts.
const mulish = localFont({
  src: './fonts/MulishVariable.woff2',
  weight: '200 900',
  style: 'normal',
  variable: '--font-mulish',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const { slug } = classifyHost(headers().get('host'))
  return {
    title: slug ?? 'sellix',
    description:
      'Sellix — multi-tenant point-of-sale and business management platform, powering retail, eatery, and amusement park operations from one dashboard.',
  }
}

export default function RootLayout({
  children,
  params: { locale },
}: Readonly<{
  children: React.ReactNode
  params: {
    locale: string
  }
}>) {
  return (
    <html lang={locale}>
      {/* Icons come from src/app: favicon.ico, icon.png (the Sellix logo) and apple-icon.png.
          Public eatery storefronts swap in the restaurant's own logo (use-brand-favicon.ts). */}
      <body className={`${mulish.variable} font-mulish`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
