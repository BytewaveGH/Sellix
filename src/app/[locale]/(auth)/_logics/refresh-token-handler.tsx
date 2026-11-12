'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect } from 'react'
import { useParams } from 'next/navigation'

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
      const remainingTime = (session.user.accessTokenExpiry as number) - 1 * 60
      const currentTimestamp = Math.floor(Date.now() / 1000)
      const shouldRefreshTime = remainingTime - currentTimestamp
      // At most a day: browsers treat a timer longer than ~24.8 days as zero,
      // which would check the session hundreds of times a second.
      setInterval(shouldRefreshTime > 0 ? Math.min(shouldRefreshTime, 24 * 3600) : 10)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  return null
}
