// Menu sections to and from a spreadsheet (CSV), so an owner can type a menu
// in Excel or paste a list ("Jollof rice 35") instead of adding items one by
// one. Pure: the menu page saves the result with the usual item endpoints
// (POST /items, PUT /items/:id) — no new backend.
//
// Columns: id, name, price, description, options, tags, status, imageUrl.
// Only name is needed; a pasted list without a header row works too.
//
// `options` is written the way you'd say it, one group after another:
//   Size: Regular 5, Maxi 7 | Proteins (extras, up to 10, more than one of each): Egg 3, Fish 20
// A group is pick-one unless its brackets say "extras". In the brackets:
// "up to N", "at least N", "once per line" (chargeOnce), "more than one of
// each" (repeat). A choice is its name and the price it adds (or its own
// price when the item's price is 0), "(sold out)" after it if so.

import { parseCsv } from '@/lib/store/product-csv'
import { toCsv } from './sales'
import type { ItemStatus, ItemTag, MenuItem, OptionChoice, OptionGroup } from './types'

export const MENU_COLUMNS = ['id', 'name', 'price', 'description', 'options', 'tags', 'status', 'imageUrl'] as const
type Column = (typeof MENU_COLUMNS)[number]

const TAG_KEYS: ItemTag[] = ['popular', 'new', 'signature', 'spicy', 'vegetarian', 'vegan', 'gluten-free', 'alcoholic', 'non-alcoholic', 'sharing']
// Labels the menu shows, so a file written from the screen reads back.
const TAG_WORDS: Record<string, ItemTag> = {
  'contains alcohol': 'alcoholic',
  'alcohol-free': 'non-alcoholic',
  'alcohol free': 'non-alcoholic',
  'for sharing': 'sharing',
  'gluten free': 'gluten-free',
}
const STATUS_WORDS: Record<string, ItemStatus> = {
  available: 'available',
  'sold out': 'sold-out',
  'sold-out': 'sold-out',
  soldout: 'sold-out',
  hidden: 'hidden',
}

// ── Export ──────────────────────────────────────────────────────────────────

const amount = (n: number) => String(Math.round(n * 100) / 100)

export const formatOptions = (groups: OptionGroup[]) =>
  groups
    .map((g) => {
      const flags: string[] = []
      if (g.kind === 'addon') {
        flags.push('extras')
        if (g.min > 0) flags.push(`at least ${g.min}`)
        if (g.repeat || g.max !== g.choices.length) flags.push(`up to ${g.max}`)
        if (g.chargeOnce) flags.push('once per line')
        if (g.repeat) flags.push('more than one of each')
      }
      const choices = g.choices
        .map((c) => `${c.name}${c.priceDelta ? ` ${amount(c.priceDelta)}` : ''}${c.soldOut ? ' (sold out)' : ''}`)
        .join(', ')
      return `${g.name}${flags.length ? ` (${flags.join(', ')})` : ''}: ${choices}`
    })
    .join(' | ')

export const itemsToCsv = (items: MenuItem[]) =>
  toCsv([
    [...MENU_COLUMNS],
    ...items.map((i) => [
      i.id,
      i.name,
      amount(i.price),
      i.description ?? '',
      formatOptions(i.optionGroups),
      i.tags.join(', '),
      i.status,
      i.imageUrl ?? '',
    ]),
  ])

// A starting file for owners who have no menu typed up yet.
export const SAMPLE_CSV = toCsv([
  [...MENU_COLUMNS],
  ['', 'Jollof rice', '35', 'With chicken and shito', '', 'popular', '', ''],
  ['', 'TZ', '0', '', 'Size: Regular 5, Maxi 7 | Proteins (extras, up to 10, once per line, more than one of each): Egg 3, Fish small 20', '', '', ''],
  ['', 'Sobolo', '10', 'Chilled', '', '', '', ''],
])

// ── Reading a file ──────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '')
const HEADERS: Record<string, Column> = {
  id: 'id',
  itemid: 'id',
  name: 'name',
  item: 'name',
  itemname: 'name',
  dish: 'name',
  food: 'name',
  drink: 'name',
  menu: 'name',
  menuitem: 'name',
  price: 'price',
  cost: 'price',
  amount: 'price',
  'price(₵)': 'price',
  'price(ghs)': 'price',
  description: 'description',
  details: 'description',
  desc: 'description',
  options: 'options',
  option: 'options',
  sizes: 'options',
  extras: 'options',
  choices: 'options',
  tags: 'tags',
  labels: 'tags',
  status: 'status',
  availability: 'status',
  imageurl: 'imageUrl',
  image: 'imageUrl',
  photo: 'imageUrl',
  picture: 'imageUrl',
}

// Undo the quote toCsv puts before a cell that looks like a formula.
const unguard = (s: string) => s.trim().replace(/^'(?=[=+\-@])/, '')

// "₵35", "GHS 35.50", "35" → 35. Blank → undefined; not a number → NaN.
export const parsePrice = (s: string | undefined): number | undefined => {
  const t = (s ?? '').replace(/GH₵|GHS|GHC|₵|cedis?/gi, '').replace(/,/g, '').trim()
  if (!t) return undefined
  const n = Number(t.replace(/^−/, '-'))
  return Number.isFinite(n) ? n : NaN
}

// "Regular 5", "Small -2", "Fish - ₵20", "Plain" → name and price.
const NAME_PRICE = /^(.+?)\s+(?:[-–:=]\s+)?([+−-](?=\d|₵|GH))?\s*(?:GH₵|₵|GHS\s?|GHC\s?)?(\d+(?:\.\d+)?)$/i
export const splitNamePrice = (s: string): { name: string; price?: number } => {
  const t = s.trim()
  const m = NAME_PRICE.exec(t)
  if (!m) return { name: t }
  const n = Number(m[3])
  return { name: m[1].trim(), price: m[2] ? -n : n }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Parses the options cell. Ids are kept from `existing` groups and choices of
// the same name, so recipes and saved carts still point at them.
export const parseOptions = (
  text: string,
  existing: OptionGroup[] = [],
  newId: (prefix: string) => string
): { groups: OptionGroup[]; error?: string } => {
  const groups: OptionGroup[] = []
  for (const part of text.split(/\s*\|\s*|\r?\n/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.+?)(?:\s*\(([^)]*)\))?\s*:\s*(.*)$/.exec(part)
    if (!m) return { groups, error: `“${part}”: write it as “Group: choice price, choice price”` }
    const name = m[1].trim()
    const flags = (m[2] ?? '').toLowerCase()
    const old = existing.find((g) => sameName(g.name, name))
    const choices: OptionChoice[] = m[3]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const soldOut = /\(sold[\s-]?out\)\s*$/i.test(c)
        const { name: cName, price } = splitNamePrice(c.replace(/\(sold[\s-]?out\)\s*$/i, ''))
        const oldChoice = old?.choices.find((x) => sameName(x.name, cName))
        return { id: oldChoice?.id ?? newId('c'), name: cName, priceDelta: price ?? 0, ...(soldOut ? { soldOut: true } : {}) }
      })
    if (!choices.length) return { groups, error: `“${name}” has no choices` }
    const id = old?.id ?? newId('g')
    if (!/extra|add-?on|topping/.test(flags)) {
      groups.push({ id, name, kind: 'variant', min: 1, max: 1, choices })
      continue
    }
    const repeat = /more than one|many|repeat/.test(flags)
    const upTo = Number(/up to\s*(\d+)/.exec(flags)?.[1] ?? NaN)
    const atLeast = Number(/at least\s*(\d+)/.exec(flags)?.[1] ?? 0)
    let max = Number.isFinite(upTo) && upTo > 0 ? upTo : repeat ? Math.max(10, choices.length) : choices.length
    if (!repeat) max = Math.min(max, choices.length)
    const min = Math.min(atLeast, max)
    groups.push({
      id,
      name,
      kind: 'addon',
      min,
      max,
      choices,
      ...(/once/.test(flags) ? { chargeOnce: true } : {}),
      ...(repeat ? { repeat: true } : {}),
    })
  }
  return { groups }
}

type Row = Partial<Record<Column, string>> & { line: number }

// Rows keyed by column. A file without a recognised header is read as a plain
// list: each line is "Name price" (or name, price, description in cells).
export const readMenuFile = (text: string): { rows: Row[]; headed: boolean; error?: string } => {
  const table = parseCsv(text).map((r) => r.map(unguard))
  if (!table.length) return { rows: [], headed: false, error: 'There’s nothing in it' }
  const cols = table[0].map((h) => HEADERS[norm(h)])
  if (cols.includes('name')) {
    const rows = table.slice(1).map((r, i) => {
      const row: Row = { line: i + 2 }
      cols.forEach((c, j) => {
        if (c && row[c] === undefined) row[c] = r[j] ?? ''
      })
      return row
    })
    return { rows, headed: true }
  }
  const rows = table.map((cells, i): Row => {
    const filled = cells.filter(Boolean)
    if (filled.length === 1) {
      const { name, price } = splitNamePrice(filled[0])
      return { line: i + 1, name, price: price === undefined ? '' : String(price) }
    }
    const priceAt = filled.findIndex((c) => Number.isFinite(parsePrice(c)))
    // "Fried rice, chicken 40": the price ends the last cell.
    const last = splitNamePrice(filled[filled.length - 1] ?? '')
    if (priceAt < 0 && last.price !== undefined)
      return { line: i + 1, name: filled.slice(0, -1).concat(last.name).join(', '), price: String(last.price) }
    const text = filled.filter((_, j) => j !== priceAt)
    return { line: i + 1, name: text[0] ?? '', price: priceAt >= 0 ? filled[priceAt] : '', description: text.slice(1).join(', ') }
  })
  return { rows, headed: false }
}

// ── What an import will do ──────────────────────────────────────────────────

export type ItemBody = Omit<MenuItem, 'id'>

export type PlannedRow =
  | { line: number; name: string; action: 'create'; body: ItemBody }
  | { line: number; name: string; action: 'update'; id: number; body: Partial<ItemBody>; changes: string[] }
  | { line: number; name: string; action: 'same'; id: number }
  | { line: number; name: string; action: 'skip'; reason: string }

const parseTags = (s: string) =>
  Array.from(
    new Set(
      s
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase())
        .map((t) => (TAG_KEYS.includes(t as ItemTag) ? (t as ItemTag) : TAG_WORDS[t]))
        .filter(Boolean) as ItemTag[]
    )
  )

const isImageUrl = (s: string) => /^(https?:\/\/|\/)\S+$/i.test(s)

// Same value, whatever the key order; a missing flag equals false.
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .filter((k) => (v as any)[k] !== undefined && (v as any)[k] !== false)
            .map((k) => [k, canon((v as any)[k])])
        )
      : v
const sameJson = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

export const planMenuImport = (
  text: string,
  ctx: {
    restaurantId: number
    categoryId: number
    // The section's items today: rows with their id or name update them.
    items: MenuItem[]
    newId?: (prefix: string) => string
  }
): { rows: PlannedRow[]; error?: string } => {
  const { rows, error } = readMenuFile(text)
  if (error) return { rows: [], error }
  let seq = 0
  const newId = ctx.newId ?? ((p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`)
  const seen = new Set<string>()
  let position = ctx.items.length
  const out: PlannedRow[] = []
  for (const row of rows) {
    const name = (row.name ?? '').trim()
    const skip = (reason: string) => out.push({ line: row.line, name: name || `Row ${row.line}`, action: 'skip', reason })
    if (!name) {
      if (Object.entries(row).some(([k, v]) => k !== 'line' && String(v).trim())) skip('No name')
      continue
    }
    if (seen.has(name.toLowerCase())) {
      skip('Listed twice in the file')
      continue
    }
    seen.add(name.toLowerCase())

    const id = Number(row.id)
    const existing =
      (Number.isInteger(id) && id > 0 ? ctx.items.find((i) => i.id === id) : undefined) ?? ctx.items.find((i) => sameName(i.name, name))

    const price = parsePrice(row.price)
    if (price !== undefined && (Number.isNaN(price) || price < 0)) {
      skip(`Price “${row.price}” isn’t a number`)
      continue
    }
    const optionsText = row.options?.trim() ?? ''
    const opts = optionsText ? parseOptions(optionsText, existing?.optionGroups, newId) : undefined
    if (opts?.error) {
      skip(opts.error)
      continue
    }
    const description = row.description?.trim()
    const tags = row.tags?.trim() ? parseTags(row.tags) : undefined
    const status = row.status?.trim() ? STATUS_WORDS[row.status.trim().toLowerCase()] : undefined
    const image = row.imageUrl?.trim()
    const imageUrl = image && isImageUrl(image) ? image : undefined

    if (!existing) {
      // Without a price the choices carry it ("each has its own price").
      if (price === undefined && !opts?.groups.length) {
        skip('No price')
        continue
      }
      out.push({
        line: row.line,
        name,
        action: 'create',
        body: {
          restaurantId: ctx.restaurantId,
          categoryId: ctx.categoryId,
          name,
          ...(description ? { description } : {}),
          price: price ?? 0,
          tags: tags ?? [],
          optionGroups: opts?.groups ?? [],
          status: status ?? 'available',
          ...(imageUrl ? { imageUrl } : {}),
          position: position++,
        },
      })
      continue
    }

    // An item already in the section: change only what the file fills in.
    const body: Partial<ItemBody> = {}
    const changes: string[] = []
    const change = <K extends keyof ItemBody>(key: K, value: ItemBody[K] | undefined, label: string) => {
      if (value === undefined || sameJson(value, existing[key])) return
      body[key] = value
      changes.push(label)
    }
    change('name', name !== existing.name ? name : undefined, 'name')
    change('price', price, 'price')
    change('description', description || undefined, 'description')
    change('optionGroups', opts?.groups, 'options')
    change('tags', tags, 'tags')
    change('status', status, 'availability')
    change('imageUrl', imageUrl, 'photo')
    out.push(
      changes.length
        ? { line: row.line, name, action: 'update', id: existing.id, body, changes }
        : { line: row.line, name, action: 'same', id: existing.id }
    )
  }
  if (!out.length) return { rows: [], error: 'No menu items found in it' }
  return { rows: out }
}

export const fileNameFor = (restaurant: string, section: string) =>
  `${`${restaurant}-${section}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu'}.csv`
