// Orders for the store module: counter sales (GET /sales — paid on the spot,
// no customer) and invoices (GET /invoices — a named customer, paid or
// pending) shown as one list. Customers are worked out from invoices, the
// only records that carry a customer.

export type OrderKind = 'sale' | 'invoice'
export type OrderStatus = 'paid' | 'pending'

export interface OrderLine {
  productName: string
  unitName: string
  quantity: number
  unitPrice: number
  subtotal: number
  pricingType?: string
  // The till charged a price other than the catalogue's (offline sale, §13.1).
  priceMismatch?: boolean
  catalogPrice?: number
}

export interface Order {
  key: string
  kind: OrderKind
  id: number
  // "S-1042" for a counter sale, "INV-88" for an invoice.
  ref: string
  date: string
  customerName: string
  customerPhone: string
  paymentType: 'cash' | 'momo' | string
  status: OrderStatus
  paidAt?: string
  total: number
  lines: OrderLine[]
  cashier?: string
  warehouse?: string
  // Rung up offline: saved on the till, not yet recorded by the server.
  offline?: boolean
  // The number the till printed ("7D3F-0042"), before the server knew the sale.
  receiptNo?: string
  // Stock went below zero with this sale (sold offline from stock not on record).
  stockShort?: boolean
  // At least one item was charged at the till's price instead of the catalogue's.
  priceMismatch?: boolean
}

// A sale made offline has a temporary (negative) id until it's sent.
export const offlineRef = (id: number) => `OFF-${String(-id).slice(-6)}`

const num = (v: unknown) => Number(v ?? 0) || 0
const lines = (items: unknown): OrderLine[] =>
  (Array.isArray(items) ? items : []).map((i: any) => ({
    productName: i.productName ?? '',
    unitName: i.unitName ?? '',
    quantity: num(i.quantity),
    unitPrice: num(i.unitPrice),
    subtotal: num(i.subtotal),
    pricingType: i.pricingType,
    ...(i.priceMismatch ? { priceMismatch: true, catalogPrice: num(i.catalogPrice) } : {}),
  }))

export const saleToOrder = (s: any): Order => ({
  key: `sale-${s.id}`,
  kind: 'sale',
  id: s.id,
  ref: num(s.id) < 0 ? s.receiptNo || offlineRef(num(s.id)) : `S-${s.id}`,
  // When it was sold, which for a sale made offline is before it reached the server.
  date: s.soldAt ?? s.createdAt ?? '',
  customerName: '',
  customerPhone: '',
  paymentType: s.paymentType ?? '',
  status: 'paid',
  paidAt: s.soldAt ?? s.createdAt,
  total: num(s.totalAmount),
  lines: lines(s.items),
  cashier: s.employeeName || undefined,
  warehouse: s.warehouseName || undefined,
  ...(num(s.id) < 0 ? { offline: true } : {}),
  ...(s.receiptNo ? { receiptNo: String(s.receiptNo) } : {}),
  ...(s.stockShort ? { stockShort: true } : {}),
  ...(s.priceMismatch || (Array.isArray(s.items) && s.items.some((i: any) => i?.priceMismatch)) ? { priceMismatch: true } : {}),
})

export const invoiceToOrder = (i: any): Order => ({
  key: `invoice-${i.id}`,
  kind: 'invoice',
  id: i.id,
  ref: `INV-${i.id}`,
  // The invoice's own date (what the customer sees), else when it was created.
  date: i.date || i.createdAt || '',
  customerName: i.customerName ?? '',
  customerPhone: i.customerPhone ?? '',
  paymentType: i.paymentType ?? '',
  status: i.paymentStatus === 'paid' ? 'paid' : 'pending',
  paidAt: i.paidAt ?? undefined,
  total: num(i.totalAmount),
  lines: lines(i.items),
})

const time = (d: string) => {
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? 0 : t
}

export const mergeOrders = (sales: any[], invoices: any[]): Order[] =>
  [...sales.map(saleToOrder), ...invoices.map(invoiceToOrder)].sort((a, b) => time(b.date) - time(a.date) || b.id - a.id)

export type OrdersView = 'all' | 'pending' | 'completed'

// Sales for the owner to look at again (§13.4): stock that went below zero, or
// a till price that differed from the catalogue. Fetched with the server's own filter.
export type OrderReview = 'none' | 'stockShort' | 'priceMismatch'

export interface OrderFilters {
  view: OrdersView
  kind: 'all' | OrderKind
  payment: 'all' | 'cash' | 'momo'
  // Days back from today (0 = today only); null = any date.
  days: number | null
  q: string
}

export const DEFAULT_FILTERS: OrderFilters = { view: 'all', kind: 'all', payment: 'all', days: null, q: '' }

const startOfDay = (now: Date, daysBack: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack).getTime()

export const filterOrders = (orders: Order[], f: OrderFilters, now = new Date()) => {
  const q = f.q.trim().toLowerCase()
  const from = f.days === null ? null : startOfDay(now, f.days)
  const out = orders.filter((o) => {
    if (f.view === 'pending' && o.status !== 'pending') return false
    if (f.view === 'completed' && o.status !== 'paid') return false
    if (f.kind !== 'all' && o.kind !== f.kind) return false
    if (f.payment !== 'all' && o.paymentType !== f.payment) return false
    if (from !== null && time(o.date) < from) return false
    if (!q) return true
    return (
      o.ref.toLowerCase().includes(q) ||
      (o.receiptNo ?? '').toLowerCase().includes(q) ||
      String(o.id) === q ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerPhone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
      o.lines.some((l) => l.productName.toLowerCase().includes(q))
    )
  })
  // Unpaid invoices: oldest first, they're the ones to chase.
  return f.view === 'pending' ? out.reverse() : out
}

export const daysSince = (date: string, now = new Date()) =>
  Math.max(0, Math.floor((startOfDay(now, 0) - startOfDay(new Date(date), 0)) / 86_400_000))

export const orderTotals = (orders: Order[]) => ({
  count: orders.length,
  value: orders.reduce((s, o) => s + o.total, 0),
  outstanding: orders.filter((o) => o.status === 'pending').reduce((s, o) => s + o.total, 0),
  pendingCount: orders.filter((o) => o.status === 'pending').length,
})

// ── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  key: string
  name: string
  phone: string
  orders: Order[]
  totalSpent: number
  owes: number
  lastOrder: string
}

const phoneKey = (p: string) => p.replace(/\D/g, '').replace(/^233/, '0')

// One customer per phone number (or per name when there's no phone).
export const customersFrom = (orders: Order[]): Customer[] => {
  const map = new Map<string, Customer>()
  for (const o of orders) {
    if (o.kind !== 'invoice' || !o.customerName.trim()) continue
    const key = phoneKey(o.customerPhone) || `name:${o.customerName.trim().toLowerCase()}`
    const c = map.get(key) ?? {
      key,
      name: o.customerName.trim(),
      phone: o.customerPhone,
      orders: [],
      totalSpent: 0,
      owes: 0,
      lastOrder: o.date,
    }
    c.orders.push(o)
    if (o.status === 'paid') c.totalSpent += o.total
    else c.owes += o.total
    if (time(o.date) >= time(c.lastOrder)) {
      c.lastOrder = o.date
      // The latest spelling of their name wins.
      c.name = o.customerName.trim()
      if (o.customerPhone) c.phone = o.customerPhone
    }
    map.set(key, c)
  }
  return Array.from(map.values())
}

export type CustomerSort = 'recent' | 'spent' | 'owes' | 'name'

export const sortCustomers = (list: Customer[], by: CustomerSort) =>
  list
    .slice()
    .sort((a, b) =>
      by === 'spent'
        ? b.totalSpent - a.totalSpent
        : by === 'owes'
          ? b.owes - a.owes
          : by === 'name'
            ? a.name.localeCompare(b.name)
            : time(b.lastOrder) - time(a.lastOrder)
    )

export const money = (n: number) => `₵${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const formatDate = (d: string, withTime = false) => {
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}
