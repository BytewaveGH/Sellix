// POST /sales — payload building and error classification.
//
// The server recomputes every price and total from the database and consumes
// stock as quantity × baseQuantity in one transaction, so the client never
// sends prices and only shows the server's numbers on the receipt.

import type { AxiosRequestConfig } from 'axios'
import { apiErrorMessage, apiStatus } from '@/lib/api-error'
import { isUnreachableError } from '@/lib/network'
import { offlineKind, type OfflineConfig } from '@/lib/offline/adapter'
import { listIn, refusalMessage, withList } from '@/lib/offline/rules'
import { newClientId, tillFields } from '@/lib/till'
import { SalesServices } from './services'
import type { CartItem, CustomerType } from './types'

export type SalePayload = {
  // Made by the till, kept when the same sale is sent again, so the server can
  // ignore a repeat instead of recording it twice (BACKEND_REQUIREMENTS §13.1).
  clientId?: string
  // Printed on the receipt before the server has seen the sale (§13.1).
  receiptNo?: string
  deviceId?: string
  // When the sale happened; it may reach the server much later.
  soldAt?: string
  paymentType: 'cash' | 'momo'
  warehouseId: number
  employeeId?: number
  // `unitPrice`: what the customer paid. Only sent for sales kept offline — a
  // live sale is charged the catalogue price.
  items: { productUnitId: number; quantity: number; pricingType: CustomerType; unitPrice?: number }[]
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
  opts: {
    paymentType: 'cash' | 'momo'
    warehouseId: number
    customerType: CustomerType
    user: SaleSessionUser
    clientId?: string
    receiptNo?: string
    at?: Date
  }
): SalePayload => ({
  ...(opts.clientId ? { clientId: opts.clientId } : {}),
  ...(opts.receiptNo ? tillFields(opts.receiptNo, opts.at) : {}),
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
  receiptNo?: string
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

// `offline`: saved on this till and sent when the connection is back.
export type CheckoutResult = { ok: true; receipt: SaleReceipt; offline?: boolean } | CheckoutFailure

// "insufficient stock for product 12: have 20, need 27 base units"
export const parseInsufficientStock = (message: string) => {
  const m = /product\s+(\d+)(?:\D+have\s+(\d+)\D+need\s+(\d+))?/i.exec(message)
  return m ? { productId: m[1], have: m[2] ? Number(m[2]) : undefined, need: m[3] ? Number(m[3]) : undefined } : null
}

const toReceipt = (sale: any): SaleReceipt => ({
  id: sale?.id,
  receiptNo: sale?.receiptNo ?? undefined,
  paymentType: sale?.paymentType ?? '',
  totalAmount: Number(sale?.totalAmount ?? 0),
  createdAt: sale?.soldAt ?? sale?.createdAt,
  items: (Array.isArray(sale?.items) ? sale.items : []).map((i: any) => ({
    productUnitId: Number(i.productUnitId),
    productName: i.productName ?? '',
    unitName: i.unitName ?? '',
    quantity: Number(i.quantity ?? 0),
    unitPrice: Number(i.unitPrice ?? 0),
    subtotal: Number(i.subtotal ?? 0),
  })),
})

// `names`: product unit id → name on the till, for "no longer exists" refusals.
export const classifyCheckoutError = (err: any, names: Record<string, string> = {}): CheckoutFailure => {
  const status = apiStatus(err)
  if (!status || isUnreachableError(err))
    return { ok: false, kind: 'unconfirmed', message: 'The connection dropped before Sellix confirmed this sale.' }
  const message = refusalMessage(err?.response?.data?.code, apiErrorMessage(err, 'The sale could not be completed.'), names)
  if (status === 409) {
    const parsed = parseInsufficientStock(message)
    return { ok: false, kind: 'stock', message: `Not enough stock — nothing was charged. ${message}`, productId: parsed?.productId }
  }
  if (status === 422) return { ok: false, kind: 'invalid', message: err?.response?.data?.code ? message : `Some items are invalid: ${message}` }
  return { ok: false, kind: 'other', message }
}

// Long enough for a slow connection; short enough that a cashier isn't left
// staring at "Processing…" when the connection has gone.
export const SALE_TIMEOUT_MS = 20_000
// How long the cashier waits for the server before the sale is kept on the
// till instead (it carries a clientId, so it's never recorded twice).
export const SALE_WAIT_MS = 3000

// Offline, the sale is kept on the till (lib/offline) and shown with the
// till's own prices, which are sent with it: the customer already paid them.
export type OfflineSale = {
  // The receipt as the till worked it out, one item per payload item.
  preview: SaleReceipt
}

const unitNames = (preview: SaleReceipt) =>
  Object.fromEntries(preview.items.map((i) => [String(i.productUnitId), `${i.productName}${i.unitName ? ` (${i.unitName})` : ''}`]))

export const submitSale = async (
  request: (config: AxiosRequestConfig) => Promise<any>,
  payload: SalePayload,
  offline?: OfflineSale
): Promise<CheckoutResult> => {
  const names = offline ? unitNames(offline.preview) : {}
  const config: AxiosRequestConfig & OfflineConfig = {
    ...(SalesServices.Create(payload) as AxiosRequestConfig),
    timeout: SALE_TIMEOUT_MS,
    offline: offline
      ? {
          label: `Sale ${payload.receiptNo ?? ''} · ₵${offline.preview.totalAmount.toFixed(2)} · ${offline.preview.paymentType}`.replace('  ', ' '),
          result: () => ({ ...offline.preview, receiptNo: payload.receiptNo, createdAt: offline.preview.createdAt ?? new Date().toISOString() }),
          // The server recognises the clientId and never records it twice.
          safeToRepeat: !!payload.clientId,
          // Slow connection: after this long the sale is kept on the till and
          // the cashier moves on; it's recorded once the server answers.
          waitMs: payload.clientId ? SALE_WAIT_MS : undefined,
          body: () => ({
            ...payload,
            items: payload.items.map((it, i) => ({ ...it, unitPrice: Math.round((offline.preview.items[i]?.unitPrice ?? 0) * 100) / 100 })),
          }),
          names,
          adjust: (_key, body) => deductSoldStock(body, payload),
          adjusts: (key) => /^\/products(\?|$)/.test(key),
        }
      : undefined,
  }
  try {
    const res = await request(config)
    const sale = res?.data?.data ?? res?.data
    if (offlineKind(res) === 'queued') return { ok: true, offline: true, receipt: toReceipt(sale) }
    // The server sent our id back: it knows to ignore repeats, so a retry is safe.
    if (payload.clientId && sale?.clientId === payload.clientId) rememberRetriesSafe()
    return { ok: true, receipt: toReceipt(sale) }
  } catch (err) {
    return classifyCheckoutError(err, names)
  }
}

// The kept product list with a sale's stock taken out, so the till's stock
// warnings stay right while offline. Stock is in base units (quantity × baseQuantity).
export const deductSoldStock = (body: unknown, sale: Pick<SalePayload, 'warehouseId' | 'items'>): unknown => {
  const products = listIn(body)
  if (!products) return undefined
  const sold = new Map<string, number>()
  for (const p of products as any[]) {
    for (const u of Array.isArray(p?.units) ? p.units : []) {
      const line = sale.items.find((i) => i.productUnitId === Number(u.id))
      if (line) sold.set(String(p.id), (sold.get(String(p.id)) ?? 0) + line.quantity * (Number(u.baseQuantity) || 1))
    }
  }
  if (sold.size === 0) return undefined
  return withList(
    body,
    (products as any[]).map((p) => {
      const n = sold.get(String(p.id))
      if (!n) return p
      return {
        ...p,
        ...(typeof p.totalQuantity === 'number' ? { totalQuantity: p.totalQuantity - n } : {}),
        ...(Array.isArray(p.stock)
          ? { stock: p.stock.map((s: any) => (Number(s.warehouseId) === sale.warehouseId ? { ...s, quantity: Number(s.quantity) - n } : s)) }
          : {}),
      }
    })
  )
}

// ── Sending the same sale again ──────────────────────────────────────────────
// After an unconfirmed attempt, charging the same cart again reuses its
// clientId: once the backend supports it (§13.1) the repeat is ignored rather
// than recorded twice. A changed cart is a new sale with a new id.

export type PendingSale = { clientId: string; receiptNo: string; signature: string }

export { newClientId }

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
