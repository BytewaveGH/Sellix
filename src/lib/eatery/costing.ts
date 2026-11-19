// Ingredient costing and profit. Pure functions so the accounting is testable.
//
// How the numbers fit together:
//   Sales            = order totals (not cancelled) in the period
//   Cost of goods    = ingredients used by those orders, at average cost when used
//   Gross profit     = Sales − Cost of goods
//   Net profit       = Gross profit − waste − running expenses (rent, staff, gas…)
// Buying stock is not a cost by itself — it becomes one when the stock is used
// or wasted. "Spent on stock" is shown separately as money out.

import type {
  CategoryKey,
  Expense,
  ExpenseCategory,
  FulfilmentType,
  Ingredient,
  IngredientUnit,
  MenuItem,
  Order,
  OrderLineInput,
  PackagingRule,
  Recipe,
  RecipeLine,
  StockMove,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export const UNITS: { value: IngredientUnit; label: string }[] = [
  { value: 'g', label: 'grams (g)' },
  { value: 'kg', label: 'kilograms (kg)' },
  { value: 'ml', label: 'millilitres (ml)' },
  { value: 'l', label: 'litres (l)' },
  { value: 'pcs', label: 'pieces' },
  { value: 'bottle', label: 'bottles' },
  { value: 'tin', label: 'tins' },
  { value: 'pack', label: 'packs' },
  { value: 'bag', label: 'bags' },
  { value: 'crate', label: 'crates' },
]

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'rent', label: 'Rent' },
  { value: 'staff', label: 'Staff & wages' },
  { value: 'utilities', label: 'Electricity & water' },
  { value: 'gas', label: 'Cooking gas & charcoal' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'transport', label: 'Transport & delivery' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'repairs', label: 'Repairs & equipment' },
  { value: 'other', label: 'Other' },
]
export const expenseLabel = (c: ExpenseCategory) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c

// Starting ingredient lists per kind of place (name, unit, typical cost per unit in GHS).
export const INGREDIENT_SUGGESTIONS: Partial<Record<CategoryKey, [string, IngredientUnit, number][]>> = {
  'fast-food': [
    ['Pizza dough', 'g', 0.02],
    ['Mozzarella', 'g', 0.12],
    ['Tomato sauce', 'g', 0.03],
    ['Pepperoni', 'g', 0.15],
    ['Chicken (shawarma)', 'g', 0.07],
    ['Beef (shawarma)', 'g', 0.09],
    ['Pita bread', 'pcs', 2.5],
    ['Garlic mayo', 'g', 0.04],
    ['Potatoes (fries)', 'g', 0.015],
    ['Cooking oil', 'ml', 0.03],
    ['Pizza box', 'pcs', 3],
    ['Coca-Cola 350ml', 'bottle', 8],
  ],
  'cocktail-bar': [
    ['White rum', 'ml', 0.25],
    ['Gin', 'ml', 0.35],
    ['Vodka', 'ml', 0.3],
    ['Tequila', 'ml', 0.4],
    ['Whiskey', 'ml', 0.45],
    ['Lime', 'pcs', 1],
    ['Fresh mint', 'g', 0.1],
    ['Simple syrup', 'ml', 0.02],
    ['Sobolo (hibiscus)', 'ml', 0.03],
    ['Tonic water', 'ml', 0.03],
    ['Ice', 'kg', 2],
    ['Club Lager', 'bottle', 12],
  ],
  cafe: [
    ['Coffee beans', 'g', 0.25],
    ['Fresh milk', 'ml', 0.015],
    ['Oat milk', 'ml', 0.04],
    ['Sugar', 'g', 0.01],
    ['Cocoa powder', 'g', 0.08],
    ['Vanilla syrup', 'ml', 0.06],
    ['Croissant (frozen)', 'pcs', 6],
    ['Bread (sourdough)', 'pcs', 1.5],
    ['Avocado', 'pcs', 4],
    ['Eggs', 'pcs', 2],
    ['Takeaway cup', 'pcs', 1.5],
  ],
  'local-dishes': [
    ['Rice', 'kg', 18],
    ['Tomato paste', 'tin', 6],
    ['Chicken', 'kg', 60],
    ['Tilapia', 'pcs', 25],
    ['Palm oil', 'l', 30],
    ['Pepper', 'g', 0.05],
    ['Cassava & plantain (fufu)', 'kg', 10],
    ['Corn dough (banku)', 'kg', 9],
    ['Gas', 'kg', 15],
  ],
}

// ── Usage ──

const addTo = (m: Map<number, number>, lines: RecipeLine[] | undefined, times: number) => {
  for (const l of lines ?? []) m.set(l.ingredientId, (m.get(l.ingredientId) ?? 0) + l.quantity * times)
}

// Ingredients one order line uses: the item's recipe, the recipes of the
// options chosen, and for combos the recipe of every item picked. Extras in
// `onceGroups` (charged once per line, see menu.onceGroupIds) are used once,
// not once per portion: TZ × 4 with one fish uses one fish.
export const lineUsage = (
  line: Pick<OrderLineInput, 'itemId' | 'quantity' | 'choices' | 'comboPicks'>,
  recipeByItem: Map<number, Recipe>,
  onceGroups: ReadonlySet<string> = new Set()
) => {
  const m = new Map<number, number>()
  const r = recipeByItem.get(line.itemId)
  addTo(m, r?.ingredients, line.quantity)
  for (const [groupId, ids] of Object.entries(line.choices ?? {}))
    for (const id of ids) addTo(m, r?.choices[id], onceGroups.has(groupId) ? 1 : line.quantity)
  for (const picked of Object.values(line.comboPicks ?? {})) addTo(m, recipeByItem.get(picked)?.ingredients, line.quantity)
  return m
}

export const usageCost = (usage: Map<number, number>, ingredientById: Map<number, Ingredient>) =>
  round2(Array.from(usage.entries()).reduce((s, [id, q]) => s + q * (ingredientById.get(id)?.costPerUnit ?? 0), 0))

// Has a recipe at all (otherwise its cost is unknown, not zero).
export const isCosted = (line: Pick<OrderLineInput, 'itemId' | 'comboPicks'>, recipeByItem: Map<number, Recipe>) =>
  (recipeByItem.get(line.itemId)?.ingredients.length ?? 0) > 0 ||
  Object.values(line.comboPicks ?? {}).some((id) => (recipeByItem.get(id)?.ingredients.length ?? 0) > 0)

// Cost of one item with its default choices (for the margin on the menu).
export const itemCost = (
  item: MenuItem,
  recipeByItem: Map<number, Recipe>,
  ingredientById: Map<number, Ingredient>,
  choices: Record<string, string[]> = {}
) => usageCost(lineUsage({ itemId: item.id, quantity: 1, choices, comboPicks: undefined }, recipeByItem), ingredientById)

export const margin = (price: number, cost: number) => (price > 0 ? (price - cost) / price : 0)

// New weighted-average cost after buying `qty` for `total`.
export const averageCost = (ing: Pick<Ingredient, 'stock' | 'costPerUnit'>, qty: number, total: number) => {
  const have = Math.max(0, ing.stock)
  if (qty <= 0) return ing.costPerUnit
  return round4((have * ing.costPerUnit + total) / (have + qty))
}

export const stockStatus = (ing: Ingredient): 'out' | 'low' | 'ok' => (ing.stock <= 0 ? 'out' : ing.stock <= ing.lowStockAt ? 'low' : 'ok')

// ── Profit ──

export interface ProfitReport {
  sales: number
  orders: number
  costOfGoods: number
  waste: number
  expenses: number
  spentOnStock: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
  // Sold lines with no recipe: their cost isn't counted.
  uncostedLines: number
  expensesByCategory: { category: ExpenseCategory; amount: number }[]
  byChannel: { online: number; counter: number }
}

const inRange = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime()
  return t >= from.getTime() && t < to.getTime()
}

export const profitReport = (
  data: { orders: Order[]; stockMoves: StockMove[]; expenses: Expense[]; recipes: Recipe[] },
  from: Date,
  to: Date
): ProfitReport => {
  const orders = data.orders.filter((o) => o.status !== 'cancelled' && inRange(o.createdAt, from, to))
  const recipeByItem = new Map(data.recipes.map((r) => [r.itemId, r]))
  const sales = round2(orders.reduce((s, o) => s + o.total, 0))
  const costOfGoods = round2(orders.reduce((s, o) => s + (o.costOfGoods ?? 0), 0))
  const moves = data.stockMoves.filter((m) => inRange(m.date, from, to))
  const waste = round2(moves.filter((m) => m.type === 'waste').reduce((s, m) => s + Math.abs(m.totalCost), 0))
  const spentOnStock = round2(moves.filter((m) => m.type === 'purchase').reduce((s, m) => s + m.totalCost, 0))
  const exp = data.expenses.filter((e) => inRange(e.date, from, to))
  const expenses = round2(exp.reduce((s, e) => s + e.amount, 0))
  const byCat = new Map<ExpenseCategory, number>()
  exp.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount))
  const grossProfit = round2(sales - costOfGoods)
  const netProfit = round2(grossProfit - waste - expenses)
  return {
    sales,
    orders: orders.length,
    costOfGoods,
    waste,
    expenses,
    spentOnStock,
    grossProfit,
    netProfit,
    grossMargin: sales ? grossProfit / sales : 0,
    netMargin: sales ? netProfit / sales : 0,
    uncostedLines: orders.reduce((s, o) => s + o.lines.filter((l) => !isCosted(l, recipeByItem)).length, 0),
    expensesByCategory: EXPENSE_CATEGORIES.map((c) => ({ category: c.value, amount: round2(byCat.get(c.value) ?? 0) })).filter(
      (c) => c.amount > 0
    ),
    byChannel: {
      online: round2(orders.filter((o) => o.channel !== 'counter').reduce((s, o) => s + o.total, 0)),
      counter: round2(orders.filter((o) => o.channel === 'counter').reduce((s, o) => s + o.total, 0)),
    },
  }
}

// Per menu item over a period: how many sold, revenue, ingredient cost, profit.
export const itemProfit = (orders: Order[], from: Date, to: Date) => {
  const m = new Map<number, { itemId: number; name: string; sold: number; revenue: number; cost: number; costed: boolean }>()
  for (const o of orders) {
    if (o.status === 'cancelled' || !inRange(o.createdAt, from, to)) continue
    for (const l of o.lines) {
      const row = m.get(l.itemId) ?? { itemId: l.itemId, name: l.name, sold: 0, revenue: 0, cost: 0, costed: false }
      row.sold += l.quantity
      row.revenue = round2(row.revenue + l.lineTotal)
      if (l.unitCost !== undefined) {
        row.cost = round2(row.cost + l.unitCost * l.quantity)
        row.costed = row.costed || l.unitCost > 0
      }
      m.set(l.itemId, row)
    }
  }
  return Array.from(m.values())
    .map((r) => ({ ...r, profit: round2(r.revenue - r.cost), margin: margin(r.revenue, r.cost) }))
    .sort((a, b) => b.revenue - a.revenue)
}

export type Period = 'today' | 'week' | 'month' | '30d'
export const periodRange = (p: Period, now: Date): { from: Date; to: Date; label: string } => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(start.getTime() + 86_400_000)
  if (p === 'today') return { from: start, to, label: 'Today' }
  if (p === 'week') {
    const from = new Date(start)
    from.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return { from, to, label: 'This week' }
  }
  if (p === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to, label: 'This month' }
  return { from: new Date(start.getTime() - 29 * 86_400_000), to, label: 'Last 30 days' }
}

// ── Packaging & extras (per order / per item) ──

export const packagingApplies = (rule: Pick<PackagingRule, 'active' | 'when'>, type: FulfilmentType) =>
  rule.active && (rule.when === 'all' || (rule.when === 'takeaway' ? type !== 'dine-in' : type === 'dine-in'))

// Ingredients an order's packaging rules use: once per order or once per item.
export const packagingUsage = (order: Pick<Order, 'fulfilment' | 'lines'>, rules: PackagingRule[]) => {
  const m = new Map<number, number>()
  const items = order.lines.reduce((s, l) => s + l.quantity, 0)
  for (const r of rules) {
    if (!packagingApplies(r, order.fulfilment.type)) continue
    const times = r.per === 'order' ? 1 : items
    for (const l of r.ingredients) m.set(l.ingredientId, (m.get(l.ingredientId) ?? 0) + l.quantity * times)
  }
  return m
}

// ── Guard rails ──

const CONTAINERS = ['pack', 'crate', 'bag', 'box', 'carton', 'sack', 'tray', 'dozen', 'sleeve', 'roll', 'gallon', 'block', 'cylinder']

export interface RecipeWarning {
  ingredientId?: number
  message: string
  // Suggest setting a pack size on this ingredient.
  fixPackSize?: boolean
}

// Catches the classic mistakes: a whole pack counted per plate, one line
// costing most of the price, or a dish that costs more than it sells for.
export const recipeWarnings = (
  price: number,
  lines: RecipeLine[],
  ingredientById: Map<number, Ingredient>,
  money: (n: number) => string
): RecipeWarning[] => {
  const out: RecipeWarning[] = []
  let total = 0
  for (const l of lines) {
    const ing = ingredientById.get(l.ingredientId)
    if (!ing || !(l.quantity > 0)) continue
    const cost = l.quantity * ing.costPerUnit
    total += cost
    // Half a pack/crate/bag or more per serving, with no pack size set: almost
    // always a pack counted where a piece was meant (₵7 of tissue per plate).
    const bulkUnit = CONTAINERS.includes(ing.unit) && !(ing.perPurchase && ing.perPurchase > 1)
    if (bulkUnit && l.quantity >= 0.5) {
      out.push({
        ingredientId: ing.id,
        fixPackSize: true,
        message: `${ing.name} costs ${money(Math.round(cost * 100) / 100)} per serving — is one ${ing.unit} several pieces? Set how many are in a ${ing.unit}.`,
      })
    } else if (price > 0 && cost >= price * 0.5) {
      out.push({
        ingredientId: ing.id,
        message: `${ing.name} alone is ${Math.round((cost / price) * 100)}% of the price — check the quantity.`,
      })
    }
  }
  if (price > 0 && total > price)
    out.push({ message: `This costs ${money(Math.round(total * 100) / 100)} to make but sells for ${money(price)}.` })
  return out
}
