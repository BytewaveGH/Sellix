import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// Requests go through `respond`, which each test sets.
const api = vi.hoisted(() => ({
  requests: [] as any[],
  respond: (_config: any): any => ({ data: { data: {} } }),
}))
vi.mock('@/hooks/use-axios', () => ({
  useAxios: () => async (config: any) => {
    api.requests.push(config)
    return api.respond(config)
  },
}))
const auth = vi.hoisted(() => ({ user: {} as any }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: auth.user }, status: 'authenticated' }), signOut: vi.fn() }))
const team = vi.hoisted(() => ({ members: [] as any[], refetch: vi.fn() }))
vi.mock('@/hooks/use-fetch', () => ({ useFetchData: () => ({ data: team.members, isLoading: false, refetch: team.refetch }) }))
vi.mock('@/lib/subscription/client', () => ({ useBilling: () => ({ access: { plan: { name: 'Growth' }, limits: {} }, isOwner: true }) }))
vi.mock('@/lib/subscription/access', () => ({ staffLimit: () => null, canAddStaff: () => true }))

import { ChangePassword } from '@/components/account/change-password'
import { Team } from '@/components/account/team'
import { AccountServices, changePasswordError, generatePassword, matchesSearch, passwordProblems, resetError } from '@/lib/account'

const httpError = (status: number, error = '') => ({ response: { status, data: error ? { error } : {} } })

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})
beforeEach(() => {
  api.requests = []
  api.respond = () => ({ data: { data: {} } })
})

describe('account rules', () => {
  it('passwords need 8 characters, letters and a number, and must match', () => {
    expect(passwordProblems({ current: '', next: 'abc', confirm: 'x' }, true)).toEqual({
      current: 'Enter your current password',
      next: 'Use at least 8 characters',
      confirm: 'The passwords don’t match',
    })
    expect(passwordProblems({ next: 'abcdefgh', confirm: 'abcdefgh' }, false).next).toMatch(/number/)
    expect(passwordProblems({ current: 'kitchen24', next: 'kitchen24', confirm: 'kitchen24' }, true).next).toMatch(/different/)
    expect(passwordProblems({ current: 'old', next: 'kitchen24', confirm: 'kitchen24' }, true)).toEqual({})
  })

  it('suggested passwords are strong and easy to read out', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword()
      expect(p).toHaveLength(10)
      expect(passwordProblems({ next: p, confirm: p }, false)).toEqual({})
      expect(p).not.toMatch(/[01OIl]/)
    }
  })

  it('owners and staff change passwords on their own endpoints, never refreshing on a 401', () => {
    expect(AccountServices.ChangePassword('owner', 'a', 'b')).toMatchObject({
      method: 'PUT',
      url: '/auth/update-password',
      data: { currentPassword: 'a', newPassword: 'b', confirmNewPassword: 'b' },
      skipAuthRefresh: true,
    })
    expect(AccountServices.ChangePassword('staff', 'a', 'b')).toMatchObject({ url: '/employees/me/password', skipAuthRefresh: true })
  })

  it('explains failures in plain words', () => {
    expect(changePasswordError(httpError(400, 'invalid_current_password'), 'owner')).toBe('Your current password isn’t right')
    expect(changePasswordError(httpError(404), 'staff')).toMatch(/Ask the owner or a manager/)
    expect(changePasswordError(httpError(500), 'owner')).toMatch(/Contact Bytewave support/)
    expect(resetError(httpError(400))).toMatch(/code is wrong or has expired/)
    expect(resetError(httpError(429))).toMatch(/Too many tries/)
  })

  it('finds staff by name, email or phone', () => {
    const m = { id: 1, name: 'Esi Mensah', email: 'esi@x.com', phone: '024 111' }
    expect(matchesSearch(m, 'mens')).toBe(true)
    expect(matchesSearch(m, '024')).toBe(true)
    expect(matchesSearch(m, 'kofi')).toBe(false)
  })
})

describe('change password', () => {
  const fill = (current: string, next: string, confirm = next) => {
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
  }

  it('checks the form before sending, then changes the owner’s password', async () => {
    render(<ChangePassword kind="owner" />)
    fill('old-pass1', 'short')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })))
    expect(screen.getByText('Use at least 8 characters')).toBeTruthy()
    expect(api.requests).toHaveLength(0)

    fill('old-pass1', 'new-pass22')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })))
    expect(api.requests[0]).toMatchObject({
      url: '/auth/update-password',
      data: { currentPassword: 'old-pass1', newPassword: 'new-pass22' },
    })
    expect(await screen.findByRole('status')).toBeTruthy()
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('')
  })

  it('says when the current password is wrong', async () => {
    api.respond = () => Promise.reject(httpError(400, 'invalid_current_password'))
    render(<ChangePassword kind="owner" />)
    fill('wrong-pass1', 'new-pass22')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })))
    expect((await screen.findByRole('alert')).textContent).toBe('Your current password isn’t right')
  })

  it('tells staff to ask a manager while their endpoint is missing', async () => {
    api.respond = () => Promise.reject(httpError(404))
    render(<ChangePassword kind="staff" />)
    fill('old-pass1', 'new-pass22')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })))
    expect((await screen.findByRole('alert')).textContent).toMatch(/reset it for you from Team/)
  })
})

describe('team', () => {
  const perms = { canManageSales: true, canManageStock: false, canViewReports: false, canManageProducts: false, canManageOperations: false }
  beforeEach(() => {
    auth.user = { accountType: 'employee', userId: 7, appType: 'eatery', canManageEmployees: true }
    team.members = [
      { id: 7, name: 'Ama Owusu', email: 'ama@x.com', status: 'active', ...perms, canManageEmployees: true },
      { id: 8, name: 'Kofi Boateng', email: 'kofi@x.com', status: 'active', ...perms },
      { id: 9, name: 'Yaw Darko', email: 'yaw@x.com', status: 'suspended', ...perms },
    ]
  })

  const card = (name: RegExp) => screen.getByText(name).closest('div.p-4') as HTMLElement

  it('shows roles in the module’s words, suspended staff last, and protects your own account', () => {
    render(<Team />)
    const names = screen.getAllByText(/Ama Owusu|Kofi Boateng|Yaw Darko/).map((n) => n.textContent)
    expect(names[names.length - 1]).toMatch(/Yaw Darko/)
    expect(within(card(/Kofi Boateng/)).getByText('Cashier / waiter')).toBeTruthy()
    expect(within(card(/Yaw Darko/)).getByText('Suspended')).toBeTruthy()
    expect(within(card(/Ama Owusu/)).getByText('(you)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Ama Owusu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Suspend Ama Owusu' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reactivate Yaw Darko' })).toBeTruthy()
  })

  it('resets a password and shows it once to pass on', async () => {
    render(<Team />)
    fireEvent.click(screen.getByRole('button', { name: "Reset Kofi Boateng's password" }))
    const input = (await screen.findByLabelText('New password')) as HTMLInputElement
    expect(passwordProblems({ next: input.value, confirm: input.value }, false)).toEqual({})
    fireEvent.change(input, { target: { value: 'counter99' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Set new password' })))
    expect(api.requests[0]).toMatchObject({ method: 'PUT', url: '/employees/8', data: { password: 'counter99' } })
    expect((await screen.findByRole('status')).textContent).toMatch(/counter99/)
  })

  it('suspends someone, and says so when the server ignores it', async () => {
    api.respond = (c) => ({ data: { data: { id: 8, status: c.data.status } } })
    render(<Team />)
    fireEvent.click(screen.getByRole('button', { name: 'Suspend Kofi Boateng' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Suspend' })))
    expect(api.requests[0]).toMatchObject({ method: 'PUT', url: '/employees/8', data: { status: 'suspended' } })
    await waitFor(() => expect(team.refetch).toHaveBeenCalled())

    // Today's server: 200 with the status unchanged.
    api.respond = () => ({ data: { data: { id: 8, status: 'active' } } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend Kofi Boateng' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Suspend' })))
    expect(await screen.findByText(/Suspending staff isn’t switched on yet/)).toBeTruthy()
  })

  it('removes someone after confirming', async () => {
    render(<Team />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Kofi Boateng' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove' })))
    expect(api.requests[0]).toMatchObject({ method: 'DELETE', url: '/employees/8' })
  })
})
