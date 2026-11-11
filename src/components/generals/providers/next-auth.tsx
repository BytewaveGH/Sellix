'use client'

import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'
import { SessionBridge } from './session-bridge'
import { RefreshTokenHandler } from '@/app/[locale]/(auth)/_logics/refresh-token-handler'
import { installSessionFallback } from '@/lib/session-offline'

// Before the first session check: a dropped connection must not look like a sign-out.
installSessionFallback()

interface NextAuthProviderProps {
  children: React.ReactNode
}

export const NextAuthProvider = ({ children }: NextAuthProviderProps) => {
  const [interval, setInterval] = useState(0)
  return (
    // refetchWhenOffline={false}: no session checks while the browser knows it's offline.
    <SessionProvider refetchInterval={interval} refetchOnWindowFocus={true} refetchWhenOffline={false}>
      <SessionBridge />
      {children}
      <RefreshTokenHandler setInterval={setInterval} />
    </SessionProvider>
  )
}
