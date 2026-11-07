import React from 'react'
import { TanstackQueryProvider } from './react-query'
import { NextAuthProvider } from './next-auth'
import { ThemeProvider } from '@/components/theme/theme'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider>
      <TanstackQueryProvider>
        <NextAuthProvider>
          {/* <ReactFlowProvider>{children}</ReactFlowProvider> */}
          {children}
        </NextAuthProvider>
      </TanstackQueryProvider>
    </ThemeProvider>
  )
}
