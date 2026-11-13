// The §13 backend follow-up: till fields, batch sending, catalogue changes, cashier refresh.
import { vi } from 'vitest'
import { memoryStore, setOfflineStore } from '@/lib/offline/store'
import { cachedRead, getKept, listOps, queueWrite, saveRead, setKept, syncOutbox, type SendRequest } from '@/lib/offline/engine'
import { offlineKind, withOffline } from '@/lib/offline/adapter'
import { reportReachable } from '@/lib/connection'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { batchFor, isFullList, listIn, refusalMessage } from '@/lib/offline/rules'
import { syncEateryMenu, syncRetailCatalogue } from '@/lib/offline/catalogue'
import { refreshOutcome } from '@/lib/network'
import { deviceId, nextReceiptNo } from '@/lib/till'
import { buildSalePayload, submitSale } from '@/app/[locale]/(stores)/stores/pos/_logics/checkout'
import { saleToOrder } from '@/lib/store/orders'
import { offlineCounterOrder, offlineOrderBody } from '@/lib/eatery/offline-order'

const SCOPE = 'acme:1'
const httpErr = (status: number, data: Record<string, unknown> = {}) =>
  Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data } })
const netErr = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK', request: {} })

beforeEach(() => {
  setOfflineStore(memoryStore())
  localStorage.clear()
})

const sale = (clientId: string, unit = 41) => ({
  method: 'post',
  url: '/sales/',
  data: {
    clientId,
    receiptNo: `R-${clientId}`,
    deviceId: 'till-1',
    soldAt: '2026-11-11T10:00:00Z',
    paymentType: 'cash',
    warehouseId: 3,
    items: [{ productUnitId: unit, quantity: 1, pricingType: 'retail', unitPrice: 48 }],
  },
})

describe('the till’s own numbers', () => {
  it('keeps one device id and counts receipts up', () => {
    const id = deviceId()
    expect(id).toMatch(/^till-[0-9a-f]{8}$/)
    expect(deviceId()).toBe(id)
    expect(nextReceiptNo()).toBe(`${id.slice(-4).toUpperCase()}-0001`)
    expect(nextReceiptNo()).toBe(`${id.slice(-4).toUpperCase()}-0002`)
  })
})

describe('sending till sales in batches', () => {
  it('only batches sales and counter orders that carry a clientId', () => {
    expect(batchFor(sale('a'))?.url).toBe('/sync/sales')
    expect(batchFor({ method: 'post', url: '/eatery/orders/counter', data: { clientId: 'b' } })?.url).toBe('/eatery/sync/orders')
    expect(batchFor({ method: 'post', url: '/sales/', data: {} })).toBeNull()
    expect(batchFor({ method: 'put', url: '/sales/3', data: { clientId: 'x' } })).toBeNull()
  })

  it('sends them together and handles created, duplicate and rejected', async () => {
    for (const id of ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'])
      await queueWrite(SCOPE, sale(id, id === 'cccccccc' ? 88 : 41), { names: { '88': 'Milo 400g (Tin)' } })
    // A change to the first sale made offline waits for its real id.
    const first = (await listOps(SCOPE))[0]
    await queueWrite(SCOPE, { method: 'put', url: `/sales/${first.tempId}`, data: { note: 'x' } })
    const sent: SendRequest[] = []
    const send = async (req: SendRequest) => {
      sent.push(req)
      if (req.url === '/sync/sales')
        return {
          data: {
            status: true,
            data: {
              results: [
                { clientId: 'aaaaaaaa', status: 'created', id: 9812 },
                { clientId: 'bbbbbbbb', status: 'duplicate', id: 9790 },
                { clientId: 'cccccccc', status: 'rejected', code: 'product_unit_deleted', message: 'product unit 88 no longer exists' },
              ],
            },
          },
        }
      return { data: { status: true, data: {} } }
    }
    expect(await syncOutbox(SCOPE, send)).toMatchObject({ sent: 3, failed: 1, stopped: false })
    expect(sent.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /sync/sales', 'PUT /sales/9812'])
    expect((sent[0].data as { sales: unknown[] }).sales).toHaveLength(3)
    expect(sent[0].headers).toEqual({ 'X-Device-Id': 'till-1' })
    const left = await listOps(SCOPE)
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ status: 'failed', code: 'product_unit_deleted', error: '“Milo 400g (Tin)” is no longer in the catalogue.' })
  })

  it('keeps the batch for later on no answer, too many requests or a server error', async () => {
    await queueWrite(SCOPE, sale('aaaaaaaa'), { safeToRepeat: true })
    for (const fail of [netErr(), httpErr(429, { code: 'too_many_requests' }), httpErr(500)]) {
      expect(await syncOutbox(SCOPE, async () => Promise.reject(fail))).toMatchObject({ stopped: true })
      expect((await listOps(SCOPE)).map((o) => o.status)).toEqual(['waiting'])
    }
  })

  it('sends one by one when the server has no batch endpoint', async () => {
    await queueWrite(SCOPE, { ...sale('dddddddd'), url: '/eatery/orders/counter' })
    const sent: string[] = []
    await syncOutbox(SCOPE, async (req) => {
      sent.push(req.url)
      if (req.url === '/eatery/sync/orders') throw httpErr(404)
      return { data: { data: { id: 5 } } }
    })
    expect(sent).toEqual(['/eatery/sync/orders', '/eatery/orders/counter'])
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('splits more than 200 into several batches', async () => {
    for (let i = 0; i < 205; i++) await queueWrite(SCOPE, sale(`sale-${String(i).padStart(4, '0')}`))
    const sizes: number[] = []
    await syncOutbox(SCOPE, async (req) => {
      const sales = (req.data as { sales: { clientId: string }[] }).sales
      sizes.push(sales.length)
      return { data: { data: { results: sales.map((s, i) => ({ clientId: s.clientId, status: 'created', id: 1000 * sizes.length + i + 1 })) } } }
    })
    expect(sizes).toEqual([200, 5])
    expect(await listOps(SCOPE)).toEqual([])
  })
})

describe('what staff read when a sale is refused', () => {
  it('names deleted items from the till and explains clock problems', () => {
    expect(refusalMessage('menu_item_deleted', 'menu item 12 no longer exists', { '12': 'Jollof' })).toBe('“Jollof” is no longer in the menu.')
    expect(refusalMessage('product_unit_deleted', 'product unit 5 no longer exists')).toBe('product unit 5 no longer exists')
    expect(refusalMessage('bad_sale_time', 'soldAt is in the future')).toMatch(/check this PC’s date and time/)
    expect(refusalMessage(undefined, 'Nope')).toBe('Nope')
  })
})

describe('a retail sale’s till fields', () => {
  const cart = [{ selectedUnit: '41', quantity: 2 }] as any
  const preview = {
    paymentType: 'cash',
    totalAmount: 96,
    items: [{ productUnitId: 41, productName: 'Milo 400g', unitName: 'Tin', quantity: 2, unitPrice: 48, subtotal: 96 }],
  }

  it('a live sale carries the receipt number, device and time but not the till’s prices', async () => {
    const payload = buildSalePayload(cart, {
      paymentType: 'cash',
      warehouseId: 3,
      customerType: 'retail',
      user: null,
      clientId: 'cid-0001',
      receiptNo: 'AB12-0001',
      at: new Date('2026-11-11T10:02:31Z'),
    })
    expect(payload).toMatchObject({ clientId: 'cid-0001', receiptNo: 'AB12-0001', soldAt: '2026-11-11T10:02:31.000Z', deviceId: expect.stringMatching(/^till-/) })
    const request = vi.fn().mockResolvedValue({ data: { data: { id: 1, clientId: 'cid-0001', receiptNo: 'AB12-0001', totalAmount: 96, items: [] } } })
    const result = await submitSale(request, payload, { preview })
    expect(request.mock.calls[0][0].data.items[0].unitPrice).toBeUndefined()
    // Kept offline, it's sent with what the customer paid.
    expect(request.mock.calls[0][0].offline.body().items[0].unitPrice).toBe(48)
    expect(request.mock.calls[0][0].offline.safeToRepeat).toBe(true)
    expect(result).toMatchObject({ ok: true, receipt: { receiptNo: 'AB12-0001' } })
  })

  it('names a deleted product from the cart when a live sale is refused', async () => {
    const request = vi.fn().mockRejectedValue(httpErr(422, { error: 'product unit 41 no longer exists', code: 'product_unit_deleted' }))
    const result = await submitSale(request, buildSalePayload(cart, { paymentType: 'cash', warehouseId: 3, customerType: 'retail', user: null }), {
      preview,
    })
    expect(result).toEqual({ ok: false, kind: 'invalid', message: '“Milo 400g (Tin)” is no longer in the catalogue.' })
  })

  it('shows when a sale happened and what to review', () => {
    const o = saleToOrder({
      id: 9812,
      receiptNo: 'AB12-0042',
      soldAt: '2026-11-11T10:00:00Z',
      createdAt: '2026-11-11T16:00:00Z',
      stockShort: true,
      totalAmount: 50,
      items: [{ productName: 'Milo', quantity: 1, unitPrice: 50, subtotal: 50, priceMismatch: true, catalogPrice: 48 }],
    })
    expect(o).toMatchObject({ ref: 'S-9812', receiptNo: 'AB12-0042', date: '2026-11-11T10:00:00Z', stockShort: true, priceMismatch: true })
    expect(o.lines[0]).toMatchObject({ priceMismatch: true, catalogPrice: 48 })
    expect(saleToOrder({ id: -12345, receiptNo: 'AB12-0043' }).ref).toBe('AB12-0043')
  })
})

describe('keeping the catalogue on the PC current', () => {
  const page = (over: Record<string, unknown> = {}) => ({
    cursor: 'c1',
    hasMore: false,
    nextAfter: 0,
    products: [],
    stock: [],
    warehouses: [],
    deleted: {},
    ...over,
  })
  const POS = { url: '/products/', params: { limit: 1000, offset: 0 } }

  it('downloads everything the first time, under the request the till makes', async () => {
    const get = vi.fn().mockResolvedValueOnce(page({ products: [{ id: 1, name: 'Milo' }], warehouses: [{ id: 3, name: 'Main' }] }))
    await syncRetailCatalogue(SCOPE, get)
    expect(get).toHaveBeenCalledWith('/sync/changes', {})
    expect(listIn((await cachedRead(SCOPE, POS))!.body)).toEqual([{ id: 1, name: 'Milo' }])
    expect(listIn((await cachedRead(SCOPE, { url: '/warehouses/' }))!.body)).toEqual([{ id: 3, name: 'Main' }])
    expect(await getKept(SCOPE, 'retail-cursor')).toBe('c1')
  })

  it('then applies only changes: upserts, stock, deleted products and units, across pages', async () => {
    await setKept(SCOPE, 'retail-cursor', 'c0')
    await saveRead(SCOPE, POS, {
      data: {
        data: [
          { id: 1, name: 'Milo', units: [{ id: 10 }, { id: 11 }], stock: [{ warehouseId: 3, quantity: 5 }], totalQuantity: 5 },
          { id: 2, name: 'Gone' },
        ],
        count: 2,
      },
    })
    // A search result: changed rows are replaced, but nothing new is added to it.
    await saveRead(SCOPE, { url: '/products/', params: { q: 'mi' } }, { data: [{ id: 1, name: 'Milo' }] })
    const get = vi
      .fn()
      .mockResolvedValueOnce(
        page({
          cursor: 'c2',
          hasMore: true,
          nextAfter: 1,
          products: [{ id: 1, name: 'Milo 400g', units: [{ id: 10 }, { id: 11 }], stock: [{ warehouseId: 3, quantity: 5 }], totalQuantity: 5 }],
          stock: [
            { productId: 1, warehouseId: 3, quantity: 9 },
            { productId: 1, warehouseId: 4, quantity: 1 },
          ],
          deleted: { products: [2], productUnits: [11] },
        })
      )
      .mockResolvedValueOnce(page({ cursor: 'ignored', products: [{ id: 3, name: 'Sugar' }] }))
    await syncRetailCatalogue(SCOPE, get)
    expect(get.mock.calls[1]).toEqual(['/sync/changes', { since: 'c0', after: 1, cursor: 'c2' }])
    expect(listIn((await cachedRead(SCOPE, POS))!.body)).toEqual([
      {
        id: 1,
        name: 'Milo 400g',
        units: [{ id: 10 }],
        stock: [
          { warehouseId: 3, quantity: 9 },
          { warehouseId: 4, quantity: 1 },
        ],
        totalQuantity: 10,
      },
      { id: 3, name: 'Sugar' },
    ])
    expect(listIn((await cachedRead(SCOPE, { url: '/products/', params: { q: 'mi' } }))!.body)).toHaveLength(1)
    // The first page's cursor, saved only after the last page.
    expect(await getKept(SCOPE, 'retail-cursor')).toBe('c2')
  })

  it('starts over when the server no longer accepts the saved cursor', async () => {
    await setKept(SCOPE, 'retail-cursor', 'stale')
    const get = vi.fn().mockRejectedValueOnce(httpErr(400)).mockResolvedValueOnce(page({ cursor: 'fresh' }))
    await syncRetailCatalogue(SCOPE, get)
    expect(get.mock.calls.map((c) => c[1])).toEqual([{ since: 'stale' }, {}])
    expect(await getKept(SCOPE, 'retail-cursor')).toBe('fresh')
  })

  it('tells full lists from searches and later pages', () => {
    expect(isFullList('/products?limit=1000&offset=0')).toBe(true)
    expect(isFullList('/eatery/menu-items')).toBe(true)
    expect(isFullList('/products?limit=24&offset=24')).toBe(false)
    expect(isFullList('/products?q="mi"')).toBe(false)
  })

  it('drops a deleted restaurant with its whole menu', async () => {
    await setKept(SCOPE, 'eatery-cursor', 'c0')
    await saveRead(SCOPE, { url: '/eatery/restaurants/' }, { data: [{ id: 4 }, { id: 5 }] })
    await saveRead(
      SCOPE,
      { url: '/eatery/menu-items/' },
      {
        data: [
          { id: 1, restaurantId: 4 },
          { id: 2, restaurantId: 5 },
          { id: 3, restaurantId: 5 },
        ],
      }
    )
    await syncEateryMenu(
      SCOPE,
      vi.fn().mockResolvedValue({
        cursor: 'c1',
        restaurants: [],
        menuItems: [{ id: 2, restaurantId: 5, name: 'New' }],
        deleted: { restaurants: [4], menuItems: [3] },
      })
    )
    expect(listIn((await cachedRead(SCOPE, { url: '/eatery/restaurants/' }))!.body)).toEqual([{ id: 5 }])
    expect(listIn((await cachedRead(SCOPE, { url: '/eatery/menu-items/' }))!.body)).toEqual([{ id: 2, restaurantId: 5, name: 'New' }])
    expect(await getKept(SCOPE, 'eatery-cursor')).toBe('c1')
  })
})

describe('an eatery counter order kept offline', () => {
  it('is numbered by the till and sent with its clientId and the prices paid', async () => {
    const { createLocalSource } = await import('@/lib/eatery/data-source')
    const m = new Map<string, string>()
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    const now = () => new Date(2026, 9, 21, 13, 0)
    await createLocalSource(null, storage, now).directory()
    const owner = createLocalSource('acme', storage, now)
    const cafe = (await owner.claimDemo!()).find((r) => r.slug === 'kofi-and-crumb')!
    const items = await owner.list('items')
    const croissant = items.find((i) => i.restaurantId === cafe.id && i.name === 'Butter Croissant')!
    const menu = { restaurant: cafe, categories: await owner.list('categories'), items, promotions: await owner.list('promotions') }
    const input = {
      lines: [{ itemId: croissant.id, quantity: 2, choices: {} }],
      fulfilment: { type: 'pickup' as const },
      payment: { method: 'cash' as const, paid: true },
    }
    const body = offlineOrderBody(menu, { ...input, clientId: '6f1c2a9e-7a0b-4c55-9a43-3e2f7c1d8b10', receiptNo: 'AB12-0007', soldAt: now().toISOString() }, now()) as any
    const shown = offlineCounterOrder(menu, input, -5, now(), 'AB12-0007')
    expect(body).toMatchObject({
      restaurantId: cafe.id,
      receiptNo: 'AB12-0007',
      soldAt: now().toISOString(),
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(body.lines[0].unitPrice).toBe(shown.lines[0].unitPrice)
    expect(shown).toMatchObject({ code: 'AB12-0007', receiptNo: 'AB12-0007' })
  })
})

describe('cashier sign-in on bad internet', () => {
  it('only a 401 or 403 ends a cashier’s session', () => {
    expect(refreshOutcome(200, 'employee')).toBe('ok')
    expect(refreshOutcome(401, 'employee')).toBe('rejected')
    expect(refreshOutcome(403, 'employee')).toBe('rejected')
    expect(refreshOutcome(400, 'employee')).toBe('unreachable')
    expect(refreshOutcome(500, 'employee')).toBe('unreachable')
    expect(refreshOutcome(null, 'employee')).toBe('unreachable')
    // Owners are unchanged.
    expect(refreshOutcome(500)).toBe('rejected')
  })
})

describe('a slow connection never holds the till', () => {
  const ok = (config: InternalAxiosRequestConfig) => ({ data: { data: { id: 77 } }, status: 201, statusText: 'Created', headers: {}, config, request: {} })
  const charge = (adapter: AxiosAdapter) =>
    adapter({
      method: 'post',
      url: '/eatery/orders/counter',
      data: { clientId: 'cid-12345678', lines: [] },
      headers: {},
      _scope: SCOPE,
      offline: { safeToRepeat: true, waitMs: 40, result: () => ({ total: 9 }) },
    } as unknown as InternalAxiosRequestConfig)
  beforeEach(() => reportReachable(10))

  it('keeps the order after the deadline, then drops the kept copy when the server answers', async () => {
    let land!: () => void
    const base: AxiosAdapter = (config) => new Promise((resolve) => (land = () => resolve(ok(config))))
    const started = Date.now()
    const res = await charge(withOffline(base, async () => ({ data: {} })))
    expect(Date.now() - started).toBeLessThan(1000)
    expect(offlineKind(res)).toBe('queued')
    expect(await listOps(SCOPE)).toHaveLength(1)
    land()
    await new Promise((r) => setTimeout(r, 20))
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('answers straight away when the server is quick', async () => {
    const res = await charge(withOffline(async (config) => ok(config), async () => ({ data: {} })))
    expect(offlineKind(res)).toBeNull()
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('keeps it when the request fails without an answer, even if the browser thinks it’s online', async () => {
    const res = await charge(withOffline(async () => Promise.reject(netErr()), async () => ({ data: {} })))
    expect(offlineKind(res)).toBe('queued')
    expect((await listOps(SCOPE))[0].data).toMatchObject({ clientId: 'cid-12345678' })
  })
})
