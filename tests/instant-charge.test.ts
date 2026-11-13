// Charge never waits for the network: a counter order is kept on the till and
// sent in the background, online or not (EATERY_INSTANT_CHARGE follow-up).
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { memoryStore, setOfflineStore } from '@/lib/offline/store'
import { cachedRead, listOps, pendingRows, queueWrite, saveRead, syncOutbox, type SendRequest } from '@/lib/offline/engine'
import { offlineKind, withOffline } from '@/lib/offline/adapter'
import { listIn } from '@/lib/offline/rules'
import { reportReachable } from '@/lib/connection'

const SCOPE = 'acme:7'
const httpErr = (status: number) => Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data: {} } })
const ok = (config: InternalAxiosRequestConfig, data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} })

const order = (n: number) => ({
  method: 'post',
  url: '/eatery/orders/counter',
  data: { clientId: `client-${String(n).padStart(4, '0')}`, receiptNo: `AB12-${n}`, deviceId: 'till-1', lines: [{ itemId: 1, quantity: 1 }] },
})
const localFirst = { localFirst: true, safeToRepeat: true, appendTo: '/eatery/orders', result: (id: number) => ({ code: 'AB12', total: 22, id }) }

beforeEach(() => {
  setOfflineStore(memoryStore())
  reportReachable(10)
})

describe('Charge writes to the PC only', () => {
  it('answers at once even when the server would hang, and sends in the background', async () => {
    let sent = 0
    const hang: AxiosAdapter = () => new Promise(() => undefined)
    const send = async (req: SendRequest) => {
      sent++
      return { data: { data: { results: (req.data as { orders: { clientId: string }[] }).orders.map((o) => ({ clientId: o.clientId, status: 'created', id: 900 })) } } }
    }
    const adapter = withOffline(hang, send)
    const started = Date.now()
    const res = await adapter({ ...order(1), headers: {}, _scope: SCOPE, offline: localFirst } as unknown as InternalAxiosRequestConfig)
    expect(Date.now() - started).toBeLessThan(200)
    expect(offlineKind(res)).toBe('queued')
    expect(res.data.data).toMatchObject({ code: 'AB12', total: 22 })
    // The hanging live request was never made; the background send was.
    await new Promise((r) => setTimeout(r, 20))
    expect(sent).toBe(1)
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('shows unsent orders from the outbox, kept current, without touching the kept lists', async () => {
    await saveRead(SCOPE, { url: '/eatery/orders/' }, { data: [{ id: 1, status: 'accepted' }] })
    const { body } = await queueWrite(SCOPE, order(2), localFirst)
    const id = body.data!.id as number
    expect(listIn((await cachedRead(SCOPE, { url: '/eatery/orders/' }))!.body)).toEqual([{ id: 1, status: 'accepted' }])
    expect(await pendingRows(SCOPE, '/eatery/orders')).toMatchObject([{ id, code: 'AB12', syncState: 'syncing' }])
    // The kitchen moves it on before it's sent: the row shows it, and the change waits for it.
    await queueWrite(SCOPE, { method: 'put', url: `/eatery/orders/${id}`, data: { status: 'ready' } })
    expect(await pendingRows(SCOPE, '/eatery/orders')).toMatchObject([{ id, status: 'ready' }])
    // Deleting it before it's sent drops it, and the change to it, entirely.
    await queueWrite(SCOPE, { method: 'delete', url: `/eatery/orders/${id}` })
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('reports what was sent, with real ids, so screens swap them in place', async () => {
    await queueWrite(SCOPE, order(3), localFirst)
    const result = await syncOutbox(SCOPE, async () => ({ data: { data: { results: [{ clientId: 'client-0003', status: 'created', id: 4242 }] } } }))
    expect(result).toMatchObject({ sent: 1, paths: ['/eatery/orders'], made: [{ path: '/eatery/orders', row: { id: 4242, code: 'AB12' } }] })
  })
})

describe('the outbox after a long outage', () => {
  it('sends 50 offline orders in one batch, none twice', async () => {
    for (let i = 0; i < 50; i++) await queueWrite(SCOPE, order(i), localFirst)
    const seen: string[] = []
    const send = async (req: SendRequest) => {
      const orders = (req.data as { orders: { clientId: string }[] }).orders
      seen.push(...orders.map((o) => o.clientId))
      return { data: { data: { results: orders.map((o, i) => ({ clientId: o.clientId, status: 'created', id: 1000 + i })) } } }
    }
    expect(await syncOutbox(SCOPE, send)).toMatchObject({ sent: 50, failed: 0 })
    expect(new Set(seen).size).toBe(50)
    expect(seen).toHaveLength(50)
    expect(await listOps(SCOPE)).toEqual([])
  })

  it('keeps them pending through a 500 or a timeout, then sends them', async () => {
    for (let i = 0; i < 3; i++) await queueWrite(SCOPE, order(i), localFirst)
    for (const fail of [httpErr(500), Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED', request: {} })]) {
      expect(await syncOutbox(SCOPE, async () => Promise.reject(fail))).toMatchObject({ stopped: true })
      expect((await pendingRows(SCOPE, '/eatery/orders')).map((r) => r.syncState)).toEqual(['syncing', 'syncing', 'syncing'])
    }
    await syncOutbox(SCOPE, async (req) => ({
      data: { data: { results: (req.data as { orders: { clientId: string }[] }).orders.map((o) => ({ clientId: o.clientId, status: 'duplicate', id: 7 })) } },
    }))
    expect(await listOps(SCOPE)).toEqual([])
  })
})

describe('the counter screen doesn’t wait for the menu', () => {
  it('reads the menu from the PC without calling the server', async () => {
    await saveRead(SCOPE, { url: '/eatery/menu-items/' }, { data: [{ id: 1, name: 'Jollof' }] })
    let calls = 0
    const adapter = withOffline(async (config) => {
      calls++
      return ok(config, { data: [] })
    }, async () => ({ data: {} }))
    const res = await adapter({ method: 'get', url: '/eatery/menu-items/', headers: {}, _scope: SCOPE, offline: { cacheFirst: true } } as unknown as InternalAxiosRequestConfig)
    expect(res.data).toEqual({ data: [{ id: 1, name: 'Jollof' }] })
    expect(calls).toBe(0)
  })

  it('writes the server’s answer into the kept lists, so they never go stale', async () => {
    await saveRead(SCOPE, { url: '/eatery/menu-items/' }, { data: [{ id: 1, name: 'Jollof', price: 40 }] })
    const adapter = withOffline(async (config) => {
      const body = JSON.parse(String(config.data))
      return ok(config, JSON.stringify({ data: config.method === 'post' ? { ...body, id: 2 } : { ...body, id: 1 } }))
    }, async () => ({ data: {} }))
    const call = (method: string, url: string, data: unknown) =>
      adapter({ method, url, data: JSON.stringify(data), headers: {}, _scope: SCOPE } as unknown as InternalAxiosRequestConfig)
    await call('put', '/eatery/menu-items/1', { name: 'Jollof', price: 45 })
    await call('post', '/eatery/menu-items/', { name: 'Waakye', price: 30 })
    expect(listIn((await cachedRead(SCOPE, { url: '/eatery/menu-items/' }))!.body)).toEqual([
      { name: 'Waakye', price: 30, id: 2 },
      { id: 1, name: 'Jollof', price: 45 },
    ])
  })
})
