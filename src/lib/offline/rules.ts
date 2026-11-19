// What working offline means for one API request. Pure, for tests.
//
// Reads: the last answer is kept per business and user, and given back while
// the server can't be reached.
// Writes: kept on this device and sent in order once the connection is back.
// Until then, cached lists show them (a new row, an edit, a removal), so every
// module keeps working on what it has.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestLike = {
  method?: string
  url?: string
  baseURL?: string
  params?: Record<string, unknown>
  data?: unknown
}

// Requests that must reach the server, or make no sense later: signing in,
// public pages, platform admin, payments and billing.
const ONLINE_ONLY = /^\/(auth|public|platform|super-admin|admin|billing|subscriptions?|payments?)(\/|$)/

// The request's path without the API's base address, query or trailing slash.
export const pathOf = (r: RequestLike) => {
  let url = r.url ?? ''
  if (r.baseURL && url.startsWith(r.baseURL)) url = url.slice(r.baseURL.length)
  try {
    if (/^https?:\/\//.test(url)) url = new URL(url).pathname
  } catch {
    // keep as is
  }
  url = url.split('?')[0].split('#')[0]
  if (!url.startsWith('/')) url = '/' + url
  return url.length > 1 ? url.replace(/\/+$/, '') : url
}

const sortedParams = (params?: Record<string, unknown>) => {
  if (!params) return ''
  const keys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
  return keys.length ? '?' + keys.map((k) => `${k}=${JSON.stringify(params[k])}`).join('&') : ''
}

// One cached answer per path + query. Query parameters inside `url` count too.
export const readKey = (r: RequestLike) => {
  const inline = (r.url ?? '').split('?')[1]
  const merged = { ...Object.fromEntries(new URLSearchParams(inline ?? '')), ...(r.params ?? {}) }
  return pathOf(r) + sortedParams(merged)
}

export const methodOf = (r: RequestLike) => (r.method ?? 'get').toUpperCase() as Method

const isBinary = (data: unknown) =>
  (typeof FormData !== 'undefined' && data instanceof FormData) ||
  (typeof Blob !== 'undefined' && data instanceof Blob) ||
  (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer)

// Reads that always come from the server: signing in, public pages, platform
// admin, billing.
export const cannotKeepRead = (r: RequestLike) => ONLINE_ONLY.test(pathOf(r))

// Why a write can't wait for the connection, or null if it can.
export const cannotQueue = (r: RequestLike): string | null => {
  const path = pathOf(r)
  if (ONLINE_ONLY.test(path)) return 'This needs the internet.'
  if (isBinary(r.data)) return 'Photos and files need the internet to upload.'
  if (/(^|\/)(uploads?|files?|images?|photos?|documents\/upload)(\/|$)/.test(path)) return 'Photos and files need the internet to upload.'
  // A link someone else will open has to come from the server.
  if (/(^|\/)share-link(\/|$)/.test(path)) return 'Sharing a link needs the internet.'
  return null
}

const isId = (s: string) => /^-?\d+$/.test(s)

export type WriteShape =
  // POST /things → a new row in GET /things
  | { kind: 'create'; collection: string }
  // PUT|PATCH /things/12 → that row changes
  | { kind: 'update'; collection: string; id: number }
  // DELETE /things/12 → that row goes
  | { kind: 'delete'; collection: string; id: number }
  // Anything else (an action like /orders/12/refund): sent later, nothing shown early.
  | { kind: 'action' }

export const writeShape = (r: RequestLike): WriteShape => {
  const method = methodOf(r)
  const path = pathOf(r)
  const parts = path.split('/')
  const last = parts[parts.length - 1]
  const collection = parts.slice(0, -1).join('/') || '/'
  if (method === 'POST') return isId(last) ? { kind: 'action' } : { kind: 'create', collection: path }
  if ((method === 'PUT' || method === 'PATCH') && isId(last)) return { kind: 'update', collection, id: Number(last) }
  if (method === 'DELETE' && isId(last)) return { kind: 'delete', collection, id: Number(last) }
  return { kind: 'action' }
}

// ── Temporary ids ────────────────────────────────────────────────────────────
// A row made offline gets a negative id until the server gives it a real one;
// later changes to it are rewritten before they're sent.

let lastTemp = 0
export const newTempId = () => {
  // Negative, unique on this device, and far from anything a server hands out.
  const t = -(Date.now() % 1_000_000_000) * 100
  lastTemp = t < lastTemp ? t : lastTemp - 1
  return lastTemp
}

export const isTempId = (v: unknown): v is number => typeof v === 'number' && v < 0 && Number.isInteger(v)

// Every temporary id the request mentions (in its path or body).
export const tempIdsIn = (r: { url?: string; data?: unknown }): number[] => {
  const found = new Set<number>()
  const inUrl = /\/(-\d+)(?=\/|$|\?)/g
  for (let m = inUrl.exec(r.url ?? ''); m; m = inUrl.exec(r.url ?? '')) found.add(Number(m[1]))
  const walk = (v: unknown) => {
    if (isTempId(v)) found.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(r.data)
  return Array.from(found)
}

// Swap a temporary id for the real one everywhere in a request.
export const replaceId = <T extends { url?: string; data?: unknown }>(r: T, temp: number, real: number): T => {
  const swap = (v: unknown): unknown =>
    v === temp ? real : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v
  const url = (r.url ?? '').replace(new RegExp(`/${temp}(?=/|$|\\?)`, 'g'), `/${real}`)
  return { ...r, url, data: swap(r.data) }
}

// ── Cached lists ─────────────────────────────────────────────────────────────
// Answers come as [..], { data: [..] }, or { data: { data: [..], count } }.

type Row = { id?: unknown } & Record<string, unknown>

export const listIn = (body: unknown): Row[] | null => {
  if (Array.isArray(body)) return body
  const b = body as { data?: unknown } | null
  if (Array.isArray(b?.data)) return b!.data as Row[]
  const d = b?.data as { data?: unknown } | null | undefined
  if (Array.isArray(d?.data)) return d!.data as Row[]
  return null
}

// The same answer with its list replaced (and any count kept right).
export const withList = (body: unknown, rows: Row[]): unknown => {
  const delta = (before: Row[] | null) => rows.length - (before?.length ?? 0)
  const count = (o: Record<string, unknown>, before: Row[] | null) =>
    typeof o.count === 'number' ? { count: o.count + delta(before) } : typeof o.total === 'number' ? { total: o.total + delta(before) } : {}
  if (Array.isArray(body)) return rows
  const b = body as Record<string, unknown>
  if (Array.isArray(b?.data)) return { ...b, data: rows, ...count(b, b.data as Row[]) }
  const d = b?.data as Record<string, unknown> | undefined
  if (d && Array.isArray(d.data)) return { ...b, data: { ...d, data: rows, ...count(d, d.data as Row[]) } }
  return body
}

// The row an answer carries ({ data: row } or the row itself).
export const rowIn = (body: unknown): Row | null => {
  const b = body as { data?: unknown } | null
  const inner = b && typeof b === 'object' && 'data' in b ? b.data : body
  return inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Row) : null
}

export type Change =
  | { kind: 'create'; row: Row }
  | { kind: 'update'; id: number; patch: Record<string, unknown> }
  | { kind: 'delete'; id: number }

export const applyToList = (rows: Row[], change: Change): Row[] => {
  if (change.kind === 'create') return [change.row, ...rows.filter((r) => r.id !== change.row.id)]
  if (change.kind === 'update') return rows.map((r) => (Number(r.id) === change.id ? { ...r, ...change.patch, id: r.id } : r))
  return rows.filter((r) => Number(r.id) !== change.id)
}

// Does a cached read at `key` list the `collection`? (Any query: page, search…)
export const listsCollection = (key: string, collection: string) => key === collection || key.startsWith(collection + '?')

// A short description of a waiting change, for the sync list.
export const describeWrite = (r: RequestLike): string => {
  const shape = writeShape(r)
  const path = pathOf(r)
  const noun = (p: string) =>
    (p.split('/').filter((s) => s && !isId(s)).pop() ?? 'item')
      .replace(/[-_]/g, ' ')
      .replace(/ies$/, 'y')
      .replace(/s$/, '')
  const body = (r.data ?? {}) as Record<string, unknown>
  const name = typeof body.name === 'string' ? ` “${body.name}”` : ''
  if (shape.kind === 'create') return `New ${noun(path)}${name}`
  if (shape.kind === 'update') return `Change to ${noun(shape.collection)}${name || ` #${shape.id}`}`
  if (shape.kind === 'delete') return `Delete ${noun(shape.collection)} #${shape.id}`
  return `${methodOf(r)} ${path}`
}

// ── Sending many at once ─────────────────────────────────────────────────────
// Till sales and counter orders made offline go up to 200 per request
// (BACKEND_REQUIREMENTS §13.2). Each carries its own clientId, so a batch can
// be sent again safely: what's already recorded comes back as "duplicate".

export type Batch = { path: string; url: string; key: string }

export const BATCHES: Batch[] = [
  { path: '/sales', url: '/sync/sales', key: 'sales' },
  { path: '/eatery/orders/counter', url: '/eatery/sync/orders', key: 'orders' },
]

export const BATCH_SIZE = 200

export const batchFor = (r: RequestLike): Batch | null => {
  if (methodOf(r) !== 'POST') return null
  const clientId = (r.data as { clientId?: unknown } | null)?.clientId
  if (typeof clientId !== 'string' || !clientId) return null
  return BATCHES.find((b) => b.path === pathOf(r)) ?? null
}

export type BatchResult = { clientId: string; status: 'created' | 'duplicate' | 'rejected'; id?: number; code?: string; message?: string }

// `{ status, data: { results } }`, or a bare `{ results }`.
export const batchResults = (body: unknown): BatchResult[] => {
  const b = body as { data?: { results?: unknown }; results?: unknown } | null
  const list = b?.data?.results ?? b?.results
  return Array.isArray(list) ? (list as BatchResult[]) : []
}

// What staff read when the server refuses a sale or order. The server names a
// deleted unit or menu item only by id, so the name saved on the till is used.
export const refusalMessage = (code: string | undefined, message: string, names: Record<string, string> = {}) => {
  if (code === 'product_unit_deleted' || code === 'menu_item_deleted') {
    const id = /(\d+)/.exec(message)?.[1]
    const name = id ? names[id] : undefined
    const where = code === 'menu_item_deleted' ? 'menu' : 'catalogue'
    return name ? `“${name}” is no longer in the ${where}.` : message
  }
  if (code === 'bad_sale_time') return `The time on this sale was refused — check this PC’s date and time are right. (${message})`
  if (code === 'warehouse_deleted') return `The warehouse for this sale was deleted. (${message})`
  if (code === 'restaurant_not_found') return `The restaurant for this order was deleted. (${message})`
  return message
}

// ── Server changes into kept lists (§13.3) ───────────────────────────────────

// A list holding the whole collection (not a search or a later page): new rows
// from the server belong in it.
export const isFullList = (key: string) => {
  const query = key.split('?')[1]
  if (!query) return true
  return query.split('&').every((p) => /^limit=/.test(p) || p === 'offset=0')
}

// Replace rows the server changed, add new ones to full lists, drop deleted ones.
export const mergeRows = (key: string, rows: Row[], changed: Row[], deleted: (row: Row) => boolean): Row[] => {
  const byId = new Map(changed.map((r) => [Number(r.id), r]))
  const have = new Set(rows.map((r) => Number(r.id)))
  const next = rows.map((r) => byId.get(Number(r.id)) ?? r)
  if (isFullList(key)) for (const r of changed) if (!have.has(Number(r.id))) next.push(r)
  return next.filter((r) => !deleted(r))
}
