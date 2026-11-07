// The live orders board: how it's laid out, and what the kitchen has to make.

import type { Order, OrderStatus } from './types'

export type BoardView = 'columns' | 'rows' | 'kitchen'

export interface BoardPrefs {
  view: BoardView
  // Smaller tickets, so more fit on a kitchen screen.
  compact: boolean
}

export const DEFAULT_BOARD_PREFS: BoardPrefs = { view: 'columns', compact: false }

const KEY = 'sellix-eatery:orders-board'

// Per device: the counter tablet and the kitchen screen can differ.
export const readBoardPrefs = (): BoardPrefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const view: BoardView = ['columns', 'rows', 'kitchen'].includes(raw?.view) ? raw.view : DEFAULT_BOARD_PREFS.view
    return { view, compact: typeof raw?.compact === 'boolean' ? raw.compact : DEFAULT_BOARD_PREFS.compact }
  } catch {
    return DEFAULT_BOARD_PREFS
  }
}

export const writeBoardPrefs = (p: BoardPrefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Private mode or storage full: the choice just isn't remembered.
  }
}

// Orders the kitchen is working on (accepted, not yet ready).
export const COOKING: OrderStatus[] = ['accepted', 'preparing']

export interface ToMake {
  name: string
  // Options that change what's cooked, e.g. "Large · Extra chicken".
  summary?: string
  quantity: number
  orders: number
}

// Everything to cook across open orders, grouped by dish and options, most first:
// "6× Jollof · 3× Waakye" lets a cook batch instead of reading every ticket.
export const itemsToMake = (orders: Order[], statuses: OrderStatus[] = COOKING): ToMake[] => {
  const groups = new Map<string, ToMake>()
  for (const o of orders) {
    if (!statuses.includes(o.status)) continue
    const seen = new Set<string>()
    for (const l of o.lines) {
      const key = `${l.name}\u0000${l.summary ?? ''}`
      const g = groups.get(key) ?? { name: l.name, summary: l.summary || undefined, quantity: 0, orders: 0 }
      g.quantity += l.quantity
      if (!seen.has(key)) g.orders++
      seen.add(key)
      groups.set(key, g)
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
}

// Kitchen view order: new orders first (someone must accept them), then
// everything else oldest first.
export const kitchenOrder = (a: Order, b: Order) =>
  Number(b.status === 'placed') - Number(a.status === 'placed') || (a.createdAt < b.createdAt ? -1 : 1)
