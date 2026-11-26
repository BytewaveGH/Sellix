import React from 'react'
import { TanstackQueryProvider } from './react-query'
import { NextAuthProvider } from './next-auth'
import { ThemeProvider } from '@/components/theme/theme'
import { InstallCard } from '@/components/install/install-app'
import { RememberPage } from '@/components/install/remember-page'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider>
      <TanstackQueryProvider>
        <NextAuthProvider>
          {/* <ReactFlowProvider>{children}</ReactFlowProvider> */}
          {children}
          {/* Phones and tablets, first visit: offer to install the app. */}
          <InstallCard />
          {/* Installed app: reopen on the last screen (src/lib/last-page.ts). */}
          <RememberPage />
        </NextAuthProvider>
      </TanstackQueryProvider>
    </ThemeProvider>
  )
}
