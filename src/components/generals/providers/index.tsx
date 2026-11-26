import React from 'react'
import { TanstackQueryProvider } from './react-query'
import { NextAuthProvider } from './next-auth'
import { ThemeProvider } from '@/components/theme/theme'
import { InstallCard } from '@/components/install/install-app'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider>
      <TanstackQueryProvider>
        <NextAuthProvider>
          {/* <ReactFlowProvider>{children}</ReactFlowProvider> */}
          {children}
          {/* Phones and tablets, first visit: offer to install the app. */}
          <InstallCard />
        </NextAuthProvider>
      </TanstackQueryProvider>
    </ThemeProvider>
  )
}
