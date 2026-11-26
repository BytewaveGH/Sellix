// Server-only: the console's analytics reads, passed to the backend with the
// platform key. A 404 means the backend hasn't built them yet (§15): the
// console gets `null` and shows what it can without them.
import { NextResponse } from 'next/server'
import { platformFetch, requireSuperAdminSession } from '@/lib/platform-api'

export const PERIODS = [7, 30, 90] as const
export const periodOf = (v: string | null) => (PERIODS as readonly number[]).includes(Number(v)) ? Number(v) : 30

export async function proxyAnalytics(path: string) {
  if (!(await requireSuperAdminSession())) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  try {
    const res = await platformFetch(path)
    if (res.status === 404 || res.status === 501) return NextResponse.json({ data: null })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ message: body?.error ?? 'Couldn’t load analytics' }, { status: res.status })
    return NextResponse.json({ data: body?.data ?? null })
  } catch {
    return NextResponse.json({ message: 'The server can’t be reached' }, { status: 502 })
  }
}
