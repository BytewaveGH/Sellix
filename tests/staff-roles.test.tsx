import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const sent = vi.hoisted(() => ({ requests: [] as any[] }))
vi.mock('@/hooks/use-axios', () => ({ useAxios: () => async (config: any) => sent.requests.push(config) }))

import CreateEmployee from '@/components/account/employee-form'
import { getSidebarItems } from '@/components/generals/layouts/logics/data'
import { APP_TYPES } from '@/lib/app-type'
import { PERMISSION_KEYS, STAFF_MODULES, matchingPreset, presetValues, staffModule } from '@/lib/staff-roles'

describe('staff permissions per module', () => {
  it('lets an owner grant every permission their module’s pages need', () => {
    for (const appType of APP_TYPES) {
      const offered = new Set(STAFF_MODULES[appType].permissions.map((p) => p.key))
      const needed = getSidebarItems(appType).flatMap((g) => g.items.flatMap((i) => [i.requiredPermission ?? []].flat()))
      for (const key of needed) expect(offered.has(key as any), `${appType} needs ${key}`).toBe(true)
    }
  })

  it('shows only what the module uses: no warehouses or invoices outside retail', () => {
    expect(STAFF_MODULES.retail.permissions).toHaveLength(8)
    for (const appType of ['eatery', 'real-estate', 'amusement'] as const) {
      const keys = STAFF_MODULES[appType].permissions.map((p) => p.key)
      expect(keys).not.toContain('canManageWarehouses')
      expect(keys).not.toContain('canManageInvoices')
    }
    expect(staffModule('unknown')).toBe(STAFF_MODULES.retail)
  })

  it('presets set every key and are recognised from the toggles', () => {
    const eatery = STAFF_MODULES.eatery
    const kitchen = eatery.presets.find((p) => p.label === 'Kitchen')!
    const values = presetValues(kitchen)
    expect(Object.keys(values).sort()).toEqual([...PERMISSION_KEYS].sort())
    expect(values).toMatchObject({ canManageSales: true, canManageStock: true, canViewReports: false, canManageWarehouses: false })
    expect(matchingPreset(eatery, values)?.label).toBe('Kitchen')
    expect(matchingPreset(eatery, presetValues(eatery.presets[0]))?.label).toBe('Admin')
  })
})

describe('employee form', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  })
  beforeEach(() => {
    sent.requests.length = 0
  })

  it('an eatery owner sees eatery permissions and roles, and creates a kitchen hand', async () => {
    render(<CreateEmployee appType="eatery" />)
    expect(screen.getByText('Take orders')).toBeTruthy()
    expect(screen.getByText('Manage ingredients')).toBeTruthy()
    expect(screen.queryByText('Manage warehouses')).toBeNull()
    expect(screen.queryByText('Sell at the POS')).toBeNull()
    expect(screen.queryByText(/Stock keeper/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Kitchen/ }))
    expect(screen.getByRole('switch', { name: 'Take orders' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Edit menu & brand' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('button', { name: /Kitchen/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(screen.getByPlaceholderText('e.g. Kwame Mensah'), { target: { value: 'Esi Mensah' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. kwame@business.com'), { target: { value: 'esi@x.com' } })
    // Too weak first: at least 8 characters with a number.
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/), { target: { value: 'secret' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Employee' }))
    })
    expect(await screen.findByText('Use at least 8 characters')).toBeTruthy()
    expect(sent.requests).toHaveLength(0)
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/), { target: { value: 'kitchen24' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Employee' }))
    })
    await waitFor(() => expect(sent.requests).toHaveLength(1))
    expect(sent.requests[0]).toMatchObject({ method: 'POST', url: '/employees/' })
    expect(sent.requests[0].data).toMatchObject({
      name: 'Esi Mensah',
      email: 'esi@x.com',
      password: 'kitchen24',
      canManageSales: true,
      canManageStock: true,
      canManageProducts: false,
      canManageWarehouses: false,
      canManageInvoices: false,
    })
  })

  it('real estate and amusement use their own words', () => {
    const { unmount } = render(<CreateEmployee appType="real-estate" />)
    expect(screen.getByText('Manage tenants & rent')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Caretaker/ })).toBeTruthy()
    unmount()
    render(<CreateEmployee appType="amusement" />)
    expect(screen.getByText('Sell tickets & bookings')).toBeTruthy()
    expect(screen.queryByText('Manage ingredients')).toBeNull()
  })
})
