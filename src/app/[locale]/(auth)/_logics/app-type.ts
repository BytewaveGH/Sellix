// Which module the business on this address runs (its subdomain), for the
// sign-in pages' picture. null on the main site or if it can't be told.

import { headers } from 'next/headers'
import { classifyHost } from '@/lib/tenant'

export async function appTypeForThisSite(): Promise<string | null> {
  const { slug } = classifyHost(headers().get('host'))
  if (!slug) return null
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform/tenants/lookup?slug=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
      // A slow lookup mustn't hold up the sign-in page: show the general picture instead.
      signal: AbortSignal.timeout(3000),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.data?.exists) return null
    return body.data.appType ?? null
  } catch {
    return null
  }
}
