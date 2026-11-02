import React from 'react'
import { render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const auth = vi.hoisted(() => ({ session: { status: 'loading', data: null } as { status: string; data: unknown } }))
vi.mock('next-auth/react', () => ({ useSession: () => auth.session, signOut: vi.fn() }))
const nav = vi.hoisted(() => ({ pathname: '/en/eatery' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push: vi.fn() }),
}))

import ILayout from '@/components/generals/layouts'
import { appTypeFromPath, dashboardAppType } from '@/lib/app-type'

// The shell reads billing through React Query, as under the app's root providers.
const render = (ui: React.ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as any
})

describe('which module a page belongs to', () => {
  it('comes from the address when it says', () => {
    expect(appTypeFromPath('/en/eatery/pos')).toBe('eatery')
    expect(appTypeFromPath('/fr/real-estate')).toBe('real-estate')
    expect(appTypeFromPath('/en/amusement/tickets')).toBe('amusement')
    expect(appTypeFromPath('/en/stores/orders')).toBe('retail')
    // Pages every module shares don't say.
    expect(appTypeFromPath('/en/team')).toBeNull()
    expect(appTypeFromPath('/en/account')).toBeNull()
    expect(appTypeFromPath('/en')).toBeNull()
  })

  it('never falls back to retail while the session is loading', () => {
    expect(dashboardAppType('/en/team', undefined, true)).toBeNull()
    expect(dashboardAppType('/en/team', 'eatery', false)).toBe('eatery')
    expect(dashboardAppType('/en/eatery', 'retail', false)).toBe('eatery')
    expect(dashboardAppType('/en/stores/pos', undefined, false)).toBe('retail')
  })
})

describe('dashboard menu on a slow network', () => {
  const owner = { status: 'authenticated', data: { user: { appType: 'eatery', accountType: 'admin', email: 'o@x.com', username: 'Ama' } } }

  it('shows a neutral placeholder — not the retail POS menu — while the session loads', () => {
    auth.session = { status: 'loading', data: null }
    nav.pathname = '/en/eatery'
    render(<ILayout>page</ILayout>)
    expect(screen.getByTestId('sidebar-loading')).toBeTruthy()
    expect(screen.queryByText('POS')).toBeNull()
    expect(screen.queryByText('All products')).toBeNull()
    expect(screen.queryByText('Access POS')).toBeNull()
  })

  it('then shows the eatery menu, with no retail items or button', () => {
    auth.session = owner
    nav.pathname = '/en/eatery'
    render(<ILayout>page</ILayout>)
    expect(screen.queryByTestId('sidebar-loading')).toBeNull()
    expect(screen.getByText('Counter (POS)')).toBeTruthy()
    expect(screen.getByText('Ingredients & costs')).toBeTruthy()
    expect(screen.queryByText('All products')).toBeNull()
    expect(screen.queryByText('Access POS')).toBeNull()
  })

  it('keeps the eatery menu on shared pages like Team', () => {
    auth.session = owner
    nav.pathname = '/en/team'
    render(<ILayout>page</ILayout>)
    expect(screen.getByText('Live orders')).toBeTruthy()
    expect(screen.queryByText('All products')).toBeNull()
  })

  it('retail still gets its POS menu and button', () => {
    auth.session = {
      status: 'authenticated',
      data: { user: { appType: 'retail', accountType: 'admin', email: 'r@x.com', username: 'Kofi' } },
    }
    nav.pathname = '/en/stores/overview'
    render(<ILayout>page</ILayout>)
    expect(screen.getByText('All products')).toBeTruthy()
    expect(screen.getByText('Access POS')).toBeTruthy()
  })
})
