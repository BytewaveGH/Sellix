import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CreateProduct from '@/app/[locale]/(stores)/stores/products/inventory/_widgets/_forms/create-product'
import { axiosError } from './fixtures'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/hooks/use-axios', () => ({ useAxios: () => mocks.request }))
// Reference data the form's selects need (unit types, warehouses).
vi.mock('@/hooks/use-fetch', () => ({
  useFetchData: (key: string) => ({
    data: key === 'units' ? [{ id: 2, name: 'Bottle' }] : key === 'warehouses' ? [{ id: 1, name: 'Main' }] : [],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ canManageProducts: false }) }))
// A fixed-price plan: the Pay as you sell fee type isn't shown.
vi.mock('@/lib/subscription/client', () => ({ useBilling: () => ({ access: { plan: null } }) }))

// Radix primitives used by the form's selects expect these in the browser.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

const product = {
  id: 5,
  name: 'Alomo Bitters',
  description: '',
  category: 'bottles',
  purchasePrice: 3,
  brand: 'Kasapreko',
  sku: 'ALOMO-200',
  imageUrl: '',
  // Whole-number prices: the form's number inputs have no `step`, so the browser
  // (and jsdom) block submitting decimals like 4.5 — a separate, pre-existing issue.
  units: [{ id: 21, unitId: 2, unitName: 'Bottle', retailPrice: 5, wholesalePrice: 4, pricingRule: 'flat', baseQuantity: 1 }],
  stock: [{ warehouseId: 1, quantity: 10 }],
}

const submitWithSku = async (sku: string) => {
  const onSuccess = vi.fn()
  render(<CreateProduct mode="update" productId={5} initialData={product} onSuccess={onSuccess} />)
  const skuInput = screen.getByPlaceholderText('e.g. ALOMO-200') as HTMLInputElement
  fireEvent.change(skuInput, { target: { value: sku } })
  fireEvent.click(screen.getByRole('button', { name: 'Update Product' }))
  return { onSuccess, skuInput }
}

beforeEach(() => vi.clearAllMocks())

describe('duplicate SKU on the product form', () => {
  it.each([
    ['409 (planned)', axiosError(409, { error: 'SKU already in use' })],
    ['500 constraint (today)', axiosError(500, { error: 'duplicate key value violates unique constraint "products_tenant_sku_key"' })],
  ])('%s shows the error on the SKU field and keeps the form', async (_label, err) => {
    mocks.request.mockRejectedValueOnce(err)
    const { onSuccess, skuInput } = await submitWithSku('TAKEN-1')

    expect(await screen.findByText('SKU already in use')).toBeTruthy()
    expect(skuInput.value).toBe('TAKEN-1') // not cleared
    expect(onSuccess).not.toHaveBeenCalled()

    // Only the changed field went out; untouched brand/imageUrl were omitted.
    const [[update]] = mocks.request.mock.calls
    expect(update).toMatchObject({ method: 'PUT', url: '/products/5', data: { sku: 'TAKEN-1' } })
    expect(update.data).not.toHaveProperty('brand')
    expect(update.data).not.toHaveProperty('imageUrl')
    // The fee type isn't shown on this plan; the saved one (none → general) goes back unchanged.
    expect(update.data.feeClass).toBe('general')
    expect(screen.queryByText('Fee type (Pay as you sell)')).toBeNull()
  })

  it('keeps a product’s saved fee type when it is edited', async () => {
    mocks.request.mockResolvedValue({})
    render(<CreateProduct mode="update" productId={5} initialData={{ ...product, feeClass: 'high' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update Product' }))
    await waitFor(() => expect(mocks.request).toHaveBeenCalled())
    expect(mocks.request.mock.calls[0][0].data.feeClass).toBe('high')
  })

  it('other errors are shown as a general message, not on the SKU field', async () => {
    mocks.request.mockRejectedValueOnce(axiosError(500, { error: 'database unavailable' }))
    await submitWithSku('NEW-SKU')
    expect(await screen.findByText('database unavailable')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('SKU already in use')).toBeNull())
  })
})
