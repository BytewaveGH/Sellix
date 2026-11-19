import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { encodeBusinessChoice, LOGIN_CODES } from '@/lib/owner-login'

const auth = vi.hoisted(() => ({ signIn: vi.fn(), getSession: vi.fn() }))
vi.mock('next-auth/react', () => auth)
const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), useParams: () => ({ locale: 'en' }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@/lib/tenant', async (orig) => ({
  ...(await orig<typeof import('@/lib/tenant')>()),
  classifyHost: () => ({ kind: 'tenant', slug: 'kofi-mart' }),
  // What the form asks for this site's business (the subdomain, or the desktop app's).
  clientTenantSlug: () => 'kofi-mart',
}))

import SignInForm from '@/components/generals/authentication/widgets/forms/sign-in'

const BUSINESSES = [
  { slug: 'kofi-homes', name: 'Kofi Homes', appType: 'real-estate' },
  { slug: 'kofi-mart', name: 'Kofi Mart', appType: 'retail' },
]

const fill = async (email: string, password: string) => {
  fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('XXXXXXXXX'), { target: { value: password } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
  })
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('owner sign-in with several businesses', () => {
  it('409 → picker; choosing a business re-signs in with its slug and routes by its appType', async () => {
    auth.signIn
      .mockResolvedValueOnce({ error: 'CredentialsSignin', code: encodeBusinessChoice(BUSINESSES), ok: false, status: 200 })
      .mockResolvedValueOnce({ error: undefined, ok: true, status: 200 })
    auth.getSession.mockResolvedValue({ user: { appType: 'real-estate', tenant: 'kofi-homes' } })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(<SignInForm />)
    await fill('kofi@x.com', 'secret123')

    expect(await screen.findByText('Choose a business')).toBeTruthy()
    const options = screen.getAllByRole('listitem')
    // The business for the subdomain you're on comes first and is tagged.
    expect(options[0].textContent).toContain('Kofi Mart')
    expect(options[0].textContent).toContain('This site')
    expect(options[1].textContent).toContain('Real Estate')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Kofi Homes/ }))
    })
    expect(auth.signIn).toHaveBeenLastCalledWith('credentials', {
      email: 'kofi@x.com',
      password: 'secret123',
      tenant: 'kofi-homes',
      redirect: false,
    })
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/en/real-estate'))
    // Credentials are never written to browser storage.
    expect(setItem.mock.calls.some(([, v]) => String(v).includes('secret123'))).toBe(false)
  })

  it('“back” returns to the filled-in form', async () => {
    auth.signIn.mockResolvedValueOnce({ error: 'CredentialsSignin', code: encodeBusinessChoice(BUSINESSES) })
    render(<SignInForm />)
    await fill('kofi@x.com', 'secret123')
    fireEvent.click(await screen.findByRole('button', { name: /Use a different email or password/ }))
    expect((screen.getByPlaceholderText('Enter your email') as HTMLInputElement).value).toBe('kofi@x.com')
    expect(screen.queryByText('Choose a business')).toBeNull()
  })

  it('a suspended business keeps you on the picker with the reason', async () => {
    auth.signIn
      .mockResolvedValueOnce({ error: 'CredentialsSignin', code: encodeBusinessChoice(BUSINESSES) })
      .mockResolvedValueOnce({ error: 'CredentialsSignin', code: LOGIN_CODES.suspended })
    render(<SignInForm />)
    await fill('kofi@x.com', 'secret123')
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Kofi Homes/ }))
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/suspended/)
    expect(screen.getByText('Choose a business')).toBeTruthy()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('401 shows “Invalid email or password”', async () => {
    auth.signIn.mockResolvedValueOnce({ error: 'CredentialsSignin', code: LOGIN_CODES.invalid })
    render(<SignInForm />)
    await fill('kofi@x.com', 'wrong')
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password')
    expect(screen.queryByText('Choose a business')).toBeNull()
  })
})
