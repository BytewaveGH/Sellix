// Import / export a menu section as CSV (or a pasted list), saved with the
// usual item endpoints (src/lib/eatery/menu-csv.ts, menu-import.tsx).
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_EATERY_DATA_SOURCE = 'local'
})
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { tenant: 'acme' } } }) }))
vi.mock('@/hooks/use-axios', () => ({ useAxios: () => vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { MenuImport } from '@/app/[locale]/(eatery)/eatery/_components/menu-import'
import { createLocalSource } from '@/lib/eatery/data-source'
import { priceOrder } from '@/lib/eatery/menu'
import { formatOptions, itemsToCsv, parseOptions, planMenuImport, SAMPLE_CSV, splitNamePrice } from '@/lib/eatery/menu-csv'
import type { MenuItem } from '@/lib/eatery/types'

let n = 0
const newId = (p: string) => `${p}${++n}`
const ctx = (items: MenuItem[] = []) => ({ restaurantId: 1, categoryId: 2, items, newId })

const tz: MenuItem = {
  id: 9,
  restaurantId: 1,
  categoryId: 2,
  name: 'TZ',
  price: 0,
  tags: ['popular'],
  status: 'available',
  position: 0,
  optionGroups: [
    {
      id: 'size',
      name: 'Size',
      kind: 'variant',
      min: 1,
      max: 1,
      choices: [
        { id: 'reg', name: 'Regular', priceDelta: 5 },
        { id: 'maxi', name: 'Maxi', priceDelta: 7, soldOut: true },
      ],
    },
    {
      id: 'protein',
      name: 'Proteins',
      kind: 'addon',
      min: 0,
      max: 10,
      chargeOnce: true,
      repeat: true,
      choices: [
        { id: 'egg', name: 'Egg', priceDelta: 3 },
        { id: 'fish', name: 'Fish small', priceDelta: 20 },
      ],
    },
  ],
}

describe('reading a menu', () => {
  it('a pasted list: one item per line with its price', () => {
    const { rows } = planMenuImport('Jollof rice 35\nWaakye - ₵25\nKelewele GHS 15.50\n\nBanku', ctx())
    expect(rows.map((r) => [r.action, r.name, r.action === 'create' ? r.body.price : r.action === 'skip' ? r.reason : ''])).toEqual([
      ['create', 'Jollof rice', 35],
      ['create', 'Waakye', 25],
      ['create', 'Kelewele', 15.5],
      ['skip', 'Banku', 'No price'],
    ])
    const first = rows[0]
    expect(first.action === 'create' && first.body).toMatchObject({
      restaurantId: 1,
      categoryId: 2,
      status: 'available',
      tags: [],
      optionGroups: [],
      position: 0,
    })
  })

  it('rows copied from a spreadsheet (tabs), without a header', () => {
    const { rows } = planMenuImport('Fried rice\t40\tWith chicken\nSobolo\t10', ctx())
    expect(rows[0]).toMatchObject({ action: 'create', body: { name: 'Fried rice', price: 40, description: 'With chicken' } })
    expect(rows[1]).toMatchObject({ action: 'create', body: { name: 'Sobolo', price: 10 } })
    expect(planMenuImport('Fried rice, chicken 40', ctx()).rows[0]).toMatchObject({ body: { name: 'Fried rice, chicken', price: 40 } })
  })

  it('a spreadsheet with a header in any wording', () => {
    const csv = 'Dish,Price (₵),Details,Tags\r\nRed red,30,"Beans, plantain",Vegetarian; spicy\r\nTea,abc,,'
    const { rows } = planMenuImport(csv, ctx())
    expect(rows[0]).toMatchObject({
      action: 'create',
      body: { name: 'Red red', price: 30, description: 'Beans, plantain', tags: ['vegetarian', 'spicy'] },
    })
    expect(rows[1]).toMatchObject({ action: 'skip', reason: 'Price “abc” isn’t a number' })
  })

  it('names and prices', () => {
    expect(splitNamePrice('Coke 50cl 10')).toEqual({ name: 'Coke 50cl', price: 10 })
    expect(splitNamePrice('Small -2')).toEqual({ name: 'Small', price: -2 })
    expect(splitNamePrice('Fish - 20')).toEqual({ name: 'Fish', price: 20 })
    expect(splitNamePrice('Plain')).toEqual({ name: 'Plain' })
  })

  it('options: pick-one groups and extras with their settings', () => {
    const { groups } = parseOptions(
      'Size: Regular 5, Maxi 7 | Proteins (extras, up to 10, once per line, more than one of each): Egg 3, Fish 20 (sold out)',
      [],
      newId
    )
    expect(groups[0]).toMatchObject({ name: 'Size', kind: 'variant', min: 1, max: 1 })
    expect(groups[1]).toMatchObject({ name: 'Proteins', kind: 'addon', min: 0, max: 10, chargeOnce: true, repeat: true })
    expect(groups[1].choices[1]).toMatchObject({ name: 'Fish', priceDelta: 20, soldOut: true })
    expect(parseOptions('Sauces (extras): Shito, Pepper', [], newId).groups[0]).toMatchObject({ kind: 'addon', min: 0, max: 2 })
    expect(parseOptions('just words', [], newId).error).toMatch(/Group: choice price/)
  })

  it('the sample file imports', () => {
    const { rows } = planMenuImport(SAMPLE_CSV, ctx())
    expect(rows.map((r) => r.action)).toEqual(['create', 'create', 'create'])
  })
})

describe('export, edit, import back', () => {
  it('round-trips a section, keeping ids so recipes still match', () => {
    const csv = itemsToCsv([tz])
    expect(formatOptions(tz.optionGroups)).toBe(
      'Size: Regular 5, Maxi 7 (sold out) | Proteins (extras, up to 10, once per line, more than one of each): Egg 3, Fish small 20'
    )
    expect(planMenuImport(csv, ctx([tz])).rows).toEqual([{ line: 2, name: 'TZ', action: 'same', id: 9 }])
  })

  it('changes only what the file changes', () => {
    const csv = itemsToCsv([tz]).replace('Egg 3', 'Egg 4').replace(',available,', ',sold out,')
    const [row] = planMenuImport(csv, ctx([tz])).rows
    expect(row).toMatchObject({ action: 'update', id: 9, changes: ['options', 'availability'] })
    if (row.action !== 'update') throw new Error()
    expect(row.body.status).toBe('sold-out')
    // Same group and choice ids: recipes and carts keep working.
    expect(row.body.optionGroups![1].choices.map((c) => [c.id, c.priceDelta])).toEqual([
      ['egg', 4],
      ['fish', 20],
    ])
  })

  it('matches by name when there is no id column; blank cells leave the item alone', () => {
    const [row] = planMenuImport('name,price,description\ntz,6,', ctx([tz])).rows
    expect(row).toMatchObject({ action: 'update', id: 9, changes: ['name', 'price'], body: { name: 'tz', price: 6 } })
  })

  it('a name twice in one file is skipped the second time', () => {
    const { rows } = planMenuImport('Tea 5\ntea 6', ctx())
    expect(rows[1]).toMatchObject({ action: 'skip', reason: 'Listed twice in the file' })
  })

  it('a cell that looks like a formula is exported safely', () => {
    expect(itemsToCsv([{ ...tz, name: '=HYPERLINK("x")', optionGroups: [] }])).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('the import drawer', () => {
  const withQuery = (ui: React.ReactElement) =>
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

  it('previews a pasted list and saves the items into the section', async () => {
    localStorage.clear()
    const owner = createLocalSource('acme')
    const mine = await owner.claimDemo!()
    const cafe = mine.find((r) => r.slug === 'kofi-and-crumb')!
    const section = (await owner.list('categories')).find((c) => c.restaurantId === cafe.id)!
    const items = (await owner.list('items')).filter((i) => i.categoryId === section.id)
    const existing = items[0]
    const onOpenChange = vi.fn()
    withQuery(<MenuImport open onOpenChange={onOpenChange} restaurant={cafe} category={section} items={items} />)

    // Rows copied from a spreadsheet, with a header so TZ can bring its sizes.
    fireEvent.change(screen.getByLabelText(/Or paste your menu/), {
      target: { value: `Name\tPrice\tOptions\nWaakye\t25\t\n${existing.name}\t${existing.price + 1}\t\nTZ\t\tSize: Regular 5, Maxi 7` },
    })
    expect(screen.getByText('2 new · 1 to update')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import 3 items' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    const after = (await owner.list('items')).filter((i) => i.categoryId === section.id)
    expect(after.find((i) => i.name === 'Waakye')).toMatchObject({ price: 25, restaurantId: cafe.id })
    expect(after.find((i) => i.id === existing.id)?.price).toBe(existing.price + 1)
    // Priced like any other item: Maxi TZ = ₵7.
    const tzItem = after.find((i) => i.name === 'TZ')!
    const order = priceOrder(
      { restaurant: cafe, categories: [section], items: after, promotions: [] },
      [{ itemId: tzItem.id, quantity: 1, choices: { [tzItem.optionGroups[0].id]: [tzItem.optionGroups[0].choices[1].id] } }],
      null,
      new Date()
    )
    expect(order.lines[0].lineTotal).toBe(7)
  })
})
