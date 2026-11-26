import { NextResponse } from 'next/server'
import { parseAppParams, publicAppName, publicManifest } from '@/lib/public-app'
import { hostTenantSlug } from '@/lib/tenant'

// A public site's own installable app (src/lib/public-app.ts): a restaurant's
// storefront, a rentals site or a directory. Only public pages are accepted.
// Named after the subdomain (or Sellix Eats / Sellix Homes), never the page's say-so.
export function GET(req: Request) {
  const params = parseAppParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ message: 'Not a public page' }, { status: 400 })
  const name = publicAppName(params.path, hostTenantSlug(req.headers.get('host')))
  return new NextResponse(JSON.stringify(publicManifest({ ...params, name })), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
  })
}
