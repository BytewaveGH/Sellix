// Request bodies for the product form. Kept pure so the field mapping
// (brand/sku/imageUrl/aliases, per-unit baseQuantity/barcodes) is testable.

import { apiErrorMessage, apiStatus } from '@/lib/api-error'
import { feeClassOf } from '@/lib/subscription/usage'
import type { PricingRule } from '../../../pos/_logics/types'

// The server's enum (flat | half-box | bulk-wholesale) — one definition, shared with the POS.
export type PricingRuleValue = PricingRule

export type UnitFormValues = {
  unitId: number
  retailPrice: number
  wholesalePrice: number
  pricingRule: PricingRuleValue
  baseQuantity?: number
  boxSize?: number
  boxRetailPrice?: number
  bulkThreshold?: number
  barcodes?: string[]
}

export type ProductFormValues = {
  name: string
  description?: string
  category: string
  purchasePrice: number
  minQuantity?: number
  brand?: string
  sku?: string
  imageUrl?: string
  aliases?: string[]
  // Pay as you sell: which fee rate this product's sales pay (usage.ts).
  feeClass?: string
  units: UnitFormValues[]
  stock: { warehouseId: number; quantity: number }[]
}

export const resolveRule = (u: UnitFormValues): PricingRuleValue =>
  u.pricingRule !== 'flat' ? u.pricingRule : u.bulkThreshold && u.bulkThreshold > 0 ? 'bulk-wholesale' : 'flat'

const clean = (v: string | undefined) => v?.trim() || undefined
const cleanList = (list: string[] | undefined) => Array.from(new Set((list ?? []).map((x) => x.trim()).filter(Boolean)))
const baseQty = (v: number | undefined) => (v && Number.isInteger(v) && v >= 1 ? v : 1)

export const buildUnitPayload = (u: UnitFormValues) => ({
  unitId: u.unitId,
  retailPrice: u.retailPrice,
  wholesalePrice: u.wholesalePrice,
  pricingRule: resolveRule(u),
  baseQuantity: baseQty(u.baseQuantity),
  boxSize: u.boxSize,
  boxRetailPrice: u.boxRetailPrice,
  bulkThreshold: u.bulkThreshold,
})

// POST /products — aliases and per-unit barcodes are only accepted on create.
export const buildCreateProductPayload = (data: ProductFormValues) => {
  const aliases = cleanList(data.aliases)
  return {
    name: data.name,
    description: data.description,
    category: data.category,
    purchasePrice: data.purchasePrice,
    minQuantity: data.minQuantity,
    brand: clean(data.brand),
    sku: clean(data.sku),
    imageUrl: clean(data.imageUrl),
    feeClass: feeClassOf(data.feeClass),
    ...(aliases.length > 0 ? { aliases } : {}),
    units: data.units.map((u) => {
      const barcodes = cleanList(u.barcodes)
      return { ...buildUnitPayload(u), ...(barcodes.length > 0 ? { barcodes } : {}) }
    }),
    stock: data.stock,
  }
}

// PUT /products/:id — brand/sku/imageUrl are sent only when changed (omitted =
// unchanged on the server); clearing the SKU sends "". Aliases and barcodes
// are never sent here — they have their own endpoints.
type EditableText = Pick<ProductFormValues, 'brand' | 'sku' | 'imageUrl'>

export const buildUpdateProductPayload = (data: ProductFormValues, initial: Partial<EditableText> = {}) => {
  const changed: Partial<Record<keyof EditableText, string>> = {}
  for (const key of ['brand', 'sku', 'imageUrl'] as const) {
    const next = data[key]?.trim() ?? ''
    if (next !== (initial[key]?.trim() ?? '')) changed[key] = next
  }
  return {
    name: data.name,
    description: data.description,
    category: data.category,
    purchasePrice: data.purchasePrice,
    minQuantity: data.minQuantity,
    feeClass: feeClassOf(data.feeClass),
    ...changed,
  }
}

export const SKU_IN_USE = 'SKU already in use'

// 409 is the planned response. Until it ships the server answers 500 with a
// raw unique-constraint error — remove the 500 branch once 409 is live.
export const isDuplicateSkuError = (err: any): boolean => {
  const status = apiStatus(err)
  if (status === 409) return true
  if (status === 500) {
    const msg = apiErrorMessage(err, '')
    return /sku/i.test(msg) || (/unique|duplicate/i.test(msg) && /constraint|key/i.test(msg))
  }
  return false
}

export const productSaveErrorMessage = (err: any) => (isDuplicateSkuError(err) ? SKU_IN_USE : apiErrorMessage(err, 'Something went wrong'))

// ── Cost of each selling unit ────────────────────────────────────────────────
// purchasePrice is what the shop pays for one purchase unit — the largest unit,
// e.g. one box (the backend's stats code reads it the same way). A smaller
// unit's cost is its share of that box:
//   • a half-box piece unit: purchasePrice ÷ boxSize ("pieces per full box");
//   • otherwise: purchasePrice × baseQuantity ÷ the largest baseQuantity
//     (Box = 12, Pack = 6, Piece = 1 → box cost, half of it, a twelfth of it).
// With several units but no box size anywhere, a smaller unit's cost can't be
// known — `unknownSplit` flags that so the form can ask for the box size.

type CostUnit = Pick<UnitFormValues, 'pricingRule' | 'baseQuantity' | 'boxSize' | 'retailPrice'>

export const piecesPerBox = (units: CostUnit[]) =>
  Math.max(1, ...units.map((u) => baseQty(u.baseQuantity)), ...units.map((u) => (u.pricingRule === 'half-box' ? u.boxSize || 1 : 1)))

export const unitCost = (purchasePrice: number, unit: CostUnit, units: CostUnit[]) => {
  if (unit.pricingRule === 'half-box' && unit.boxSize && unit.boxSize > 0) return purchasePrice / unit.boxSize
  const largest = Math.max(1, ...units.map((u) => baseQty(u.baseQuantity)))
  return (purchasePrice * baseQty(unit.baseQuantity)) / largest
}

export const unitCosts = (purchasePrice: number, units: CostUnit[]) => ({
  costs: units.map((u) => {
    const cost = Math.round(unitCost(purchasePrice, u, units) * 100) / 100
    return { cost, loss: purchasePrice > 0 && u.retailPrice > 0 && cost > u.retailPrice }
  }),
  unknownSplit: units.length > 1 && piecesPerBox(units) === 1,
})
