'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    // 'always': run even when the browser says it's offline. By default React
    // Query pauses every load while offline and resumes only when the
    // connection is back — screens hung and actions (a counter order) waited
    // for it. Offline answers come from this device (lib/offline), and
    // data kept in the browser needs no network at all.
    queries: {
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

export function TanstackQueryProvider({ children }: { children: React.ReactNode }) {
  return (
    // Provide the client to your App
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
