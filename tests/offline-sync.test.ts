import { vi } from 'vitest'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { memoryStore, setOfflineStore } from '@/lib/offline/store'
import {
  cannotQueue,
  listIn,
  pathOf,
  readKey,
  replaceId,
  tempIdsIn,
  withList,
  writeShape,
} from '@/lib/offline/rules'
import { cachedRead, listOps, discardOp, retryOp, syncOutbox, type Op } from '@/lib/offline/engine'
import { offlineKind, withOffline } from '@/lib/offline/adapter'
import { withoutTokens } from '@/lib/session-offline'
import { reportReachable } from '@/lib/connection'
import { deductSoldStock } from '@/app/[locale]/(stores)/stores/pos/_logics/checkout'
import { saleToOrder } from '@/lib/store/orders'

const SCOPE = 'acme:1'
const netErr = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK', request: {} })
const httpErr = (status: number, error: string) => Object.assign(new Error(error), { isAxiosError: true, response: { status, data: { error } } })

const setOnline = (on: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(on)

describe('what a request means offline', () => {
  it('keys reads by path and query, whatever the base address or slashes', () => {
    expect(pathOf({ url: 'https://api.x/v1/products/', baseURL: 'https://api.x/v1' })).toBe('/products')
    expect(readKey({ url: '/products/', params: { offset: 0, limit: 1000 } })).toBe('/products?limit=1000&offset=0')
    expect(readKey({ url: '/products?limit=5' })).toBe(readKey({ url: '/products/', params: { limit: '5' } }))
  })

  it('tells creates, edits and deletes apart', () => {
    expect(writeShape({ method: 'post', url: '/eatery/orders/' })).toEqual({ kind: 'create', collection: '/eatery/orders' })
    expect(writeShape({ method: 'put', url: '/eatery/orders/12' })).toEqual({ kind: 'update', collection: '/eatery/orders', id: 12 })
    expect(writeShape({ method: 'delete', url: '/products/-500' })).toEqual({ kind: 'delete', collection: '/products', id: -500 })
    expect(writeShape({ method: 'post', url: '/sales/12' })).toEqual({ kind: 'action' })
  })

  it('never keeps sign-in, billing or uploads for later', () => {
    expect(cannotQueue({ method: 'post', url: '/auth/login' })).toMatch(/internet/)
    expect(cannotQueue({ method: 'post', url: '/eatery/uploads' })).toMatch(/upload/)
    expect(cannotQueue({ method: 'post', url: '/x', data: new FormData() })).toMatch(/upload/)
    expect(cannotQueue({ method: 'post', url: '/sales/' })).toBeNull()
  })

  it('finds and swaps temporary ids in the path and body', () => {
    const r = { url: '/eatery/orders/-700', data: { orderId: -700, lines: [{ itemId: 3 }] } }
    expect(tempIdsIn(r)).toEqual([-700])
    expect(replaceId(r, -700, 42)).toEqual({ url: '/eatery/orders/42', data: { orderId: 42, lines: [{ itemId: 3 }] } })
  })

  it('reads and replaces lists in every answer shape, keeping counts right', () => {
    expect(listIn({ data: { data: [{ id: 1 }], count: 1 } })).toEqual([{ id: 1 }])
    expect(withList({ data: { data: [{ id: 1 }], count: 1 } }, [{ id: 1 }, { id: 2 }])).toEqual({ data: { data: [{ id: 1 }, { id: 2 }], count: 2 } })
    expect(withList({ data: [{ id: 1 }] }, [])).toEqual({ data: [] })
  })
})

describe('working offline through the API client', () => {
  let server: { orders: Record<string, unknown>[]; nextId: number; down: boolean; refuse?: string }
  let sent: string[]
  const base: AxiosAdapter = async (config) => {
    if (server.down) throw netErr()
    const method = (config.method ?? 'get').toUpperCase()
    const path = pathOf(config)
    sent.push(`${method} ${path}`)
    const body = () => (typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data ?? {}))
    const ok = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} })
    if (server.refuse && path.includes(server.refuse)) throw httpErr(409, 'Not enough stock')
    // Like the real thing: the adapter gets the server's text, not parsed JSON.
    if (method === 'GET' && path === '/eatery/orders') return ok(JSON.stringify({ data: server.orders }))
    if (method === 'POST') {
      const row = { ...body(), id: server.nextId++ }
      server.orders.push(row)
      return ok({ data: row })
    }
    if (method === 'PUT') {
      const id = Number(path.split('/').pop())
      const row = server.orders.find((o) => o.id === id)
      if (!row) throw httpErr(404, 'not found')
      Object.assign(row, body())
      return ok({ data: row })
    }
    return ok({ data: null })
  }
  // What sendQueued does, against the fake server.
  const send = (op: Op) =>
    base({ method: op.method, url: op.url, params: op.params, data: JSON.stringify(op.data ?? {}), headers: {} } as InternalAxiosRequestConfig)
  const adapter = withOffline(base, send)
  const call = (method: string, url: string, data?: unknown, extra: Record<string, unknown> = {}) =>
    adapter({ method, url, data, headers: {}, _scope: SCOPE, ...extra } as unknown as InternalAxiosRequestConfig)

  beforeEach(() => {
    setOfflineStore(memoryStore())
    server = { orders: [{ id: 1, status: 'accepted' }], nextId: 2, down: false }
    sent = []
    setOnline(true)
    reportReachable(10)
  })
  afterEach(() => vi.restoreAllMocks())

  it('answers reads from the device when the server can’t be reached', async () => {
    await call('get', '/eatery/orders/')
    await new Promise((r) => setTimeout(r))
    server.down = true
    const res = await call('get', '/eatery/orders/')
    expect(offlineKind(res)).toBe('cached')
    expect(res.data).toEqual({ data: [{ id: 1, status: 'accepted' }] })
    // Kept parsed, so offline changes can be laid on it.
    expect((await cachedRead(SCOPE, { url: '/eatery/orders' }))!.body).toEqual({ data: [{ id: 1, status: 'accepted' }] })
    // Nothing kept for this one: the failure goes through.
    await expect(call('get', '/eatery/recipes/')).rejects.toMatchObject({ code: 'ERR_NETWORK' })
  })

  it('keeps new rows and edits offline, shows them, then sends them in order with real ids', async () => {
    await call('get', '/eatery/orders/')
    await new Promise((r) => setTimeout(r))
    server.down = true
    setOnline(false)

    const created = await call('post', '/eatery/orders/counter', { table: '4' }, { offline: { appendTo: '/eatery/orders', result: () => ({ total: 50 }) } })
    expect(offlineKind(created)).toBe('queued')
    const tempId = created.data.data.id as number
    expect(tempId).toBeLessThan(0)
    await call('put', `/eatery/orders/${tempId}`, { status: 'ready' })
    await call('put', '/eatery/orders/1', { status: 'completed' })

    // The kept list shows all three changes.
    const shown = (await cachedRead(SCOPE, { url: '/eatery/orders/' }))!.body
    expect(listIn(shown)).toEqual([
      { table: '4', total: 50, id: tempId, status: 'ready' },
      { id: 1, status: 'completed' },
    ])
    expect((await listOps(SCOPE)).map((o) => o.status)).toEqual(['waiting', 'waiting', 'waiting'])

    server.down = false
    setOnline(true)
    sent = []
    const result = await syncOutbox(SCOPE, send)
    expect(result).toMatchObject({ sent: 3, failed: 0, stopped: false, paths: ['/eatery/orders'] })
    expect(sent).toEqual(['POST /eatery/orders/counter', 'PUT /eatery/orders/2', 'PUT /eatery/orders/1'])
    expect(server.orders).toEqual([
      { id: 1, status: 'completed' },
      { table: '4', id: 2, status: 'ready' },
    ])
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('marks a refused change, holds back what depends on it, and lets it be discarded', async () => {
    setOnline(false)
    server.down = true
    const a = await call('post', '/sales/', { total: 10 })
    await call('put', `/sales/${a.data.data.id}`, { note: 'x' })
    await call('post', '/eatery/orders/', { table: '1' })
    server.down = false
    server.refuse = '/sales'
    setOnline(true)
    const result = await syncOutbox(SCOPE, send)
    expect(result).toMatchObject({ sent: 1, failed: 1 })
    const ops = await listOps(SCOPE)
    expect(ops.map((o) => [o.label, o.status])).toEqual([
      ['New sale', 'failed'],
      ['Change to sale #' + a.data.data.id, 'waiting'],
    ])
    expect(ops[0].error).toBe('Not enough stock')
    // Discarding the sale takes the change to it along.
    await discardOp(SCOPE, ops[0].id)
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('asks a person when a new sale may have arrived without an answer', async () => {
    setOnline(false)
    await call('post', '/sales/', { total: 10 })
    setOnline(true)
    server.down = true // the request leaves, the answer never comes
    expect(await syncOutbox(SCOPE, send)).toMatchObject({ stopped: true })
    const [op] = await listOps(SCOPE)
    expect(op.status).toBe('check')
    // Not sent again on its own…
    server.down = false
    await syncOutbox(SCOPE, send)
    expect(sent).toEqual([])
    // …only once someone says it wasn't recorded.
    await retryOp(SCOPE, op.id)
    await syncOutbox(SCOPE, send)
    expect(sent).toEqual(['POST /sales'])
  })

  it('sends what is waiting first when back online, and keeps order for rows made offline', async () => {
    setOnline(false)
    const a = await call('post', '/eatery/orders/', { table: '2' })
    setOnline(true)
    await call('put', '/eatery/orders/1', { status: 'ready' })
    expect(sent).toEqual(['POST /eatery/orders', 'PUT /eatery/orders/1'])
    // A change to a row that only exists on the device waits for it.
    expect(a.data.data.id).toBeLessThan(0)
  })

  it('fails at once for what can’t wait, instead of pretending', async () => {
    setOnline(false)
    await expect(call('post', '/eatery/uploads', {})).rejects.toMatchObject({ code: 'ERR_NETWORK', message: /upload/ })
    await expect(call('post', '/auth/login', {})).rejects.toMatchObject({ code: 'ERR_NETWORK' })
  })

  it('keeps a write made the moment the browser knew it had no network', async () => {
    server.down = true
    setOnline(false)
    // Status store still says online; the browser says offline.
    const res = await call('post', '/eatery/orders/', { table: '9' })
    expect(offlineKind(res)).toBe('queued')
  })

  it('needs no scope to work normally (public pages, signed out)', async () => {
    const res = await adapter({ method: 'get', url: '/eatery/orders/', headers: {} } as InternalAxiosRequestConfig)
    expect(offlineKind(res)).toBeNull()
  })
})

describe('the till offline', () => {
  it('takes a sale’s stock out of the kept product list', () => {
    const body = {
      data: {
        data: [
          { id: 11, totalQuantity: 60, units: [{ id: 101, baseQuantity: 1 }, { id: 102, baseQuantity: 12 }], stock: [{ warehouseId: 1, quantity: 60 }, { warehouseId: 2, quantity: 5 }] },
          { id: 12, totalQuantity: 3, units: [{ id: 201, baseQuantity: 1 }] },
        ],
        count: 2,
      },
    }
    const next = deductSoldStock(body, {
      warehouseId: 1,
      items: [
        { productUnitId: 101, quantity: 2, pricingType: 'retail' },
        { productUnitId: 102, quantity: 1, pricingType: 'retail' },
      ],
    }) as typeof body
    expect(next.data.data[0]).toMatchObject({ totalQuantity: 46, stock: [{ warehouseId: 1, quantity: 46 }, { warehouseId: 2, quantity: 5 }] })
    expect(next.data.data[1].totalQuantity).toBe(3)
  })

  it('labels a sale made offline on the receipt and orders list', () => {
    const order = saleToOrder({ id: -171234500, paymentType: 'cash', totalAmount: 48, items: [] })
    expect(order.ref).toBe('OFF-234500')
    expect(order.offline).toBe(true)
    expect(saleToOrder({ id: 7 }).offline).toBeUndefined()
  })
})

describe('signed in after a restart with no internet', () => {
  it('keeps the session on the device without anything that grants access', () => {
    const kept = withoutTokens({
      user: { username: 'Ama', tenant: 'acme', accessToken: 'a', refreshToken: 'r', accessTokenExpiry: 5, canManageSales: true },
      expires: '2099',
    })
    expect(kept).toEqual({ user: { username: 'Ama', tenant: 'acme', accessTokenExpiry: 5, canManageSales: true }, expires: '2099' })
  })
})

describe('the eatery till offline', () => {
  it('prices a counter order from the menu on the device exactly as the eatery does', async () => {
    const { createLocalSource } = await import('@/lib/eatery/data-source')
    const { offlineCounterOrder } = await import('@/lib/eatery/offline-order')
    const m = new Map<string, string>()
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    const now = () => new Date(2026, 9, 21, 13, 0)
    await createLocalSource(null, storage, now).directory()
    const owner = createLocalSource('acme', storage, now)
    const cafe = (await owner.claimDemo!()).find((r) => r.slug === 'kofi-and-crumb')!
    const items = await owner.list('items')
    const croissant = items.find((i) => i.restaurantId === cafe.id && i.name === 'Butter Croissant')!
    const input = {
      lines: [{ itemId: croissant.id, quantity: 3, choices: {} }],
      fulfilment: { type: 'dine-in' as const, table: '4' },
      payment: { method: 'cash' as const, paid: true, tendered: 50 },
    }
    const offline = offlineCounterOrder(
      { restaurant: cafe, categories: await owner.list('categories'), items, promotions: await owner.list('promotions') },
      input,
      -900,
      now()
    )
    const real = await owner.createCounterOrder(cafe.id, input)
    expect(offline).toMatchObject({
      id: -900,
      status: 'accepted',
      channel: 'counter',
      total: real.total,
      subtotal: real.subtotal,
      fulfilment: { type: 'dine-in', table: '4' },
      payment: { status: 'paid' },
    })
    expect(offline.lines.map((l) => [l.name, l.quantity, l.lineTotal])).toEqual(real.lines.map((l) => [l.name, l.quantity, l.lineTotal]))
  })
})

describe('a poor connection', () => {
  it('shows the saved copy when a read is slow, and keeps the late answer for next time', async () => {
    setOfflineStore(memoryStore())
    reportReachable(10)
    let delay = 0
    let version = 1
    const base: AxiosAdapter = (config) =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: { data: [{ id: 1, v: version }] }, status: 200, statusText: 'OK', headers: {}, config, request: {} }), delay)
      )
    const adapter = withOffline(base, async () => ({ data: {} }), 50)
    const get = () => adapter({ method: 'get', url: '/products/', headers: {}, _scope: SCOPE } as unknown as InternalAxiosRequestConfig)
    await get()
    await new Promise((r) => setTimeout(r, 10))
    delay = 200
    version = 2
    const slow = await get()
    expect(offlineKind(slow)).toBe('cached')
    expect(slow.data).toEqual({ data: [{ id: 1, v: 1 }] })
    await new Promise((r) => setTimeout(r, 300))
    expect((await cachedRead(SCOPE, { url: '/products/' }))!.body).toEqual({ data: [{ id: 1, v: 2 }] })
  })
})
