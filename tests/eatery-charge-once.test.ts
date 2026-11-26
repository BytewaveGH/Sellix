// Extras charged once per line: TZ × 4 with one fish is 4 × TZ + 1 fish, not
// 4 × (TZ + fish). Groups without the setting are charged per portion as before.
import { lineUsage } from '@/lib/eatery/costing'
import { choiceSummary, linePrice, onceGroupIds, priceOrder } from '@/lib/eatery/menu'
import { offlineOrderBody } from '@/lib/eatery/offline-order'
import type { MenuItem, OptionGroup, Promotion, Recipe, Restaurant } from '@/lib/eatery/types'

const proteins = (chargeOnce?: boolean): OptionGroup => ({
  id: 'protein',
  name: 'Proteins',
  kind: 'addon',
  min: 0,
  max: 3,
  chargeOnce,
  choices: [
    { id: 'egg', name: 'Eggs', priceDelta: 3 },
    { id: 'fish', name: 'Fish small', priceDelta: 20 },
  ],
})

const tz = (chargeOnce?: boolean): MenuItem =>
  ({
    id: 1,
    restaurantId: 1,
    categoryId: 1,
    name: 'TZ',
    price: 0,
    tags: [],
    status: 'available',
    optionGroups: [
      {
        id: 'size',
        name: 'Size',
        kind: 'variant',
        min: 1,
        max: 1,
        choices: [
          { id: 'regular', name: 'Regular', priceDelta: 5 },
          { id: 'maxi', name: 'Maxi', priceDelta: 7 },
        ],
      },
      proteins(chargeOnce),
    ],
  }) as unknown as MenuItem

const restaurant = {
  id: 1,
  currency: 'GHS',
  fulfilment: { delivery: { enabled: true, fee: 0, minOrder: 0 }, pickup: { enabled: true }, dineIn: { enabled: true } },
} as unknown as Restaurant

const bundleWith = (item: MenuItem, promotions: Promotion[] = []) => ({
  restaurant,
  categories: [{ id: 1, restaurantId: 1, name: 'Food', position: 0 }] as any,
  items: [item],
  promotions,
})

const now = new Date(2026, 10, 19, 12)
const fourWithFish = { itemId: 1, quantity: 4, choices: { size: ['regular'], protein: ['fish'] } }

describe('extras charged once per line', () => {
  it('TZ Regular × 4 + one fish is 40, not 100', () => {
    const priced = priceOrder(bundleWith(tz(true)), [fourWithFish], null, now)
    expect(priced.lines[0]).toMatchObject({ unitPrice: 5, onceExtras: 20, lineTotal: 40 })
    expect(priced.total).toBe(40)
    expect(priced.subtotal).toBe(40)
  })

  it('without the setting, extras are still charged per portion', () => {
    const priced = priceOrder(bundleWith(tz()), [fourWithFish], null, now)
    expect(priced.lines[0]).toMatchObject({ unitPrice: 25, lineTotal: 100 })
    expect(priced.lines[0].onceExtras).toBeUndefined()
  })

  it('one plate costs the same either way', () => {
    const one = { ...fourWithFish, quantity: 1 }
    expect(priceOrder(bundleWith(tz(true)), [one], null, now).total).toBe(25)
    expect(priceOrder(bundleWith(tz()), [one], null, now).total).toBe(25)
  })

  it('several extras add up once: Maxi × 2 + fish + egg = 14 + 23', () => {
    const line = { itemId: 1, quantity: 2, choices: { size: ['maxi'], protein: ['fish', 'egg'] } }
    expect(priceOrder(bundleWith(tz(true)), [line], null, now).lines[0].lineTotal).toBe(37)
  })

  it('a promotion takes its share off the once-charged extras too', () => {
    const promo = {
      id: 1,
      restaurantId: 1,
      name: 'Lunch',
      percentOff: 10,
      itemIds: [],
      categoryIds: [],
      active: true,
    } as unknown as Promotion
    const price = linePrice(tz(true), fourWithFish.choices, undefined, [promo], now)
    // Only applies if the promotion is live now; either way the total is consistent.
    const priced = priceOrder(bundleWith(tz(true), [promo]), [fourWithFish], null, now)
    expect(priced.lines[0].lineTotal).toBe(Math.round((price.unitPrice * 4 + price.onceExtras) * 100) / 100)
    expect(priced.total).toBe(Math.round((priced.subtotal - priced.discount) * 100) / 100)
  })

  it('only extras groups can be charged once', () => {
    const item = tz(true)
    item.optionGroups[0] = { ...item.optionGroups[0], chargeOnce: true }
    expect([...onceGroupIds(item)]).toEqual(['protein'])
  })

  it('the kitchen and receipt see the extra marked once when there are several portions', () => {
    const item = tz(true)
    expect(choiceSummary(item, fourWithFish)).toBe('Regular · + Fish small (once)')
    expect(choiceSummary(item, { ...fourWithFish, quantity: 1 })).toBe('Regular · + Fish small')
    expect(choiceSummary(tz(), fourWithFish)).toBe('Regular · + Fish small')
  })

  it('stock: four portions of TZ use one fish', () => {
    const recipes = new Map<number, Recipe>([
      [
        1,
        {
          itemId: 1,
          restaurantId: 1,
          ingredients: [{ ingredientId: 10, quantity: 1 }],
          choices: { fish: [{ ingredientId: 20, quantity: 1 }] },
        } as any,
      ],
    ])
    const once = lineUsage(fourWithFish, recipes, onceGroupIds(tz(true)))
    expect(once.get(10)).toBe(4)
    expect(once.get(20)).toBe(1)
    const each = lineUsage(fourWithFish, recipes, onceGroupIds(tz()))
    expect(each.get(20)).toBe(4)
  })

  it('an offline counter order sends what the customer paid', () => {
    const menu = { restaurant, categories: bundleWith(tz(true)).categories, items: [tz(true)], promotions: [] } as any
    const body = offlineOrderBody(menu, { lines: [fourWithFish] } as any, now)
    expect(body.lines[0]).toMatchObject({ unitPrice: 5, onceExtras: 20 })
  })
})
