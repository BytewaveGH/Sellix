import { DEFAULT_BOARD_PREFS, itemsToMake, kitchenOrder, readBoardPrefs, writeBoardPrefs } from '@/lib/eatery/kitchen'
import { waitTone } from '@/app/[locale]/(eatery)/eatery/_components/order-bits'
import type { Order } from '@/lib/eatery/types'

const order = (id: number, status: Order['status'], createdAt: string, lines: { name: string; quantity: number; summary?: string }[]) =>
  ({ id, status, createdAt, lines }) as unknown as Order

describe('itemsToMake', () => {
  it('adds up what is accepted or cooking, by dish and options, most first', () => {
    const orders = [
      order(1, 'accepted', '2026-11-07T12:00:00Z', [
        { name: 'Jollof', quantity: 2, summary: 'Large' },
        { name: 'Waakye', quantity: 1 },
      ]),
      order(2, 'preparing', '2026-11-07T12:05:00Z', [
        { name: 'Jollof', quantity: 3, summary: 'Large' },
        { name: 'Jollof', quantity: 1, summary: 'Regular' },
      ]),
      // Not cooking yet, or already done: left out.
      order(3, 'placed', '2026-11-07T12:06:00Z', [{ name: 'Jollof', quantity: 9, summary: 'Large' }]),
      order(4, 'ready', '2026-11-07T11:00:00Z', [{ name: 'Waakye', quantity: 4 }]),
    ]
    expect(itemsToMake(orders)).toEqual([
      { name: 'Jollof', summary: 'Large', quantity: 5, orders: 2 },
      { name: 'Jollof', summary: 'Regular', quantity: 1, orders: 1 },
      { name: 'Waakye', summary: undefined, quantity: 1, orders: 1 },
    ])
  })

  it('is empty when nothing is cooking', () => {
    expect(itemsToMake([order(1, 'placed', '2026-11-07T12:00:00Z', [{ name: 'Jollof', quantity: 1 }])])).toEqual([])
  })
})

describe('kitchen ticket order', () => {
  it('puts new orders first (to be accepted), then the oldest', () => {
    const list = [
      order(1, 'preparing', '2026-11-07T12:10:00Z', []),
      order(2, 'placed', '2026-11-07T12:20:00Z', []),
      order(3, 'accepted', '2026-11-07T12:00:00Z', []),
      order(4, 'placed', '2026-11-07T12:15:00Z', []),
    ]
    expect([...list].sort(kitchenOrder).map((o) => o.id)).toEqual([4, 2, 3, 1])
  })
})

describe('waiting time', () => {
  it('turns amber at 10 minutes and red at 20', () => {
    expect([0, 9, 10, 19, 20, 45].map(waitTone)).toEqual(['ok', 'ok', 'amber', 'amber', 'red', 'red'])
  })
})

describe('board preferences', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to columns, remembers the choice, and ignores junk', () => {
    expect(readBoardPrefs()).toEqual(DEFAULT_BOARD_PREFS)
    writeBoardPrefs({ view: 'kitchen', compact: true })
    expect(readBoardPrefs()).toEqual({ view: 'kitchen', compact: true })
    localStorage.setItem('sellix-eatery:orders-board', '{"view":"sideways","compact":"yes"}')
    expect(readBoardPrefs()).toEqual(DEFAULT_BOARD_PREFS)
  })
})
