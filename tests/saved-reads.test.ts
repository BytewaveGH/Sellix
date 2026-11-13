// Once data has been loaded on a device, it's shown at once on a slow or dead
// connection and refreshed from the server in the background.
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { memoryStore, setOfflineStore } from '@/lib/offline/store'
import { cachedRead } from '@/lib/offline/engine'
import { offlineKind, subscribeReadUpdates, withOffline } from '@/lib/offline/adapter'
import { cannotKeepRead, cannotQueue } from '@/lib/offline/rules'
import { reportReachable } from '@/lib/connection'

const GRACE = 40
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A fake server: answers after `delay` ms with `version`.
const server = () => {
  const s = { delay: 0, version: 1, calls: 0 }
  const base: AxiosAdapter = (config) => {
    s.calls++
    const v = s.version
    return new Promise((resolve) =>
      setTimeout(() => resolve({ data: JSON.stringify({ data: [{ id: 1, v }] }), status: 200, statusText: 'OK', headers: {}, config, request: {} }), s.delay)
    )
  }
  return { s, adapter: withOffline(base, async () => ({ data: {} }), GRACE) }
}

let n = 0
beforeEach(() => {
  setOfflineStore(memoryStore())
  reportReachable(10)
  n++
})
const get = (adapter: AxiosAdapter, url: string, extra: Record<string, unknown> = {}) =>
  adapter({ method: 'get', url, headers: {}, _scope: `acme:${n}`, ...extra } as unknown as InternalAxiosRequestConfig)

describe('data loaded once is there next time', () => {
  it('waits for the server the first time only, then keeps the answer', async () => {
    const { s, adapter } = server()
    s.delay = 80
    const first = await get(adapter, '/eatery/orders/')
    expect(offlineKind(first)).toBeNull()
    await sleep(5)
    expect((await cachedRead(`acme:${n}`, { url: '/eatery/orders/' }))!.body).toEqual({ data: [{ id: 1, v: 1 }] })
  })

  it('on a good connection, gives the server’s fresh answer', async () => {
    const { s, adapter } = server()
    await get(adapter, '/products/')
    await sleep(5)
    s.version = 2
    const res = await get(adapter, '/products/')
    expect(offlineKind(res)).toBeNull()
    expect(JSON.parse(res.data)).toEqual({ data: [{ id: 1, v: 2 }] })
  })

  it('on a slow connection, shows the copy at once and swaps in the server’s answer when it comes', async () => {
    const { s, adapter } = server()
    await get(adapter, '/products/')
    await sleep(5)
    let updates = 0
    const stop = subscribeReadUpdates(() => updates++)
    s.delay = 150
    s.version = 2
    const started = Date.now()
    const res = await get(adapter, '/products/')
    expect(Date.now() - started).toBeLessThan(GRACE + 60)
    expect(offlineKind(res)).toBe('cached')
    expect(res.data).toEqual({ data: [{ id: 1, v: 1 }] })
    // The late answer replaces the copy and open screens are told to re-read.
    await sleep(500)
    expect((await cachedRead(`acme:${n}`, { url: '/products/' }))!.body).toEqual({ data: [{ id: 1, v: 2 }] })
    expect(updates).toBe(1)
    // Re-reading straight after uses the new copy without asking the server again.
    const calls = s.calls
    const again = await get(adapter, '/products/')
    expect(again.data).toEqual({ data: [{ id: 1, v: 2 }] })
    expect(s.calls).toBe(calls)
    stop()
  })

  it('doesn’t make screens re-read when nothing changed', async () => {
    const { s, adapter } = server()
    await get(adapter, '/warehouses/')
    await sleep(5)
    let updates = 0
    const stop = subscribeReadUpdates(() => updates++)
    s.delay = 120
    await get(adapter, '/warehouses/')
    await sleep(450)
    expect(updates).toBe(0)
    stop()
  })

  it('never keeps files, or sign-in and billing reads', async () => {
    const { s, adapter } = server()
    await get(adapter, '/real-estate/documents/4/file', { responseType: 'blob' })
    await get(adapter, '/real-estate/documents/4/file', { responseType: 'blob' })
    expect(s.calls).toBe(2)
    expect(await cachedRead(`acme:${n}`, { url: '/real-estate/documents/4/file' })).toBeUndefined()
    expect(cannotKeepRead({ url: '/auth/me' })).toBe(true)
    expect(cannotKeepRead({ url: '/products' })).toBe(false)
  })

  it('never fakes a share link offline', () => {
    expect(cannotQueue({ method: 'post', url: '/real-estate/documents/4/share-link' })).toMatch(/internet/)
  })
})
