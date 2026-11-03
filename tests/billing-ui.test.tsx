import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const auth = vi.hoisted(() => ({
  user: { accountType: 'admin', tenant: 'belkis', appType: 'retail', email: 'o@x.com' } as Record<string, string>,
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: auth.user } }), signOut: vi.fn() }))
const nav = vi.hoisted(() => ({ pathname: '/en/stores/pos' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const staff = vi.hoisted(() => ({ list: [{ id: 1 }, { id: 2 }, { id: 3 }] }))
vi.mock('@/hooks/use-fetch', () => ({ useFetchData: () => ({ data: staff.list, isLoading: false, refetch: vi.fn() }) }))

import { SubscriptionGate } from '@/components/billing/gate'
import BillingPage from '@/app/[locale]/(account)/billing/page'
import { applyAction, type BillingAction } from '@/lib/subscription/billing'
import { DEFAULT_CATALOG } from '@/lib/subscription/plans'
import { BILLING_CHANGED_EVENT } from '@/lib/subscription/events'
import type { Subscription } from '@/lib/subscription/types'

const DAY = 86_400_000
const catalog = {
  ...DEFAULT_CATALOG,
  settings: { ...DEFAULT_CATALOG.settings, paymentInstructions: 'MoMo 024 555 0000', supportContact: 'WhatsApp 020 000 0000' },
}

// Builds a subscription by replaying actions, each `daysAgo` before now.
const history = (...steps: [BillingAction, number][]) =>
  steps.reduce<Subscription | null>(
    (sub, [action, daysAgo]) => applyAction(sub, 1, action, catalog, { now: new Date(Date.now() - daysAgo * DAY), actor: 'platform' }),
    null
  )

let response: { status: number; subscription: Subscription | null } = { status: 200, subscription: null }
const posts: any[] = []

beforeEach(() => {
  auth.user = { accountType: 'admin', tenant: 'belkis', appType: 'retail', email: 'o@x.com' }
  nav.pathname = '/en/stores/pos'
  posts.length = 0
  try {
    localStorage.clear()
  } catch {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push(body)
        response.subscription = applyAction(response.subscription, 1, body, catalog, { now: new Date(), actor: 'owner' })
        return new Response(JSON.stringify({ data: response.subscription }))
      }
      if (response.status !== 200) return new Response(JSON.stringify({ message: 'down' }), { status: response.status })
      return new Response(JSON.stringify({ data: { subscription: response.subscription, catalog } }))
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

const renderGate = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SubscriptionGate>
        <p>the page</p>
      </SubscriptionGate>
    </QueryClientProvider>
  )

describe('subscription gate', () => {
  it('locks an expired business, keeps data reassurance, and shows how to pay', async () => {
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'growth', cycle: 'monthly' }, 60]) }
    renderGate()
    expect(await screen.findByText('Your subscription has ended')).toBeTruthy()
    expect(screen.queryByText('the page')).toBeNull()
    expect(screen.getByText(/nothing has been deleted/)).toBeTruthy()
    expect(screen.getByText('MoMo 024 555 0000')).toBeTruthy()
    expect(screen.getByText('belkis')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Plans & billing/ })).toBeTruthy()
  })

  it('says the trial ended, and tells staff to ask the owner', async () => {
    auth.user = { ...auth.user, accountType: 'employee' }
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'starter', cycle: 'monthly', trialDays: 14 }, 40]) }
    renderGate()
    expect(await screen.findByText('Your trial has ended')).toBeTruthy()
    expect(screen.getByText(/Ask the business owner to renew/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Plans & billing/ })).toBeNull()
  })

  it('still lets an expired owner reach the billing page', async () => {
    nav.pathname = '/en/billing'
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'growth', cycle: 'monthly' }, 60]) }
    renderGate()
    expect(await screen.findByText('the page')).toBeTruthy()
  })

  it('shows an upgrade screen for a page not on the plan', async () => {
    nav.pathname = '/en/stores/analytics'
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'starter', cycle: 'monthly', trialDays: 14 }, 1]) }
    renderGate()
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeTruthy()
    expect(screen.getByText('Growth feature')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Compare plans/ })).toBeTruthy()
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('warns about a trial ending soon (dismissible) and an overdue payment (not dismissible)', async () => {
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'growth', cycle: 'monthly', trialDays: 14 }, 11]) }
    const { unmount } = renderGate()
    expect(await screen.findByText(/free trial ends in 3 days/)).toBeTruthy()
    expect(screen.getByText('the page')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss for today' }))
    expect(screen.queryByText(/free trial ends/)).toBeNull()
    unmount()

    response = { status: 200, subscription: history([{ type: 'assign', planId: 'growth', cycle: 'monthly' }, 3]) }
    renderGate()
    expect(await screen.findByText(/Payment overdue/)).toBeTruthy()
    expect(screen.getByText('Pay now')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss for today' })).toBeNull()
    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('reloads billing straight away when the API answers 402', async () => {
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'growth', cycle: 'monthly', trialDays: 14 }, 1]) }
    renderGate()
    expect(await screen.findByText('the page')).toBeTruthy()
    // The backend has since locked the business; the cached view is stale.
    response = { status: 200, subscription: history([{ type: 'assign', planId: 'growth', cycle: 'monthly' }, 60]) }
    act(() => {
      window.dispatchEvent(new Event(BILLING_CHANGED_EVENT))
    })
    expect(await screen.findByText('Your subscription has ended')).toBeTruthy()
  })

  it('fails open when billing can’t be loaded', async () => {
    response = { status: 500, subscription: null }
    renderGate()
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(await screen.findByText('the page')).toBeTruthy()
    expect(screen.queryByText(/ended/)).toBeNull()
  })
})

describe('owner billing page', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  })

  it('shows plan, seats used and payments, and requests an upgrade', async () => {
    response = {
      status: 200,
      subscription: history(
        [{ type: 'assign', planId: 'starter', cycle: 'monthly', trialDays: 14 }, 20],
        [{ type: 'record-payment', amount: 150, method: 'momo', reference: 'TX-77' }, 10]
      ),
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BillingPage />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('heading', { name: 'Starter' })).toBeTruthy()
    expect(screen.getByText('All seats used — upgrade to add more')).toBeTruthy()
    expect(screen.getByText('TX-77')).toBeTruthy()
    // Retail features only on the comparison.
    expect(screen.getAllByText('Analytics').length).toBeGreaterThan(0)
    expect(screen.queryByText('Brand & theme editor')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Growth' }))
    fireEvent.change(await screen.findByLabelText('Note (optional)'), { target: { value: 'Paying Friday' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    })
    await waitFor(() => expect(posts).toEqual([{ type: 'request-plan', planId: 'growth', cycle: 'monthly', note: 'Paying Friday' }]))
    expect(await screen.findByText(/The Bytewave team will confirm it/)).toBeTruthy()
  })
})
