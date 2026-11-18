// The owner and staff sign-in pages link to each other, so nobody needs the
// exact address (or, on the desktop app, a keyboard shortcut) to switch.
import React from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('next-auth/react', () => ({ signIn: vi.fn(), getSession: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ locale: 'fr' }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

import SignInForm from '@/components/generals/authentication/widgets/forms/sign-in'
import StaffSignInForm from '@/components/generals/authentication/widgets/forms/staff-sign-in'

beforeAll(() => {
  // The owner form's checkbox measures itself; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('sign-in pages link to each other', () => {
  it('the owner page links to staff sign-in', () => {
    render(<SignInForm />)
    expect(screen.getByRole('link', { name: 'Sign in here' })).toHaveProperty('href', expect.stringMatching(/\/fr\/staff$/))
    expect(screen.getByText(/Staff\?/)).toBeTruthy()
  })

  it('the staff page links to owner sign-in', () => {
    render(<StaffSignInForm />)
    expect(screen.getByRole('link', { name: 'Sign in here' })).toHaveProperty('href', expect.stringMatching(/\/fr$/))
    expect(screen.getByText(/Owner\?/)).toBeTruthy()
  })
})
