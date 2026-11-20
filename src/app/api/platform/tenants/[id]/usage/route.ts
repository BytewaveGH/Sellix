import { NextResponse } from 'next/server'
import { requireSuperAdminSession } from '@/lib/platform-api'
import { billingStore, respond } from '@/lib/subscription/server-store'

// Pay as you sell: a business's sales in its current billing period (null if
// the backend hasn't counted any yet).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireSuperAdminSession())) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  return respond(() => billingStore().usage(Number(params.id)))
}
