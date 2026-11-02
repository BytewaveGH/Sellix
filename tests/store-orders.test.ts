import { describe, expect, it } from 'vitest'
import {
  customersFrom,
  DEFAULT_FILTERS,
  daysSince,
  filterOrders,
  invoiceToOrder,
  mergeOrders,
  orderTotals,
  sortCustomers,
} from '@/lib/store/orders'
import { DEFAULT_STORE_SETTINGS, settingsProblems, withDefaults } from '@/lib/store/settings'
import { receiptHtml } from '@/lib/store/receipt'

const now = new Date(2026, 10, 2, 15, 0)
const sale = (id: number, at: string, total: number, paymentType = 'cash', product = 'Milo') => ({
  id,
  paymentType,
  totalAmount: total,
  createdAt: at,
  employeeName: 'Ama',
  items: [{ productName: product, unitName: 'Tin', quantity: 1, unitPrice: total, subtotal: total }],
})
const invoice = (id: number, date: string, total: number, status: 'paid' | 'pending', name: string, phone = '') => ({
  id,
  customerName: name,
  customerPhone: phone,
  date,
  paymentType: 'momo',
  paymentStatus: status,
  totalAmount: total,
  items: [{ productName: 'Rice 5kg', unitName: 'Bag', quantity: 1, unitPrice: total, subtotal: total }],
})

const sales = [sale(1, '2026-11-02T09:00:00', 30), sale(2, '2026-10-20T09:00:00', 12, 'momo', 'Voltic')]
const invoices = [
  invoice(7, '2026-10-01', 400, 'pending', 'Kofi Mensah', '024 111 2222'),
  invoice(8, '2026-10-30', 250, 'paid', 'Kofi Mensah', '+233241112222'),
  invoice(9, '2026-11-01', 90, 'pending', 'Esi'),
]
const orders = mergeOrders(sales, invoices)

describe('store orders', () => {
  it('lists counter sales and invoices together, newest first', () => {
    expect(orders.map((o) => o.ref)).toEqual(['S-1', 'INV-9', 'INV-8', 'S-2', 'INV-7'])
    expect(orders[0]).toMatchObject({ kind: 'sale', status: 'paid', cashier: 'Ama', total: 30 })
    expect(invoiceToOrder(invoices[0])).toMatchObject({ kind: 'invoice', status: 'pending', customerName: 'Kofi Mensah' })
  })

  it('pending is unpaid invoices, oldest first; completed is everything paid', () => {
    expect(filterOrders(orders, { ...DEFAULT_FILTERS, view: 'pending' }, now).map((o) => o.ref)).toEqual(['INV-7', 'INV-9'])
    expect(filterOrders(orders, { ...DEFAULT_FILTERS, view: 'completed' }, now).map((o) => o.ref)).toEqual(['S-1', 'INV-8', 'S-2'])
  })

  it('filters by date, type, payment and search (customer, phone, product, number)', () => {
    const f = (patch: object) => filterOrders(orders, { ...DEFAULT_FILTERS, ...patch }, now).map((o) => o.ref)
    expect(f({ days: 0 })).toEqual(['S-1'])
    expect(f({ days: 6 })).toEqual(['S-1', 'INV-9', 'INV-8'])
    expect(f({ kind: 'sale', payment: 'momo' })).toEqual(['S-2'])
    expect(f({ q: 'voltic' })).toEqual(['S-2'])
    expect(f({ q: '0241112222' })).toEqual(['INV-7'])
    expect(f({ q: 'inv-9' })).toEqual(['INV-9'])
  })

  it('totals what is still owed', () => {
    expect(orderTotals(orders)).toMatchObject({ count: 5, value: 782, outstanding: 490, pendingCount: 2 })
    expect(daysSince('2026-10-01', now)).toBe(32)
  })
})

describe('customers', () => {
  it('groups invoices by phone (local or +233 form), counting paid and owed', () => {
    const list = customersFrom(orders)
    expect(list).toHaveLength(2)
    const kofi = list.find((c) => c.name === 'Kofi Mensah')!
    expect(kofi).toMatchObject({ totalSpent: 250, owes: 400, phone: '+233241112222' })
    expect(kofi.orders).toHaveLength(2)
    expect(sortCustomers(list, 'owes')[0].name).toBe('Kofi Mensah')
    expect(sortCustomers(list, 'recent')[0].name).toBe('Esi')
  })
})

describe('store settings and receipts', () => {
  it('fills in new fields for older saved settings', () => {
    expect(withDefaults({ payments: { cash: false } })).toMatchObject({
      payments: { cash: false, momo: true },
      receipt: { showCashier: true },
    })
  })

  it('needs one payment method and a valid MoMo number', () => {
    const s = withDefaults({ payments: { cash: false, momo: false } })
    expect(settingsProblems(s)['payments.methods']).toBeTruthy()
    expect(settingsProblems(withDefaults({ payments: { momoNumber: '12345' } }))['payments.momoNumber']).toBeTruthy()
    expect(settingsProblems(withDefaults({ payments: { momoNumber: '024 123 4567' } }))).toEqual({})
  })

  it('prints business details, the amount due and where to pay, safely escaped', () => {
    const s = withDefaults({
      business: { name: 'Adom <Mart>', address: 'Kaneshie' },
      payments: { momoNumber: '0241234567', momoName: 'Adom Ent' },
      receipt: { footer: 'No returns after 7 days' },
    })
    const html = receiptHtml(invoiceToOrder(invoices[0]), s)
    expect(html).toContain('Adom &lt;Mart&gt;')
    expect(html).not.toContain('<Mart>')
    expect(html).toMatch(/Amount due: GH₵ 400\.00/)
    expect(html).toContain('024 123 4567')
    expect(html).toContain('No returns after 7 days')
    const receipt = receiptHtml(orders[0], { ...DEFAULT_STORE_SETTINGS })
    expect(receipt).toContain('Served by Ama')
    expect(receipt).toContain('Paid · Cash')
    expect(receipt).not.toContain('Pay with')
  })
})
