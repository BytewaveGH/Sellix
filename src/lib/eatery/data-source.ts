// Where eatery data lives.
//
// - 'api'   — the Sellix backend: owner routes under /eatery/* (scoped by the
//             signed-in business) and public routes under /public/eatery/*.
//             Contract: BACKEND_REQUIREMENTS.md §7.
// - 'local' — this browser's localStorage. For using the platform before the
//             backend ships: data (including customers' orders) only exists in
//             this browser.
//
// Selected with NEXT_PUBLIC_EATERY_DATA_SOURCE (default 'api').

import type { AxiosRequestConfig } from 'axios'
import { averageCost, lineUsage, packagingUsage, usageCost } from './costing'
import { blobToDataUrl, type ImageKind } from './images'
import { openState, priceOrder } from './menu'
import { presetFor } from './presets'
import { DEMO_RESTAURANTS, templateGroup, type DemoRestaurant } from './seed'
import type {
  CheckoutInput,
  CounterOrderInput,
  DirectoryEntry,
  Ingredient,
  Order,
  OrderStatus,
  RecipeLine,
  ResourceMap,
  ResourceName,
  Restaurant,
  StockMove,
  StorefrontBundle,
} from './types'

export type DataSourceKind = 'api' | 'local'
export const DATA_SOURCE_KIND: DataSourceKind = process.env.NEXT_PUBLIC_EATERY_DATA_SOURCE === 'local' ? 'local' : 'api'

type Draft<R extends ResourceName> = Omit<ResourceMap[R], 'id'>
type Patch<R extends ResourceName> = Partial<Omit<ResourceMap[R], 'id'>>

// What the customer's device keeps to follow an order.
export interface OrderTicket {
  slug: string
  code: string
  accessKey: string
}

export interface EaterySource {
  kind: DataSourceKind
  // ── Public (no sign-in) ──
  directory(): Promise<DirectoryEntry[]>
  storefront(slug: string): Promise<StorefrontBundle | null>
  // Priced by the source from the current menu; `input` carries no prices.
  placeOrder(slug: string, input: CheckoutInput): Promise<Order & { accessKey: string }>
  trackOrder(ticket: OrderTicket): Promise<Order | null>
  // ── Owner (the signed-in business only) ──
  list<R extends ResourceName>(r: R): Promise<ResourceMap[R][]>
  create<R extends ResourceName>(r: R, body: Draft<R>): Promise<ResourceMap[R]>
  update<R extends ResourceName>(r: R, id: number, body: Patch<R>): Promise<ResourceMap[R]>
  remove(r: ResourceName, id: number): Promise<void>
  // Staff ring up an order at the counter (POS). Priced like online orders;
  // accepted straight away, so its ingredients leave stock at once.
  // `offline`: the order as the till prices it, kept and shown at once if
  // the connection is down (API only; lib/offline sends it later).
  createCounterOrder(
    restaurantId: number,
    input: CounterOrderInput,
    offline?: OfflineCounterOrder
  ): Promise<Order & { accessKey: string }>
  // Stores a prepared logo/cover image (images.ts) and returns its URL.
  uploadImage(restaurantId: number, image: Blob, kind: ImageKind): Promise<string>
  // Local only: hand the example restaurants shown in the directory to this business.
  claimDemo?(): Promise<Restaurant[]>
}

const COUNTER_WAIT_MS = 3000

// A counter order kept on the till while offline (lib/offline): what to show
// at once, and what to send later (with clientId and the prices paid).
export type OfflineCounterOrder = {
  result: (tempId: number) => Order & { accessKey: string }
  body: () => unknown
  names: Record<string, string>
}

// Same shape as an axios error so screens handle local and API errors alike.
export const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { response: { status, data: { status: false, error: message } } })

// ── API ──────────────────────────────────────────────────────────────────────

const PATHS: Record<ResourceName, string> = {
  restaurants: 'restaurants',
  categories: 'menu-categories',
  items: 'menu-items',
  promotions: 'promotions',
  orders: 'orders',
  ingredients: 'ingredients',
  recipes: 'recipes',
  stockMoves: 'stock-moves',
  expenses: 'expenses',
  packaging: 'packaging-rules',
}

export const EateryServices = {
  List: (r: ResourceName): AxiosRequestConfig => ({ method: 'GET', url: `/eatery/${PATHS[r]}/` }),
  Create: (r: ResourceName, data: unknown): AxiosRequestConfig => ({ method: 'POST', url: `/eatery/${PATHS[r]}/`, data }),
  Update: (r: ResourceName, id: number, data: unknown): AxiosRequestConfig => ({ method: 'PUT', url: `/eatery/${PATHS[r]}/${id}`, data }),
  Delete: (r: ResourceName, id: number): AxiosRequestConfig => ({ method: 'DELETE', url: `/eatery/${PATHS[r]}/${id}` }),
  UploadImage: (restaurantId: number, image: Blob, kind: ImageKind): AxiosRequestConfig => {
    const form = new FormData()
    form.append('file', image, `${kind}.${image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg'}`)
    form.append('kind', kind)
    form.append('restaurantId', String(restaurantId))
    return { method: 'POST', url: '/eatery/uploads', data: form }
  },
  CounterOrder: (restaurantId: number, data: CounterOrderInput): AxiosRequestConfig => ({
    method: 'POST',
    url: '/eatery/orders/counter',
    data: { ...data, restaurantId },
  }),
  Directory: (): AxiosRequestConfig => ({ method: 'GET', url: '/public/eatery/restaurants' }),
  Storefront: (slug: string): AxiosRequestConfig => ({ method: 'GET', url: `/public/eatery/restaurants/${encodeURIComponent(slug)}` }),
  PlaceOrder: (slug: string, data: CheckoutInput): AxiosRequestConfig => ({
    method: 'POST',
    url: `/public/eatery/restaurants/${encodeURIComponent(slug)}/orders`,
    data,
  }),
  TrackOrder: (t: OrderTicket): AxiosRequestConfig => ({
    method: 'GET',
    url: `/public/eatery/restaurants/${encodeURIComponent(t.slug)}/orders/${encodeURIComponent(t.code)}`,
    headers: { 'X-Order-Key': t.accessKey },
  }),
}

const unwrap = (res: any) => res?.data?.data ?? res?.data
const asList = (d: any) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [])

export const createApiSource = (
  owner: (c: AxiosRequestConfig) => Promise<any>,
  pub: (c: AxiosRequestConfig) => Promise<any>
): EaterySource => ({
  kind: 'api',
  directory: async () => asList(unwrap(await pub(EateryServices.Directory()))),
  storefront: async (slug) => {
    try {
      return unwrap(await pub(EateryServices.Storefront(slug)))
    } catch (err: any) {
      if (err?.response?.status === 404) return null
      throw err
    }
  },
  placeOrder: async (slug, input) => unwrap(await pub(EateryServices.PlaceOrder(slug, input))),
  trackOrder: async (t) => {
    try {
      return unwrap(await pub(EateryServices.TrackOrder(t)))
    } catch (err: any) {
      if (err?.response?.status === 404) return null
      throw err
    }
  },
  list: async (r) => asList(unwrap(await owner(EateryServices.List(r)))),
  create: async (r, body) => unwrap(await owner(EateryServices.Create(r, body))),
  update: async (r, id, body) => unwrap(await owner(EateryServices.Update(r, id, body))),
  remove: async (r, id) => {
    await owner(EateryServices.Delete(r, id))
  },
  createCounterOrder: async (restaurantId, input, offline) =>
    unwrap(
      await owner({
        ...EateryServices.CounterOrder(restaurantId, input),
        ...(offline
          ? {
              offline: {
                result: offline.result,
                body: offline.body,
                names: offline.names,
                // Carries a clientId: the server never records it twice.
                safeToRepeat: true,
                // Slow connection: keep it after 3 s rather than hold the till.
                waitMs: COUNTER_WAIT_MS,
                // It belongs on the orders list (and so on the kitchen board).
                appendTo: '/eatery/orders',
                label: `Counter order${input.fulfilment.table ? ` · table ${input.fulfilment.table}` : ''}`,
              },
            }
          : {}),
      } as AxiosRequestConfig)
    ),
  uploadImage: async (restaurantId, image, kind) => {
    const url = unwrap(await owner(EateryServices.UploadImage(restaurantId, image, kind)))?.url
    if (!url) throw httpError(502, 'The upload didn’t return a link')
    return url
  },
})

// ── Demo data (built through `create`, so it works against any source) ─────

type Creator = <R extends ResourceName>(r: R, body: Draft<R>) => Promise<ResourceMap[R]>

export const materializeDemo = async (def: DemoRestaurant, create: Creator, slug = def.restaurant.slug) => {
  const restaurant = await create('restaurants', {
    ...def.restaurant,
    slug,
    ownerScope: '',
    theme: JSON.parse(JSON.stringify(presetFor(def.restaurant.category).theme)),
    createdAt: new Date().toISOString(),
  })
  const sectionIds = new Map<string, number>()
  for (let i = 0; i < def.menu.length; i++) {
    const s = def.menu[i]
    const preset = presetFor(def.restaurant.category).sections.find((x) => x.name === s.section)
    const c = await create('categories', {
      restaurantId: restaurant.id,
      name: s.section,
      position: i,
      description: preset?.description,
      schedule: preset?.schedule,
    })
    sectionIds.set(s.section, c.id)
  }
  // Plain items first so combos can point at them.
  const itemIds = new Map<string, number>()
  const createdItems = new Map<string, ResourceMap['items']>()
  const make = async (section: string, it: DemoRestaurant['menu'][number]['items'][number], position: number) => {
    const created = await create('items', {
      restaurantId: restaurant.id,
      categoryId: sectionIds.get(section)!,
      name: it.name,
      description: it.description,
      price: it.price,
      tags: it.tags ?? [],
      optionGroups: (it.options ?? []).map(templateGroup).filter((g): g is NonNullable<typeof g> => !!g),
      combo: it.combo
        ? {
            slots: it.combo.map((s, k) => ({
              id: `slot${k + 1}`,
              name: s.name,
              choices: s.choices.filter(([n]) => itemIds.has(n)).map(([n, upcharge]) => ({ itemId: itemIds.get(n)!, upcharge })),
            })),
          }
        : undefined,
      status: it.status ?? 'available',
      schedule: it.schedule,
      position,
    })
    itemIds.set(it.name, created.id)
    createdItems.set(it.name, created)
  }
  for (const s of def.menu) for (let i = 0; i < s.items.length; i++) if (!s.items[i].combo) await make(s.section, s.items[i], i)
  for (const s of def.menu) for (let i = 0; i < s.items.length; i++) if (s.items[i].combo) await make(s.section, s.items[i], i)
  // Costing: ingredients, recipes (option choices matched by name) and running costs.
  const ingIds = new Map<string, number>()
  for (const [name, unit, costPerUnit, stock, lowStockAt, purchaseUnit, perPurchase] of def.ingredients ?? []) {
    const ing = await create('ingredients', {
      restaurantId: restaurant.id,
      name,
      unit,
      costPerUnit,
      stock,
      lowStockAt,
      purchaseUnit,
      perPurchase,
    })
    ingIds.set(name, ing.id)
  }
  const lines = (ls: [string, number][]) =>
    ls.filter(([n]) => ingIds.has(n)).map(([n, quantity]) => ({ ingredientId: ingIds.get(n)!, quantity }))
  for (const [itemName, rec] of Object.entries(def.recipes ?? {})) {
    const item = createdItems.get(itemName)
    if (!item) continue
    // Option ids are generated per item: find each choice by name on the created item.
    const choices: Record<string, { ingredientId: number; quantity: number }[]> = {}
    for (const [choiceName, ls] of Object.entries(rec.choices ?? {})) {
      const id = item.optionGroups.flatMap((g) => g.choices).find((c) => c.name === choiceName)?.id
      if (id) choices[id] = lines(ls)
    }
    await create('recipes', { restaurantId: restaurant.id, itemId: item.id, ingredients: lines(rec.base), choices })
  }
  for (const pk of def.packaging ?? []) {
    await create('packaging', {
      restaurantId: restaurant.id,
      name: pk.name,
      when: pk.when,
      per: pk.per,
      ingredients: lines(pk.lines),
      active: true,
    })
  }
  const monthStart = new Date()
  for (const [category, amount, note] of def.expenses ?? []) {
    await create('expenses', {
      restaurantId: restaurant.id,
      category,
      amount,
      note,
      date: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`,
    })
  }
  for (const p of def.promotions) {
    await create('promotions', {
      restaurantId: restaurant.id,
      name: p.name,
      description: p.description,
      percentOff: p.percentOff,
      schedule: p.schedule,
      categoryIds: p.sections.map((s) => sectionIds.get(s)!).filter(Boolean),
      itemIds: [],
      active: true,
    })
  }
  return restaurant
}

// ── Local (browser) ──────────────────────────────────────────────────────────

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export const DEMO_SCOPE = 'demo'
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = (n: number) => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

export const createLocalSource = (
  // The signed-in business; null for anonymous customers.
  scope: string | null,
  storage: StorageLike | null = typeof window === 'undefined' ? null : window.localStorage,
  clock: () => Date = () => new Date()
): EaterySource => {
  const key = (r: ResourceName) => `sellix-eatery:v1:${r}`
  const read = <R extends ResourceName>(r: R): ResourceMap[R][] => {
    try {
      const raw = storage?.getItem(key(r))
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }
  const write = (r: ResourceName, rows: unknown[]) => {
    try {
      storage?.setItem(key(r), JSON.stringify(rows))
    } catch {
      // Usually the browser's storage quota (photos are the big items).
      throw httpError(507, 'This browser is out of space for Sellix data — use smaller photos or image links instead of uploads')
    }
  }
  const nextId = (rows: { id: number }[]) => rows.reduce((m, x) => Math.max(m, x.id), 0) + 1

  // Raw insert, no ownership checks (seeding).
  const insert: Creator = async (r, body) => {
    const rows = read(r)
    const row = { ...(body as object), id: nextId(rows as { id: number }[]) } as ResourceMap[typeof r]
    write(r, [...rows, row])
    return row
  }

  // The examples appear in the directory the first time anyone opens it.
  let seeding: Promise<void> | null = null
  const ensureSeed = async () => {
    if (read('restaurants').length > 0 || storage?.getItem('sellix-eatery:v1:seeded')) return
    seeding ??= (async () => {
      for (const def of DEMO_RESTAURANTS) {
        const r = await materializeDemo(def, insert)
        write(
          'restaurants',
          read('restaurants').map((x) => (x.id === r.id ? { ...x, ownerScope: DEMO_SCOPE } : x))
        )
      }
      storage?.setItem('sellix-eatery:v1:seeded', '1')
    })()
    await seeding
  }

  const owned = () =>
    new Set(
      read('restaurants')
        .filter((r) => r.ownerScope === scope)
        .map((r) => r.id)
    )
  const requireOwner = () => {
    if (!scope) throw httpError(401, 'Sign in to manage restaurants')
  }
  const belongs = (r: ResourceName, row: any, ids = owned()) => (r === 'restaurants' ? row.ownerScope === scope : ids.has(row.restaurantId))

  const bundleFor = (restaurant: Restaurant): StorefrontBundle => ({
    restaurant,
    categories: read('categories')
      .filter((c) => c.restaurantId === restaurant.id)
      .sort((a, b) => a.position - b.position),
    items: read('items')
      .filter((i) => i.restaurantId === restaurant.id && i.status !== 'hidden')
      .sort((a, b) => a.position - b.position),
    promotions: read('promotions').filter((p) => p.restaurantId === restaurant.id && p.active),
  })

  // ── Stock (mirrors BACKEND_REQUIREMENTS §7.5) ──
  const round2 = (n: number) => Math.round(n * 100) / 100
  const round4 = (n: number) => Math.round(n * 10000) / 10000
  const ACTIVE: OrderStatus[] = ['accepted', 'preparing', 'ready', 'out-for-delivery', 'completed']
  const recipesFor = (restaurantId: number) =>
    new Map(
      read('recipes')
        .filter((x) => x.restaurantId === restaurantId)
        .map((x) => [x.itemId, x])
    )

  // Takes an order's ingredients out of stock at today's average cost and
  // records what each line cost.
  const deductStock = (order: Order): Partial<Order> => {
    const recipes = recipesFor(order.restaurantId)
    const ings = read('ingredients')
    const byId = new Map(ings.map((i) => [i.id, i]))
    const total = new Map<number, number>()
    const lines = order.lines.map((l) => {
      const per = lineUsage({ ...l, quantity: 1 }, recipes)
      per.forEach((q, id) => total.set(id, (total.get(id) ?? 0) + q * l.quantity))
      return { ...l, unitCost: usageCost(per, byId) }
    })
    // Tissue, boxes, bags… from packaging rules: counted on the order, not a line.
    const packaging = packagingUsage(
      order,
      read('packaging').filter((x) => x.restaurantId === order.restaurantId)
    )
    packaging.forEach((q, id) => total.set(id, (total.get(id) ?? 0) + q))
    const packagingCost = usageCost(packaging, byId)
    const at = clock().toISOString()
    const moves = read('stockMoves')
    let mid = nextId(moves)
    total.forEach((q, id) => {
      const ing = byId.get(id)
      if (!ing || Math.abs(q) < 1e-9) return
      moves.push({
        id: mid++,
        restaurantId: order.restaurantId,
        ingredientId: id,
        type: 'usage',
        quantity: -round4(q),
        totalCost: round2(q * ing.costPerUnit),
        date: at,
        orderId: order.id,
      })
      ing.stock = round4(ing.stock - q)
    })
    write('ingredients', ings)
    write('stockMoves', moves)
    return {
      lines,
      stockDeducted: true,
      costOfGoods: round2(lines.reduce((s, l) => s + (l.unitCost ?? 0) * l.quantity, 0) + packagingCost),
    }
  }

  // A cancelled order puts its ingredients back.
  const restoreStock = (order: Order): Partial<Order> => {
    const ings = read('ingredients')
    const byId = new Map(ings.map((i) => [i.id, i]))
    const moves = read('stockMoves')
    let mid = nextId(moves)
    const at = clock().toISOString()
    for (const m of moves.filter((x) => x.orderId === order.id && x.type === 'usage')) {
      const ing = byId.get(m.ingredientId)
      if (ing) ing.stock = round4(ing.stock - m.quantity)
      moves.push({ ...m, id: mid++, type: 'return', quantity: -m.quantity, totalCost: -m.totalCost, date: at })
    }
    write('ingredients', ings)
    write('stockMoves', moves)
    return { stockDeducted: false }
  }

  // Purchases, waste and stock counts change the ingredient; the movement is the record.
  const recordStock = (body: Omit<StockMove, 'id'>): StockMove => {
    const ings = read('ingredients')
    const ing = ings.find((i) => i.id === body.ingredientId && i.restaurantId === body.restaurantId)
    if (!ing) throw httpError(422, 'unknown ingredientId')
    const q = Number(body.quantity)
    if (!Number.isFinite(q) || (body.type !== 'count' && q <= 0) || q < 0) throw httpError(422, 'Enter a quantity above zero')
    let move: Omit<StockMove, 'id'>
    if (body.type === 'purchase') {
      const cost = Math.max(0, Number(body.totalCost) || 0)
      ing.costPerUnit = averageCost(ing, q, cost)
      ing.stock = round4(ing.stock + q)
      if (body.supplier) ing.supplier = body.supplier
      move = { ...body, quantity: q, totalCost: round2(cost) }
    } else if (body.type === 'waste') {
      ing.stock = round4(ing.stock - q)
      move = { ...body, quantity: -q, totalCost: round2(q * ing.costPerUnit) }
    } else if (body.type === 'count') {
      const diff = round4(q - ing.stock)
      ing.stock = round4(q)
      move = { ...body, quantity: diff, totalCost: round2(diff * ing.costPerUnit) }
    } else {
      throw httpError(422, 'Usage is recorded from orders')
    }
    write('ingredients', ings)
    const moves = read('stockMoves')
    const row = { ...move, id: nextId(moves), date: body.date || clock().toISOString() } as StockMove
    write('stockMoves', [...moves, row])
    return row
  }

  const newCode = (restaurantId: number) => {
    const taken = new Set(
      read('orders')
        .filter((o) => o.restaurantId === restaurantId)
        .map((o) => o.code)
    )
    let code = randomCode(4)
    while (taken.has(code)) code = randomCode(4)
    return code
  }

  // Mirrors what the backend does on delete (BACKEND_REQUIREMENTS §7).
  const cascade = (r: ResourceName, id: number) => {
    if (r === 'restaurants') {
      for (const res of [
        'categories',
        'items',
        'promotions',
        'orders',
        'ingredients',
        'recipes',
        'stockMoves',
        'expenses',
        'packaging',
      ] as const)
        write(
          res,
          read(res).filter((x: any) => x.restaurantId !== id)
        )
    } else if (r === 'categories') {
      const gone = new Set(
        read('items')
          .filter((i) => i.categoryId === id)
          .map((i) => i.id)
      )
      write(
        'items',
        read('items').filter((i) => i.categoryId !== id)
      )
      gone.forEach((itemId) => cascade('items', itemId))
      write(
        'promotions',
        read('promotions').map((p) => ({ ...p, categoryIds: p.categoryIds.filter((c) => c !== id) }))
      )
    } else if (r === 'items') {
      write(
        'recipes',
        read('recipes').filter((x) => x.itemId !== id)
      )
      write(
        'promotions',
        read('promotions').map((p) => ({ ...p, itemIds: p.itemIds.filter((x) => x !== id) }))
      )
      // Drop the item from any combo that offered it.
      write(
        'items',
        read('items').map((i) =>
          i.combo ? { ...i, combo: { slots: i.combo.slots.map((s) => ({ ...s, choices: s.choices.filter((c) => c.itemId !== id) })) } } : i
        )
      )
    }
  }

  return {
    kind: 'local',

    directory: async () => {
      await ensureSeed()
      const promos = read('promotions')
      const items = read('items')
      const cats = read('categories')
      return read('restaurants').map((r) => ({
        ...r,
        promotions: promos
          .filter((p) => p.restaurantId === r.id && p.active)
          .map(({ name, percentOff, schedule, active, description }) => ({ name, percentOff, schedule, active, description })),
        menu: [
          ...cats.filter((c) => c.restaurantId === r.id).map((c) => c.name),
          ...items.filter((i) => i.restaurantId === r.id && i.status !== 'hidden').map((i) => i.name),
        ],
      }))
    },

    storefront: async (slug) => {
      await ensureSeed()
      const r = read('restaurants').find((x) => x.slug === slug)
      return r ? bundleFor(r) : null
    },

    placeOrder: async (slug, input) => {
      const restaurant = read('restaurants').find((x) => x.slug === slug)
      if (!restaurant) throw httpError(404, 'not found')
      const now = clock()
      if (!restaurant.acceptingOrders) throw httpError(409, `${restaurant.name} isn’t taking orders right now`)
      if (!openState(restaurant.hours, now).open) throw httpError(409, `${restaurant.name} is closed right now`)
      const f = input.fulfilment
      if (f.type === 'delivery' && !f.address?.trim()) throw httpError(422, 'Add a delivery address')
      if (f.type === 'dine-in' && !restaurant.fulfilment.dineIn.tables.includes(f.table ?? '')) throw httpError(422, 'Choose your table')
      // Name and phone are optional ("Guest"); delivery needs a reachable phone.
      const digits = (input.customer.phone ?? '').replace(/\D/g, '').length
      if (f.type === 'delivery' && digits === 0) throw httpError(422, 'Add a phone number so the rider can reach you')
      if (digits > 0 && digits < 9) throw httpError(422, 'That phone number looks too short')
      const method = input.payment.method
      const pay = restaurant.payments
      if (
        (method === 'cash' && !pay.cash) ||
        (method === 'momo' && !pay.momo.enabled) ||
        (method === 'pay-at-table' && (!pay.payAtTable || f.type !== 'dine-in'))
      )
        throw httpError(422, 'That payment method isn’t available')

      const priced = priceOrder(bundleFor(restaurant), input.lines, f.type, now)
      if (priced.problems.length) throw httpError(422, priced.problems[0])

      const orders = read('orders')
      const code = newCode(restaurant.id)
      const at = now.toISOString()
      const order: Order & { accessKey: string } = {
        id: nextId(orders),
        code,
        accessKey: randomCode(16),
        restaurantId: restaurant.id,
        createdAt: at,
        updatedAt: at,
        customer: { name: input.customer.name?.trim() || 'Guest', phone: input.customer.phone?.trim() ?? '' },
        fulfilment: f,
        payment: {
          method,
          status: method === 'momo' && input.payment.reference?.trim() ? 'pending' : 'unpaid',
          reference: input.payment.reference?.trim() || undefined,
        },
        lines: priced.lines,
        subtotal: priced.subtotal,
        discount: priced.discount,
        deliveryFee: priced.deliveryFee,
        total: priced.total,
        status: 'placed',
        history: [{ status: 'placed', at }],
        notes: input.notes?.trim() || undefined,
        channel: 'online',
      }
      write('orders', [...orders, order])
      return order
    },

    // Local mode keeps the (already small) image inline as a data URL.
    uploadImage: async (restaurantId, image) => {
      requireOwner()
      if (!owned().has(restaurantId)) throw httpError(404, 'not found')
      if (image.size > 900 * 1024) throw httpError(413, 'That image is too large to keep in this browser')
      return blobToDataUrl(image)
    },

    createCounterOrder: async (restaurantId, input) => {
      requireOwner()
      const restaurant = read('restaurants').find((x) => x.id === restaurantId && x.ownerScope === scope)
      if (!restaurant) throw httpError(404, 'not found')
      const now = clock()
      // Staff are there: no opening-hours or delivery checks, only the menu's.
      const priced = priceOrder(bundleFor(restaurant), input.lines, null, now)
      if (priced.problems.length) throw httpError(422, priced.problems[0])
      const at = now.toISOString()
      const orders = read('orders')
      const draft: Order & { accessKey: string } = {
        id: nextId(orders),
        code: newCode(restaurant.id),
        accessKey: randomCode(16),
        restaurantId: restaurant.id,
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
      write('orders', [...orders, draft])
      const order = { ...draft, ...deductStock(draft) }
      write(
        'orders',
        read('orders').map((o) => (o.id === order.id ? order : o))
      )
      return order
    },

    trackOrder: async (t) => {
      const restaurant = read('restaurants').find((x) => x.slug === t.slug)
      const order = restaurant && read('orders').find((o) => o.restaurantId === restaurant.id && o.code === t.code)
      if (!order || (order as Order & { accessKey?: string }).accessKey !== t.accessKey) return null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { accessKey, ...rest } = order as Order & { accessKey?: string }
      return rest
    },

    list: async (r) => {
      requireOwner()
      const ids = owned()
      return read(r).filter((row) => belongs(r, row, ids))
    },

    create: async (r, body) => {
      requireOwner()
      if (r === 'restaurants') {
        const slug = (body as unknown as Restaurant).slug
        if (read('restaurants').some((x) => x.slug === slug)) throw httpError(409, `The address /eat/${slug} is taken — try another`)
        return insert(r, { ...(body as object), ownerScope: scope } as unknown as Draft<typeof r>)
      }
      if (!owned().has((body as unknown as { restaurantId: number }).restaurantId)) throw httpError(422, 'unknown restaurantId')
      if (r === 'stockMoves') return recordStock(body as unknown as Omit<StockMove, 'id'>) as ResourceMap[typeof r]
      if (r === 'ingredients') {
        const b = body as unknown as Ingredient
        if (!b.name?.trim()) throw httpError(422, 'Give the ingredient a name')
        if (
          read('ingredients').some((i) => i.restaurantId === b.restaurantId && i.name.trim().toLowerCase() === b.name.trim().toLowerCase())
        )
          throw httpError(409, `You already have “${b.name.trim()}”`)
      }
      if (r === 'recipes') {
        const itemId = (body as unknown as { itemId: number }).itemId
        if (read('recipes').some((x) => x.itemId === itemId)) throw httpError(409, 'That item already has a recipe — edit it instead')
      }
      return insert(r, body)
    },

    update: async (r, id, body) => {
      requireOwner()
      const rows = read(r)
      const idx = rows.findIndex((x) => x.id === id && belongs(r, x))
      if (idx === -1) throw httpError(404, 'not found')
      if (r === 'restaurants') {
        const slug = (body as Partial<Restaurant>).slug
        if (slug && read('restaurants').some((x) => x.slug === slug && x.id !== id))
          throw httpError(409, `The address /eat/${slug} is taken — try another`)
      }
      // Changing how an ingredient is counted (packs → pieces, kg → g): `rescale`
      // converts its stock and every recipe/packaging quantity using it.
      const { rescale, ...patch } = body as { rescale?: number }
      const row = { ...rows[idx], ...(patch as object), id } as ResourceMap[typeof r]
      if (r === 'ingredients' && rescale && rescale !== 1) {
        const ing = row as Ingredient
        ing.stock = round4((rows[idx] as Ingredient).stock * rescale)
        const scaleLines = (ls: RecipeLine[]) =>
          ls.map((l) => (l.ingredientId === id ? { ...l, quantity: round4(l.quantity * rescale) } : l))
        write(
          'recipes',
          read('recipes').map((x) => ({
            ...x,
            ingredients: scaleLines(x.ingredients),
            choices: Object.fromEntries(Object.entries(x.choices).map(([k, ls]) => [k, scaleLines(ls)])),
          }))
        )
        write(
          'packaging',
          read('packaging').map((x) => ({ ...x, ingredients: scaleLines(x.ingredients) }))
        )
      }
      if (r === 'restaurants') (row as Restaurant).ownerScope = scope!
      if (r === 'stockMoves') throw httpError(422, 'Stock movements can’t be edited — record a count instead')
      if (r === 'orders') {
        const prev = rows[idx] as Order
        const next = row as Order
        next.updatedAt = clock().toISOString()
        if (next.status !== prev.status) next.history = [...prev.history, { status: next.status, at: next.updatedAt }]
        // Ingredients leave stock once an order is accepted, and come back if it's cancelled.
        if (!prev.stockDeducted && ACTIVE.includes(next.status)) Object.assign(next, deductStock(next))
        else if (prev.stockDeducted && next.status === 'cancelled') Object.assign(next, restoreStock(next))
      }
      rows[idx] = row
      write(r, rows)
      return row
    },

    remove: async (r, id) => {
      requireOwner()
      const rows = read(r)
      if (!rows.some((x) => x.id === id && belongs(r, x))) throw httpError(404, 'not found')
      if (r === 'stockMoves') throw httpError(422, 'Stock movements can’t be deleted — record a count instead')
      if (r === 'ingredients') {
        const used = read('recipes').filter(
          (x) =>
            x.ingredients.some((l) => l.ingredientId === id) || Object.values(x.choices).some((ls) => ls.some((l) => l.ingredientId === id))
        )
        if (used.length) throw httpError(409, `Used in ${used.length} recipe${used.length === 1 ? '' : 's'} — take it out of them first`)
        const packs = read('packaging').filter((x) => x.ingredients.some((l) => l.ingredientId === id))
        if (packs.length) throw httpError(409, `Used in packaging (“${packs[0].name}”) — take it out first`)
      }
      write(
        r,
        rows.filter((x) => x.id !== id)
      )
      cascade(r, id)
    },

    claimDemo: async () => {
      requireOwner()
      await ensureSeed()
      const demos = read('restaurants').filter((x) => x.ownerScope === DEMO_SCOPE)
      if (demos.length) {
        write(
          'restaurants',
          read('restaurants').map((x) => (x.ownerScope === DEMO_SCOPE ? { ...x, ownerScope: scope! } : x))
        )
        return demos.map((d) => ({ ...d, ownerScope: scope! }))
      }
      // Already claimed by someone else in this browser: make fresh copies.
      const out: Restaurant[] = []
      for (const def of DEMO_RESTAURANTS) {
        let slug = def.restaurant.slug
        for (let n = 2; read('restaurants').some((x) => x.slug === slug); n++) slug = `${def.restaurant.slug}-${n}`
        const r = await materializeDemo(def, insert, slug)
        write(
          'restaurants',
          read('restaurants').map((x) => (x.id === r.id ? { ...x, ownerScope: scope! } : x))
        )
        out.push({ ...r, ownerScope: scope! })
      }
      return out
    },
  }
}
