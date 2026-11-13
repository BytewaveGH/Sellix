'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { EMPLOYEE_REFRESH_LEAD_S } from '@/lib/network'

interface RefreshTokenProps {
  setInterval: React.Dispatch<React.SetStateAction<number>>
}

export const RefreshTokenHandler = ({ setInterval }: RefreshTokenProps) => {
  const { data: session } = useSession()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  useEffect(() => {
    if ((session as any)?.error === 'RefreshAccessTokenError') {
      signOut({ callbackUrl: `/${locale}` })
      return
    }
    if (session) {
      // Check the session (which refreshes it on the server) ahead of expiry:
      // hours ahead for cashiers, a minute for owners.
      const lead = session.user.accountType === 'employee' ? EMPLOYEE_REFRESH_LEAD_S : 60
      const remainingTime = (session.user.accessTokenExpiry as number) - lead
      const currentTimestamp = Math.floor(Date.now() / 1000)
      const shouldRefreshTime = remainingTime - currentTimestamp
      // At most a day: browsers treat a timer longer than ~24.8 days as zero,
      // which would check the session hundreds of times a second.
      // Past the point: try again soon (cashiers have hours left, so once a minute).
      setInterval(shouldRefreshTime > 0 ? Math.min(shouldRefreshTime, 24 * 3600) : lead > 60 ? 60 : 10)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  return null
}
