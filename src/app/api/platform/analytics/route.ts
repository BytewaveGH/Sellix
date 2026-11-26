import { periodOf, proxyAnalytics } from '@/lib/platform/analytics-proxy'

// Every business's usage over the last 7, 30 or 90 days (§15).
export async function GET(req: Request) {
  const days = periodOf(new URL(req.url).searchParams.get('days'))
  return proxyAnalytics(`/platform/analytics?days=${days}`)
}
