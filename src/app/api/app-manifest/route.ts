import { NextResponse } from 'next/server'
import { parseAppParams, publicManifest } from '@/lib/public-app'

// A public site's own installable app (src/lib/public-app.ts): a restaurant's
// storefront, a rentals site or a directory. Only public pages are accepted.
export function GET(req: Request) {
  const params = parseAppParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ message: 'Not a public page' }, { status: 400 })
  return new NextResponse(JSON.stringify(publicManifest(params)), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
  })
}
