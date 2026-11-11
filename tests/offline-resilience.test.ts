import { vi } from 'vitest'

const getSession = vi.fn()
const signOut = vi.fn()
vi.mock('next-auth/react', () => ({ getSession: (...a: unknown[]) => getSession(...a), signOut: (...a: unknown[]) => signOut(...a) }))

import axios from 'axios'
import { isUnreachableError, refreshOutcome } from '@/lib/network'
import { forgetSession, installSessionFallback } from '@/lib/session-offline'
import { getConnection, reportReachable } from '@/lib/connection'
import {
  buildSalePayload,
  classifyCheckoutError,
  clientIdFor,
  retriesAreSafe,
  saleSignature,
  submitSale,
  unconfirmedMessage,
} from '@/app/[locale]/(stores)/stores/pos/_logics/checkout'

const axiosError = (over: Record<string, unknown>) => Object.assign(new Error('x'), { isAxiosError: true, ...over })

describe('telling “no answer” from “rejected”', () => {
  it('counts no response, timeouts and gateway errors as unreachable', () => {
    expect(isUnreachableError(axiosError({ code: 'ERR_NETWORK', request: {} }))).toBe(true)
    expect(isUnreachableError(axiosError({ code: 'ECONNABORTED', request: {} }))).toBe(true)
    expect(isUnreachableError(axiosError({ request: {} }))).toBe(true)
    expect(isUnreachableError(axiosError({ response: { status: 503 } }))).toBe(true)
    expect(isUnreachableError(Object.assign(new TypeError('Failed to fetch')))).toBe(true)
  })
  it('never treats a real answer, a cancel or a plain error as unreachable', () => {
    expect(isUnreachableError(axiosError({ response: { status: 401 } }))).toBe(false)
    expect(isUnreachableError(axiosError({ response: { status: 500 } }))).toBe(false)
    expect(isUnreachableError(axiosError({ code: 'ERR_CANCELED', request: {} }))).toBe(false)
    expect(isUnreachableError(new Error('no refresh token'))).toBe(false)
    expect(isUnreachableError(null)).toBe(false)
  })
  it('only ends a session on a real refusal from the refresh endpoint', () => {
    expect(refreshOutcome(200)).toBe('ok')
    expect(refreshOutcome(null)).toBe('unreachable')
    expect(refreshOutcome(504)).toBe('unreachable')
    expect(refreshOutcome(401)).toBe('rejected')
    // The account service answers a bad refresh token with 500 (§13.5 asks for 401).
    expect(refreshOutcome(500)).toBe('rejected')
  })
})

describe('the session survives a dropped connection', () => {
  const SESSION = { user: { username: 'Ama', accessToken: 'a1' }, expires: '2099-01-01' }
  let answer: () => Promise<Response>
  beforeAll(() => {
    window.fetch = vi.fn((input: RequestInfo | URL) =>
      String(input).includes('/api/auth/session') ? answer() : Promise.resolve(new Response('other'))
    ) as typeof fetch
    installSessionFallback()
  })
  beforeEach(() => forgetSession())

  it('answers the last good session when the check can’t reach the server', async () => {
    answer = () => Promise.resolve(new Response(JSON.stringify(SESSION), { status: 200 }))
    expect(await (await fetch('/api/auth/session')).json()).toEqual(SESSION)
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    const offline = await fetch('/api/auth/session')
    expect(offline.headers.get('X-Sellix-Offline')).toBe('1')
    expect(await offline.json()).toEqual(SESSION)
    answer = () => Promise.resolve(new Response('bad gateway', { status: 502 }))
    expect(await (await fetch('/api/auth/session')).json()).toEqual(SESSION)
  })

  it('forgets it once the server says signed out, and leaves other requests alone', async () => {
    answer = () => Promise.resolve(new Response(JSON.stringify(SESSION), { status: 200 }))
    await fetch('/api/auth/session')
    answer = () => Promise.resolve(new Response('null', { status: 200 }))
    await fetch('/api/auth/session')
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    await expect(fetch('/api/auth/session')).rejects.toThrow('Failed to fetch')
    expect(await (await fetch('/api/products')).text()).toBe('other')
  })

  it('never invents a session that was never there', async () => {
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    await expect(fetch('/api/auth/session')).rejects.toThrow()
  })
})

describe('token refresh on a bad connection', () => {
  // The API client with a fake transport: the first call is a 401, then whatever `next` returns.
  const setup = async () => {
    vi.resetModules()
    const forceLogout = vi.fn()
    vi.doMock('@/lib/force-logout', () => ({ forceLogout }))
    const { apiClient } = await import('@/lib/axios-client')
    getSession.mockResolvedValue({ user: { accessToken: 'old', refreshToken: 'r1', tenant: 'acme' } })
    let calls = 0
    apiClient.defaults.adapter = async (config) => {
      calls++
      if (calls === 1) throw Object.assign(new Error('401'), { isAxiosError: true, config, response: { status: 401, data: {} } })
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    }
    return { apiClient, forceLogout }
  }
  afterEach(() => vi.restoreAllMocks())

  it('keeps the user signed in when the refresh can’t reach the server', async () => {
    const { apiClient, forceLogout } = await setup()
    vi.spyOn(axios, 'post').mockRejectedValue(axiosError({ code: 'ERR_NETWORK', request: {} }))
    await expect(apiClient.get('/products')).rejects.toMatchObject({ code: 'ERR_NETWORK' })
    expect(forceLogout).not.toHaveBeenCalled()
  })

  it('logs out when the server refuses the refresh', async () => {
    const { apiClient, forceLogout } = await setup()
    vi.spyOn(axios, 'post').mockRejectedValue(axiosError({ response: { status: 500, data: { message: 'token expired' } } }))
    await expect(apiClient.get('/products')).rejects.toBeTruthy()
    expect(forceLogout).toHaveBeenCalledWith('expired')
  })

  it('retries the request with the new token after a good refresh', async () => {
    const { apiClient, forceLogout } = await setup()
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { accessToken: 'new' } } })
    await expect(apiClient.get('/products')).resolves.toMatchObject({ data: { ok: true } })
    expect(forceLogout).not.toHaveBeenCalled()
  })
})

describe('connection status', () => {
  it('turns slow on slow answers and back to online on quick ones', () => {
    reportReachable(6000)
    expect(getConnection().status).toBe('slow')
    reportReachable(300)
    expect(getConnection().status).toBe('online')
  })
})

describe('sending a sale again safely', () => {
  const cart = [
    { selectedUnit: '21', quantity: 2 },
    { selectedUnit: '7', quantity: 1 },
  ] as any
  const base = buildSalePayload(cart, { paymentType: 'cash', warehouseId: 1, customerType: 'retail', user: null })
  beforeEach(() => localStorage.clear())

  it('reuses the id for the same cart, and makes a new one when anything changes', () => {
    const sig = saleSignature(base)
    const pending = { clientId: 'abc', signature: sig }
    expect(clientIdFor(pending, sig)).toBe('abc')
    // Item order doesn't matter; payment type does.
    expect(clientIdFor(pending, saleSignature({ ...base, items: [...base.items].reverse() }))).toBe('abc')
    expect(clientIdFor(pending, saleSignature({ ...base, paymentType: 'momo' }))).not.toBe('abc')
    expect(clientIdFor(null, sig)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reports a dropped connection as unconfirmed, not “not recorded”', () => {
    expect(classifyCheckoutError(axiosError({ code: 'ECONNABORTED', request: {} }))).toMatchObject({ kind: 'unconfirmed' })
    expect(classifyCheckoutError(axiosError({ response: { status: 503 } }))).toMatchObject({ kind: 'unconfirmed' })
  })

  it('sends the id with a time limit, and learns retries are safe when the server echoes it', async () => {
    const request = vi.fn().mockResolvedValue({ data: { data: { id: 9, clientId: 'abc', totalAmount: 10, items: [] } } })
    expect(retriesAreSafe()).toBe(false)
    await submitSale(request, { ...base, clientId: 'abc' })
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'POST', timeout: 20_000, data: { clientId: 'abc' } })
    expect(retriesAreSafe()).toBe(true)
    expect(unconfirmedMessage(true)).toMatch(/won’t be recorded twice/)
    expect(unconfirmedMessage(false)).toMatch(/Check All orders/)
  })

  it('stays cautious while the server ignores the id', async () => {
    const request = vi.fn().mockResolvedValue({ data: { data: { id: 9, totalAmount: 10, items: [] } } })
    await submitSale(request, { ...base, clientId: 'abc' })
    expect(retriesAreSafe()).toBe(false)
  })
})
