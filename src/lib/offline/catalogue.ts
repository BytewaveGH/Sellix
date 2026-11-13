// Keeps what a till sells from on the PC up to date, so it's current when the
// internet goes (BACKEND_REQUIREMENTS §13.3): only what changed since the last
// sync is downloaded, then folded into the kept answers the screens read.
//   retail: GET /sync/changes         — products, stock, warehouses
//   eatery: GET /eatery/sync/changes  — restaurants and their menus

import { apiStatus } from '../api-error'
import { cachedRead, getKept, mergeIntoReads, patchKeptReads, saveRead, setKept } from './engine'
import { listIn, listsCollection, withList } from './rules'

// One page of changes (the response's `data`).
export type Get = (url: string, params: Record<string, unknown>) => Promise<any>

type Row = Record<string, unknown>
const ids = (v: unknown) => new Set((Array.isArray(v) ? v : []).map(Number))
const rows = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : [])

// A list the screens haven't loaded yet on this device: keep the first full
// download under the same request they make, so they find it offline.
const seed = async (scope: string, req: { url: string; params?: Record<string, unknown> }, list: Row[]) => {
  if (!(await cachedRead(scope, req))) await saveRead(scope, req, { status: true, data: list })
}

// The till's request for its products (pos/_widgets/main.tsx) and warehouses.
const POS_PRODUCTS = { url: '/products/', params: { limit: 1000, offset: 0 } }
const WAREHOUSES = { url: '/warehouses/' }

// ── Retail ───────────────────────────────────────────────────────────────────

const applyStock = (scope: string, stock: Row[], deletedUnits: Set<number>) =>
  patchKeptReads(scope, (key, body) => {
    if (!listsCollection(key, '/products') || (!stock.length && !deletedUnits.size)) return undefined
    const list = listIn(body)
    if (!list) return undefined
    const byProduct = new Map<number, Row[]>()
    for (const s of stock) byProduct.set(Number(s.productId), [...(byProduct.get(Number(s.productId)) ?? []), s])
    return withList(
      body,
      list.map((p) => {
        let next: Row = p
        const units = p.units
        if (deletedUnits.size && Array.isArray(units)) next = { ...next, units: units.filter((u: Row) => !deletedUnits.has(Number(u.id))) }
        const changes = byProduct.get(Number(p.id))
        if (changes) {
          const stockRows = Array.isArray(p.stock) ? [...(p.stock as Row[])] : []
          for (const c of changes) {
            const at = stockRows.findIndex((s) => Number(s.warehouseId) === Number(c.warehouseId))
            const row = { ...(at >= 0 ? stockRows[at] : {}), warehouseId: c.warehouseId, quantity: c.quantity }
            if (at >= 0) stockRows[at] = row
            else stockRows.push(row)
          }
          next = { ...next, stock: stockRows, totalQuantity: stockRows.reduce((n, s) => n + (Number(s.quantity) || 0), 0) }
        }
        return next
      })
    )
  }, (key) => listsCollection(key, '/products'))

const applyRetailPage = async (scope: string, page: any, first: boolean) => {
  const products = rows(page?.products)
  const deleted = page?.deleted ?? {}
  const goneProducts = ids(deleted.products)
  if (first && !(await getKept(scope, 'retail-cursor'))) await seed(scope, POS_PRODUCTS, products)
  await mergeIntoReads(scope, '/products', products, (r) => goneProducts.has(Number(r.id)))
  await applyStock(scope, rows(page?.stock), ids(deleted.productUnits))
  const warehouses = rows(page?.warehouses)
  const goneWarehouses = ids(deleted.warehouses)
  if (first && !(await getKept(scope, 'retail-cursor'))) await seed(scope, WAREHOUSES, warehouses)
  if (warehouses.length || goneWarehouses.size) await mergeIntoReads(scope, '/warehouses', warehouses, (r) => goneWarehouses.has(Number(r.id)))
  // Store settings are kept on each device in this app (lib/store/settings), not read from the server.
}

const MAX_PAGES = 200

export const syncRetailCatalogue = async (scope: string, get: Get) => {
  const run = async (since?: string) => {
    const first = await get('/sync/changes', since ? { since } : {})
    await applyRetailPage(scope, first, true)
    let page = first
    for (let n = 0; page?.hasMore && n < MAX_PAGES; n++) {
      page = await get('/sync/changes', { ...(since ? { since } : {}), after: page.nextAfter, cursor: first.cursor })
      await applyRetailPage(scope, page, false)
    }
    // Only once every page is in: next time starts from here.
    if (first?.cursor) await setKept(scope, 'retail-cursor', first.cursor)
  }
  const since = await getKept<string>(scope, 'retail-cursor')
  try {
    await run(since)
  } catch (err) {
    // A cursor the server no longer accepts: start again with everything.
    if (!since || apiStatus(err) !== 400) throw err
    await setKept(scope, 'retail-cursor', undefined)
    await run()
  }
}

// ── Eatery ───────────────────────────────────────────────────────────────────

const MENU: { key: string; path: string }[] = [
  { key: 'restaurants', path: '/eatery/restaurants' },
  { key: 'menuCategories', path: '/eatery/menu-categories' },
  { key: 'menuItems', path: '/eatery/menu-items' },
  { key: 'promotions', path: '/eatery/promotions' },
]

export const syncEateryMenu = async (scope: string, get: Get) => {
  const run = async (since?: string) => {
    const page = await get('/eatery/sync/changes', since ? { since } : {})
    const deleted = page?.deleted ?? {}
    // A deleted restaurant takes its whole menu with it.
    const goneRestaurants = ids(deleted.restaurants)
    for (const { key, path } of MENU) {
      const changed = rows(page?.[key])
      const gone = ids(deleted[key])
      if (!since) await seed(scope, { url: `${path}/` }, changed)
      await mergeIntoReads(
        scope,
        path,
        changed,
        (r) => gone.has(Number(r.id)) || (key === 'restaurants' ? goneRestaurants.has(Number(r.id)) : goneRestaurants.has(Number(r.restaurantId)))
      )
    }
    if (page?.cursor) await setKept(scope, 'eatery-cursor', page.cursor)
  }
  const since = await getKept<string>(scope, 'eatery-cursor')
  try {
    await run(since)
  } catch (err) {
    if (!since || apiStatus(err) !== 400) throw err
    await setKept(scope, 'eatery-cursor', undefined)
    await run()
  }
}
