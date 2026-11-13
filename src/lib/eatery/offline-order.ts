// A counter order rung up with no internet: priced on the till from the menu
// kept on this device, shown on the kitchen board and receipt at once, and
// sent to the server when the connection is back (lib/offline). The server
// prices it again and gives it its own number then.

import { priceOrder } from './menu'
import type { CounterOrderInput, MenuCategory, MenuItem, Order, Promotion, Restaurant } from './types'

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const code = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

export type MenuOnDevice = { restaurant: Restaurant; categories: MenuCategory[]; items: MenuItem[]; promotions: Promotion[] }

const bundle = (menu: MenuOnDevice) => {
  const r = menu.restaurant
  return {
    restaurant: r,
    categories: menu.categories.filter((c) => c.restaurantId === r.id),
    items: menu.items.filter((i) => i.restaurantId === r.id && i.status !== 'hidden'),
    promotions: menu.promotions.filter((p) => p.restaurantId === r.id && p.active),
  }
}

export const offlineCounterOrder = (
  menu: MenuOnDevice,
  input: CounterOrderInput,
  id: number,
  now: Date,
  receiptNo?: string
): Order & { accessKey: string } => {
  const r = menu.restaurant
  const priced = priceOrder(bundle(menu), input.lines, null, now)
  const at = now.toISOString()
  return {
    id,
    // Staff find it later by the number on its receipt.
    code: receiptNo ?? code(),
    ...(receiptNo ? { receiptNo, soldAt: at } : {}),
    accessKey: '',
    restaurantId: r.id,
    createdAt: at,
    updatedAt: at,
    customer: { name: input.customer?.name?.trim() || 'Walk-in', phone: input.customer?.phone?.trim() || '' },
    fulfilment: {
      type: input.fulfilment.type,
      table: input.fulfilment.type === 'dine-in' ? input.fulfilment.table?.trim() || undefined : undefined,
    },
    payment: {
      method: input.payment.method,
      status: input.payment.paid ? 'paid' : 'unpaid',
      reference: input.payment.reference?.trim() || undefined,
    },
    tendered: input.payment.method === 'cash' && input.payment.tendered ? input.payment.tendered : undefined,
    lines: priced.lines,
    subtotal: priced.subtotal,
    discount: priced.discount,
    deliveryFee: 0,
    total: priced.total,
    status: 'accepted',
    history: [
      { status: 'placed', at },
      { status: 'accepted', at },
    ],
    notes: input.notes?.trim() || undefined,
    channel: 'counter',
  }
}

// What's sent for a counter order kept offline: the order as rung up (with
// its clientId and till fields) plus, per line, the price the customer paid
// (after promotions), which the server keeps.
export const offlineOrderBody = (menu: MenuOnDevice, input: CounterOrderInput, now: Date) => {
  const b = bundle(menu)
  return {
    ...input,
    restaurantId: menu.restaurant.id,
    lines: input.lines.map((l) => {
      const price = priceOrder(b, [l], null, now).lines[0]?.unitPrice
      return price === undefined ? l : { ...l, unitPrice: price }
    }),
  }
}

// Menu item id → name, for "no longer on the menu" refusals.
export const itemNames = (menu: MenuOnDevice, input: CounterOrderInput) =>
  Object.fromEntries(
    input.lines.map((l) => [String(l.itemId), menu.items.find((i) => i.id === l.itemId)?.name ?? `item ${l.itemId}`])
  )
