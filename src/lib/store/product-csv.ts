// Product export / import as CSV — e.g. export the catalogue, let an AI fill
// in photo links, import it back. Pure, so the CSV handling and matching are
// testable; the page does the uploads and image checks.

export const EXPORT_COLUMNS = ['id', 'name', 'brand', 'category', 'sku', 'barcode', 'units', 'description', 'imageUrl'] as const

// Columns an import may change. Everything else in the file is ignored.
export type ImportField = 'imageUrl' | 'description' | 'brand'

const unitsLabel = (p: any) =>
  ((p.units ?? []) as any[])
    .map((u) => {
      const n = Number(u.baseQuantity) || 1
      return `${u.unitName ?? u.name ?? 'Unit'}${n > 1 ? ` (${n})` : ''} ${Number(u.retailPrice) || 0}`
    })
    .join('; ')

const firstBarcode = (p: any) => {
  for (const u of (p.units ?? []) as any[]) for (const b of u.barcodes ?? []) if (b) return String(b.code ?? b)
  return ''
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (rows: Record<string, unknown>[], columns: readonly string[]) =>
  [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n')

export const productsToCsv = (products: any[]) =>
  // BOM so Excel opens accents and "₵" correctly.
  '﻿' +
  toCsv(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand ?? '',
      category: p.category ?? '',
      sku: p.sku ?? '',
      barcode: firstBarcode(p),
      units: unitsLabel(p),
      description: p.description ?? '',
      imageUrl: p.imageUrl ?? '',
    })),
    EXPORT_COLUMNS
  )

// RFC 4180: quoted fields, doubled quotes, newlines inside quotes. Also takes
// semicolon- or tab-separated files (Excel in some locales, copied sheets).
export const parseCsv = (text: string): string[][] => {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => firstLine.split(ch).length - 1
  const sep = count('\t') > count(',') ? '\t' : count(';') > count(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
// Header names an AI or a person might use instead of ours.
const HEADER_ALIASES: Record<string, string> = {
  id: 'id',
  productid: 'id',
  name: 'name',
  productname: 'name',
  sku: 'sku',
  brand: 'brand',
  description: 'description',
  imageurl: 'imageUrl',
  image: 'imageUrl',
  imagelink: 'imageUrl',
  photo: 'imageUrl',
  photourl: 'imageUrl',
  picture: 'imageUrl',
}

export type ImportRow = { line: number; id?: number; name?: string; sku?: string } & Partial<Record<ImportField, string>>

// The file as rows keyed by our field names. JSON (an array of objects) works too.
export const readImportFile = (text: string): { rows: ImportRow[]; columns: string[]; error?: string } => {
  const trimmed = text.trim()
  let records: Record<string, string>[]
  let headers: string[]
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (!Array.isArray(arr)) throw new Error()
      records = arr.map((o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])))
      headers = Array.from(new Set(records.flatMap((r) => Object.keys(r))))
    } catch {
      return { rows: [], columns: [], error: 'That JSON isn’t a list of products' }
    }
  } else {
    const table = parseCsv(text)
    if (table.length < 2) return { rows: [], columns: [], error: 'The file has no product rows' }
    headers = table[0]
    records = table.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  }
  const map = new Map(headers.map((h) => [h, HEADER_ALIASES[norm(h)]]))
  const columns = Array.from(new Set(Array.from(map.values()).filter(Boolean) as string[]))
  if (!columns.includes('id') && !columns.includes('name') && !columns.includes('sku'))
    return { rows: [], columns, error: 'Keep the id (or name) column so each row can be matched to a product' }
  const rows = records.map((rec, i) => {
    const out: ImportRow = { line: i + 2 }
    for (const [h, v] of Object.entries(rec)) {
      const key = map.get(h)
      if (!key) continue
      const val = v.trim()
      if (key === 'id') out.id = Number(val) || undefined
      else (out as any)[key] = val
    }
    return out
  })
  return { rows, columns }
}

// ── matching and changes ─────────────────────────────────────────────────────

export const isHttpUrl = (s: string) => {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export type MatchBy = 'id' | 'sku' | 'name'

export interface PlannedChange {
  line: number
  product?: any
  matchedBy?: MatchBy
  changes: Partial<Record<ImportField, { from: string; to: string }>>
  // Why nothing will be saved for this row, if so.
  problem?: string
}

// Rows → products, by id, then SKU, then exact name (only when one product has it).
// Empty cells never clear a value: a blank imageUrl leaves the photo alone.
export const planImport = (rows: ImportRow[], products: any[], fields: ImportField[]): PlannedChange[] => {
  const byId = new Map(products.map((p) => [Number(p.id), p]))
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [String(p.sku).trim().toLowerCase(), p]))
  const nameCount = new Map<string, any[]>()
  for (const p of products) {
    const k = String(p.name ?? '')
      .trim()
      .toLowerCase()
    nameCount.set(k, [...(nameCount.get(k) ?? []), p])
  }
  const seen = new Set<number>()
  return rows.map((r) => {
    let product: any
    let matchedBy: MatchBy | undefined
    if (r.id && byId.has(r.id)) [product, matchedBy] = [byId.get(r.id), 'id']
    else if (r.sku && bySku.has(r.sku.toLowerCase())) [product, matchedBy] = [bySku.get(r.sku.toLowerCase()), 'sku']
    else if (r.name) {
      const same = nameCount.get(r.name.toLowerCase()) ?? []
      if (same.length === 1) [product, matchedBy] = [same[0], 'name']
      else if (same.length > 1)
        return { line: r.line, changes: {}, problem: `${same.length} products are called “${r.name}” — keep the id column` }
    }
    if (!product) return { line: r.line, changes: {}, problem: 'No matching product' }
    if (seen.has(Number(product.id)))
      return { line: r.line, product, matchedBy, changes: {}, problem: 'This product is already in the file' }
    seen.add(Number(product.id))

    const changes: PlannedChange['changes'] = {}
    for (const f of fields) {
      const to = (r[f] ?? '').trim()
      const from = String(product[f] ?? '').trim()
      if (!to || to === from) continue
      if (f === 'imageUrl' && !isHttpUrl(to))
        return { line: r.line, product, matchedBy, changes: {}, problem: 'The image link isn’t a web address' }
      changes[f] = { from, to }
    }
    return { line: r.line, product, matchedBy, changes, problem: Object.keys(changes).length ? undefined : 'Nothing to change' }
  })
}

// PUT /products/:id needs name, description, category and purchase price every
// time (the API resets what's missing), so they're sent as they are now; brand,
// SKU and image are optional there and only sent when they change.
export const updateBody = (product: any, changes: PlannedChange['changes']) => ({
  name: product.name,
  description: changes.description?.to ?? product.description ?? '',
  category: product.category ?? '',
  purchasePrice: Number(product.purchasePrice) || 0,
  minQuantity: product.minQuantity ?? undefined,
  ...(changes.brand ? { brand: changes.brand.to } : {}),
  ...(changes.imageUrl ? { imageUrl: changes.imageUrl.to } : {}),
})

// Instructions to paste into ChatGPT, Claude, Gemini… with the exported file.
export const AI_PROMPT = `I'm attaching a CSV of the products in my shop. For every row, fill in the imageUrl column with a direct link to a clear photo of that exact product.

Rules:
- Use the name, brand, barcode and units to find the right product, size and pack.
- The link must open the image file itself (https, usually ending in .jpg, .jpeg, .png or .webp), not a web page that shows it.
- Prefer the manufacturer's site or a large retailer, a plain or white background, the front of the pack.
- Only give links you have actually found. If you can't find a real photo, leave imageUrl empty — never guess or make up a link.
- Keep the id column and every other column exactly as they are. Don't add or remove rows.

Give me the result back as a CSV file with the same columns.`
