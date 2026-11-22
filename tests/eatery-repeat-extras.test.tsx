// "More than one of each": an extras group where a customer can take the same
// extra several times (Egg × 3). Each one is the choice's id again in the
// line's choices, so pricing and stock count it every time.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ItemSheet } from '@/components/eatery/item-sheet'
import { lineUsage } from '@/lib/eatery/costing'
import { choiceProblems, choiceSummary, linePrice, onceGroupIds, priceOrder } from '@/lib/eatery/menu'
import { presetFor } from '@/lib/eatery/presets'
import type { MenuItem, OptionGroup, Recipe, Restaurant } from '@/lib/eatery/types'

const proteins = (over: Partial<OptionGroup> = {}): OptionGroup => ({
  id: 'protein',
  name: 'Proteins',
  kind: 'addon',
  min: 0,
  max: 10,
  repeat: true,
  choices: [
    { id: 'egg', name: 'Egg', priceDelta: 3 },
    { id: 'fish', name: 'Fish small', priceDelta: 20 },
  ],
  ...over,
})

const waakye = (group: OptionGroup = proteins()): MenuItem =>
  ({
    id: 1,
    restaurantId: 1,
    categoryId: 1,
    name: 'Waakye',
    price: 10,
    tags: [],
    status: 'available',
    position: 0,
    optionGroups: [group],
  }) as unknown as MenuItem

const restaurant = {
  id: 1,
  name: 'Chop bar',
  currency: 'GHS',
  theme: presetFor('local-dishes').theme,
  fulfilment: { delivery: { enabled: true, fee: 0, minOrder: 0 }, pickup: { enabled: true }, dineIn: { enabled: true } },
} as unknown as Restaurant

const bundleWith = (item: MenuItem) => ({
  restaurant,
  categories: [{ id: 1, restaurantId: 1, name: 'Food', position: 0 }] as any,
  items: [item],
  promotions: [],
})

const now = new Date(2026, 10, 22, 12)
const threeEggs = { protein: ['egg', 'egg', 'egg'] }

describe('pricing', () => {
  it('three eggs cost three times the egg', () => {
    expect(linePrice(waakye(), threeEggs, undefined, [], now).unitPrice).toBe(10 + 9)
    const order = priceOrder(bundleWith(waakye()), [{ itemId: 1, quantity: 1, choices: { protein: ['egg', 'egg', 'egg', 'fish'] } }], 'pickup', now)
    expect(order.problems).toEqual([])
    expect(order.lines[0]).toMatchObject({ lineTotal: 39, summary: '+ Egg × 3, Fish small' })
  })

  it('works with "charged once per line": 2 plates sharing three eggs', () => {
    const item = waakye(proteins({ chargeOnce: true }))
    const order = priceOrder(bundleWith(item), [{ itemId: 1, quantity: 2, choices: threeEggs }], 'pickup', now)
    expect(order.lines[0]).toMatchObject({ unitPrice: 10, onceExtras: 9, lineTotal: 29, summary: '+ Egg × 3 (once)' })
  })

  it('Max counts every one', () => {
    const item = waakye(proteins({ max: 2 }))
    expect(choiceProblems(item, threeEggs)).toEqual({ protein: 'Choose at most 2' })
  })

  it('groups without the setting still take each extra only once', () => {
    const item = waakye(proteins({ repeat: undefined, max: 2 }))
    expect(choiceProblems(item, { protein: ['egg', 'egg'] })).toEqual({ protein: 'Choose each one only once' })
    expect(choiceProblems(item, { protein: ['egg', 'fish'] })).toEqual({})
  })

  it('uses the egg’s ingredients each time', () => {
    const recipes = new Map<number, Recipe>([[1, { itemId: 1, ingredients: [], choices: { egg: [{ ingredientId: 7, quantity: 1 }] } } as any]])
    expect(lineUsage({ itemId: 1, quantity: 2, choices: threeEggs }, recipes).get(7)).toBe(6)
    expect(lineUsage({ itemId: 1, quantity: 2, choices: threeEggs }, recipes, onceGroupIds(waakye(proteins({ chargeOnce: true })))).get(7)).toBe(3)
  })

  it('summary leaves out the count for a single one', () => {
    expect(choiceSummary(waakye(), { choices: { protein: ['fish', 'egg'] } })).toBe('+ Fish small, Egg')
  })
})

describe('the item sheet', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  })

  it('taps + for each egg and adds them to the order', () => {
    const onAdd = vi.fn()
    const item = waakye(proteins({ max: 4 }))
    render(<ItemSheet bundle={bundleWith(item)} item={item} now={now} onClose={() => {}} onAdd={onAdd} />)
    const more = screen.getByRole('button', { name: 'One more Egg' })
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.click(more)
    expect(screen.getByLabelText('3 Egg').textContent).toBe('3')
    expect(screen.getByRole('button', { name: /₵19/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'One less Egg' }))
    fireEvent.click(screen.getByRole('button', { name: 'One more Fish small' }))
    fireEvent.click(more)
    // Max 4 reached: no more of anything.
    expect((more as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /₵39/ }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ choices: { protein: ['egg', 'egg', 'fish', 'egg'] } }))
  })

  it('groups without the setting keep their tick boxes', () => {
    const item = waakye(proteins({ repeat: undefined, max: 2 }))
    render(<ItemSheet bundle={bundleWith(item)} item={item} now={now} onClose={() => {}} onAdd={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /Egg/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'One more Egg' })).toBeNull()
  })
})
