import { NextResponse } from 'next/server'
import { periodOf, proxyAnalytics } from '@/lib/platform/analytics-proxy'

// One business in detail: daily figures, staff, devices, screens used (§15).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: 'Unknown business' }, { status: 400 })
  const days = periodOf(new URL(req.url).searchParams.get('days'))
  return proxyAnalytics(`/platform/tenants/${id}/activity?days=${days}`)
}
