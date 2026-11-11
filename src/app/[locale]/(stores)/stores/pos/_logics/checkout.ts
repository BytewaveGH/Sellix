// POST /sales — payload building and error classification.
//
// The server recomputes every price and total from the database and consumes
// stock as quantity × baseQuantity in one transaction, so the client never
// sends prices and only shows the server's numbers on the receipt.

import type { AxiosRequestConfig } from 'axios'
import { apiErrorMessage, apiStatus } from '@/lib/api-error'
import { isUnreachableError } from '@/lib/network'
import { SalesServices } from './services'
import type { CartItem, CustomerType } from './types'

export type SalePayload = {
  // Made by the till, kept when the same sale is sent again, so the server can
  // ignore a repeat instead of recording it twice (BACKEND_REQUIREMENTS §13.1).
  clientId?: string
  paymentType: 'cash' | 'momo'
  warehouseId: number
  employeeId?: number
  items: { productUnitId: number; quantity: number; pricingType: CustomerType }[]
}

export type SaleSessionUser = { accountType?: string; userId?: number } | null | undefined

// Interim contract: the server attributes a sale to an employee only via
// `employeeId` in the body (not from the token). Employees send their own id
// (data.employee.id from login, stored as session.user.userId); admins send
// nothing. This is the only place attribution is decided — if the backend
// starts reading it from the token, delete this and its use below.
export const saleAttribution = (user: SaleSessionUser): { employeeId?: number } =>
  user?.accountType === 'employee' && Number.isInteger(user.userId) && user.userId! > 0 ? { employeeId: user.userId } : {}

export const buildSalePayload = (
  cart: CartItem[],
  opts: { paymentType: 'cash' | 'momo'; warehouseId: number; customerType: CustomerType; user: SaleSessionUser; clientId?: string }
): SalePayload => ({
  ...(opts.clientId ? { clientId: opts.clientId } : {}),
  paymentType: opts.paymentType,
  warehouseId: opts.warehouseId,
  ...saleAttribution(opts.user),
  items: cart.map((i) => ({ productUnitId: Number(i.selectedUnit), quantity: i.quantity, pricingType: opts.customerType })),
})

export type ReceiptLine = {
  productUnitId: number
  productName: string
  unitName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export type SaleReceipt = {
  id?: number
  paymentType: string
  totalAmount: number
  items: ReceiptLine[]
  createdAt?: string
}

export type CheckoutFailure =
  // 409 — nothing recorded; keep the cart and highlight productId.
  | { ok: false; kind: 'stock'; message: string; productId?: string }
  // 422 — the cart itself is invalid; fix, don't retry.
  | { ok: false; kind: 'invalid'; message: string }
  // No answer (connection dropped, timed out): the sale may or may not be recorded.
  | { ok: false; kind: 'unconfirmed'; message: string }
  | { ok: false; kind: 'other'; message: string }

export type CheckoutResult = { ok: true; receipt: SaleReceipt } | CheckoutFailure

// "insufficient stock for product 12: have 20, need 27 base units"
export const parseInsufficientStock = (message: string) => {
  const m = /product\s+(\d+)(?:\D+have\s+(\d+)\D+need\s+(\d+))?/i.exec(message)
  return m ? { productId: m[1], have: m[2] ? Number(m[2]) : undefined, need: m[3] ? Number(m[3]) : undefined } : null
}

const toReceipt = (sale: any): SaleReceipt => ({
  id: sale?.id,
  paymentType: sale?.paymentType ?? '',
  totalAmount: Number(sale?.totalAmount ?? 0),
  createdAt: sale?.createdAt,
  items: (Array.isArray(sale?.items) ? sale.items : []).map((i: any) => ({
    productUnitId: Number(i.productUnitId),
    productName: i.productName ?? '',
    unitName: i.unitName ?? '',
    quantity: Number(i.quantity ?? 0),
    unitPrice: Number(i.unitPrice ?? 0),
    subtotal: Number(i.subtotal ?? 0),
  })),
})

export const classifyCheckoutError = (err: any): CheckoutFailure => {
  const status = apiStatus(err)
  if (!status || isUnreachableError(err))
    return { ok: false, kind: 'unconfirmed', message: 'The connection dropped before Sellix confirmed this sale.' }
  const message = apiErrorMessage(err, 'The sale could not be completed.')
  if (status === 409) {
    const parsed = parseInsufficientStock(message)
    return { ok: false, kind: 'stock', message: `Not enough stock — nothing was charged. ${message}`, productId: parsed?.productId }
  }
  if (status === 422) return { ok: false, kind: 'invalid', message: `Some items are invalid: ${message}` }
  return { ok: false, kind: 'other', message }
}

// Long enough for a slow connection; short enough that a cashier isn't left
// staring at "Processing…" when the connection has gone.
export const SALE_TIMEOUT_MS = 20_000

export const submitSale = async (request: (config: AxiosRequestConfig) => Promise<any>, payload: SalePayload): Promise<CheckoutResult> => {
  try {
    const res = await request({ ...(SalesServices.Create(payload) as AxiosRequestConfig), timeout: SALE_TIMEOUT_MS })
    const sale = res?.data?.data ?? res?.data
    // The server sent our id back: it knows to ignore repeats, so a retry is safe.
    if (payload.clientId && sale?.clientId === payload.clientId) rememberRetriesSafe()
    return { ok: true, receipt: toReceipt(sale) }
  } catch (err) {
    return classifyCheckoutError(err)
  }
}

// ── Sending the same sale again ──────────────────────────────────────────────
// After an unconfirmed attempt, charging the same cart again reuses its
// clientId: once the backend supports it (§13.1) the repeat is ignored rather
// than recorded twice. A changed cart is a new sale with a new id.

export type PendingSale = { clientId: string; signature: string }

export const newClientId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

// What makes two attempts "the same sale": payment, warehouse and items.
export const saleSignature = (p: Omit<SalePayload, 'clientId'>) =>
  JSON.stringify([
    p.paymentType,
    p.warehouseId,
    [...p.items].map((i) => [i.productUnitId, i.quantity, i.pricingType]).sort((a, b) => Number(a[0]) - Number(b[0])),
  ])

export const clientIdFor = (pending: PendingSale | null, signature: string) =>
  pending && pending.signature === signature ? pending.clientId : newClientId()

const RETRIES_SAFE_KEY = 'sellix-pos:retries-safe'

// Learnt from the server: true once it has echoed a clientId back.
export const retriesAreSafe = () => {
  try {
    return localStorage.getItem(RETRIES_SAFE_KEY) === '1'
  } catch {
    return false
  }
}

const rememberRetriesSafe = () => {
  try {
    localStorage.setItem(RETRIES_SAFE_KEY, '1')
  } catch {
    // Not remembered: the cautious message shows instead.
  }
}

// What to tell the cashier after an unconfirmed sale.
export const unconfirmedMessage = (safe: boolean) =>
  safe
    ? 'The connection dropped before Sellix confirmed this sale. Charge again to retry — it won’t be recorded twice.'
    : 'The connection dropped before Sellix confirmed this sale, so it may already be recorded. Check All orders before charging again.'
