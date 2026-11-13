// The eatery platform's shared data model. Every restaurant — cocktail bar,
// pizza & shawarma spot, café, chop bar — uses exactly these records; only its
// `theme` (see theme.ts) changes how it looks. Contract: BACKEND_REQUIREMENTS.md §7.

import type { ThemeConfig } from './theme'

// What kind of place it is. Picks the starting design preset and menu kit
// (presets.ts); add a new kind by adding one preset — nothing else changes.
export type CategoryKey = 'cocktail-bar' | 'fast-food' | 'cafe' | 'local-dishes' | 'grill' | 'bakery' | 'juice-bar' | 'general'

// Drinks-only places get drinks wording, an 18+ notice for alcohol, no delivery prompts for food…
export type MenuKind = 'drinks' | 'food' | 'mixed'

// "HH:mm", 24h.
export type ClockTime = string

// A recurring window, e.g. happy hour Mon–Fri 17:00–19:00. `to` earlier than
// `from` runs past midnight (22:00–02:00). Days: 0 = Sunday … 6 = Saturday;
// for overnight windows the day is the one it starts on.
export interface TimeWindow {
  days: number[]
  from: ClockTime
  to: ClockTime
}

// Per weekday (0–6): opening periods. An empty list = closed that day.
export type WeeklyHours = Record<number, { open: ClockTime; close: ClockTime }[]>

export interface Fulfilment {
  pickup: { enabled: boolean; prepMinutes: number }
  delivery: { enabled: boolean; fee: number; minOrder: number; area?: string; etaMinutes: number }
  // Tables get a QR code linking to /eat/<slug>?table=<name>.
  dineIn: { enabled: boolean; tables: string[] }
}

export type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo'

export interface PaymentSettings {
  cash: boolean
  // Customers send to this number and may enter the transaction ID; staff confirm.
  momo: { enabled: boolean; number: string; accountName: string; network: MomoNetwork }
  payAtTable: boolean
}

export interface Restaurant {
  id: number
  // Tenant (business) that owns it. One business may run several restaurants.
  ownerScope: string
  // Public address: /eat/<slug>. Unique across the platform.
  slug: string
  name: string
  tagline?: string
  description?: string
  category: CategoryKey
  menuKind: MenuKind
  theme: ThemeConfig
  currency: string
  address: string
  city: string
  phone?: string
  whatsapp?: string
  hours: WeeklyHours
  fulfilment: Fulfilment
  payments: PaymentSettings
  // Master switch: false pauses all new orders (menu stays visible).
  acceptingOrders: boolean
  // Shows an 18+ notice on items that contain alcohol.
  servesAlcohol: boolean
  createdAt: string
}

export interface MenuCategory {
  id: number
  restaurantId: number
  name: string
  description?: string
  position: number
  // Only orderable inside these windows (e.g. "Breakfast" 07:00–11:00). None = whenever open.
  schedule?: TimeWindow[]
}

export type ItemTag =
  | 'popular'
  | 'new'
  | 'signature'
  | 'spicy'
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'alcoholic'
  | 'non-alcoholic'
  | 'sharing'

export interface OptionChoice {
  id: string
  name: string
  // Added to the item price (can be 0, or negative for a smaller size).
  priceDelta: number
  soldOut?: boolean
}

// One question on an item: "Size" (pick 1), "Toppings" (up to 5), "Ice" (pick 1)…
export interface OptionGroup {
  id: string
  name: string
  // variant: changes what the item is (size, crust, protein) — exactly one.
  // addon: optional extras (toppings, sauces, mixers) — min..max.
  kind: 'variant' | 'addon'
  min: number
  max: number
  choices: OptionChoice[]
}

// A combo: fixed price, the customer picks one item per slot (main, side, drink).
export interface ComboSlot {
  id: string
  name: string
  choices: { itemId: number; upcharge: number }[]
}

export type ItemStatus = 'available' | 'sold-out' | 'hidden'

export interface MenuItem {
  id: number
  restaurantId: number
  categoryId: number
  name: string
  description?: string
  imageUrl?: string
  price: number
  tags: ItemTag[]
  optionGroups: OptionGroup[]
  combo?: { slots: ComboSlot[] }
  status: ItemStatus
  // Time-based availability for this item only (e.g. "after 17:00").
  schedule?: TimeWindow[]
  position: number
}

// Time-based discount, e.g. "Happy hour: 25% off cocktails, Mon–Fri 17:00–19:00".
// No categoryIds and no itemIds = the whole menu.
export interface Promotion {
  id: number
  restaurantId: number
  name: string
  description?: string
  percentOff: number
  schedule: TimeWindow[]
  categoryIds: number[]
  itemIds: number[]
  active: boolean
}

// ── Orders ──────────────────────────────────────────────────────────────────

export type FulfilmentType = 'pickup' | 'delivery' | 'dine-in'
// 'card' is taken at the counter only (POS); customers online pay cash, MoMo or at the table.
export type PaymentMethod = 'cash' | 'momo' | 'pay-at-table' | 'card'
export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'out-for-delivery' | 'completed' | 'cancelled'

// What a customer sends: ids and choices only — never prices. The server
// (or the local source) prices it from the current menu.
export interface OrderLineInput {
  itemId: number
  quantity: number
  // optionGroup id → chosen choice ids
  choices: Record<string, string[]>
  // combo slot id → chosen item id
  comboPicks?: Record<string, number>
  note?: string
}

export interface OrderLine extends OrderLineInput {
  name: string
  // "Large · Thin crust · + Extra cheese"
  summary: string
  unitPrice: number
  // Promotion discount per unit included in unitPrice.
  discountPerUnit: number
  lineTotal: number
  // Ingredient cost per unit, worked out when stock was deducted (owner-only).
  unitCost?: number
}

export interface CheckoutInput {
  lines: OrderLineInput[]
  customer: { name: string; phone: string }
  fulfilment: { type: FulfilmentType; table?: string; address?: string; landmark?: string; pickupAt?: 'asap' | ClockTime }
  payment: { method: PaymentMethod; reference?: string }
  notes?: string
}

export interface Order {
  id: number
  // Short code shown to the customer and staff, e.g. "K7Q2".
  code: string
  restaurantId: number
  createdAt: string
  updatedAt: string
  customer: CheckoutInput['customer']
  fulfilment: CheckoutInput['fulfilment']
  payment: { method: PaymentMethod; status: 'unpaid' | 'pending' | 'paid'; reference?: string }
  lines: OrderLine[]
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  status: OrderStatus
  history: { status: OrderStatus; at: string }[]
  notes?: string
  // 'online' from the storefront; 'counter' entered by staff on the POS.
  channel?: OrderChannel
  // Set once ingredients were taken out of stock (when the order is accepted,
  // or straight away for counter orders) and put back if it's cancelled.
  stockDeducted?: boolean
  // Ingredient cost of the whole order at that moment (owner-only).
  costOfGoods?: number
  // Counter cash: what the customer handed over.
  tendered?: number
  // A counter order rung up offline (§13, eatery): the number the till printed,
  // when it was sold, and flags for the owner to review.
  clientId?: string | null
  receiptNo?: string | null
  soldAt?: string
  syncedAt?: string
  stockShort?: boolean
  priceMismatch?: boolean
}

export type OrderChannel = 'online' | 'counter'

// What staff send from the POS: no prices either — priced like online orders.
export interface CounterOrderInput {
  // Made by the till (§13, eatery): the server records an order with a given
  // clientId once, however many times it's sent.
  clientId?: string
  receiptNo?: string
  deviceId?: string
  soldAt?: string
  lines: OrderLineInput[]
  fulfilment: { type: 'dine-in' | 'pickup'; table?: string }
  customer?: { name?: string; phone?: string }
  payment: { method: 'cash' | 'momo' | 'card'; paid: boolean; reference?: string; tendered?: number }
  notes?: string
}

// ── Ingredients, recipes and costs (owner-only) ─────────────────────────────

export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'bag' | 'crate' | 'bottle' | 'tin' | 'pack' | 'cup' | 'sachet'

export interface Ingredient {
  id: number
  restaurantId: number
  name: string
  // The unit recipes use and stock is counted in ("pcs" for tissue).
  unit: IngredientUnit
  // Average cost of one `unit`, updated by every purchase (weighted average).
  costPerUnit: number
  // Current quantity in `unit`. Can go negative if sales outrun recorded purchases.
  stock: number
  // Warn when stock falls to this level (in `unit`).
  lowStockAt: number
  supplier?: string
  // How it's bought, when that differs from how it's used: a "pack" holding
  // 50 pcs, a "crate" of 24 bottles, a 25 kg "bag". Missing = bought in `unit`.
  purchaseUnit?: string
  // How many `unit` are in one purchaseUnit (50, 24, 25…). Missing = 1.
  perPurchase?: number
}

export interface RecipeLine {
  ingredientId: number
  // Always in the ingredient's own `unit`, per one serving — so stock and cost
  // maths never convert.
  quantity: number
  // How the owner typed it ("g" for a kg ingredient, "purchase" for whole
  // packs), only to show it back the same way.
  unit?: IngredientUnit | 'purchase'
}

// Extras used per order or per item that don't belong to one recipe:
// tissue, takeaway boxes, straws, bags.
export interface PackagingRule {
  id: number
  restaurantId: number
  name: string
  // Which orders: all, take-away (pickup and delivery, incl. counter take-away) or dine-in only.
  when: 'all' | 'takeaway' | 'dine-in'
  // Once per order, or once per item (quantity) in it.
  per: 'order' | 'item'
  ingredients: RecipeLine[]
  active: boolean
}

// What one menu item uses. `choices` adds ingredients for options:
// "Large" uses more dough, "Extra cheese" adds cheese.
export interface Recipe {
  id: number
  restaurantId: number
  itemId: number
  ingredients: RecipeLine[]
  choices: Record<string, RecipeLine[]>
}

export type StockMoveType = 'purchase' | 'usage' | 'return' | 'waste' | 'count'

export interface StockMove {
  id: number
  restaurantId: number
  ingredientId: number
  type: StockMoveType
  // + into stock, − out of stock, in the ingredient's unit.
  quantity: number
  // Cost of this movement (purchases: what was paid; usage/waste: at average cost).
  totalCost: number
  date: string
  orderId?: number
  supplier?: string
  note?: string
  // As the owner entered it, e.g. "3 packs" (quantity is always in the ingredient's unit).
  entered?: string
}

export type ExpenseCategory = 'rent' | 'staff' | 'utilities' | 'gas' | 'transport' | 'packaging' | 'marketing' | 'repairs' | 'other'

// Running costs that aren't ingredients: rent, salaries, light bill, gas…
export interface Expense {
  id: number
  restaurantId: number
  category: ExpenseCategory
  amount: number
  date: string
  note?: string
}

// A directory listing: the restaurant plus what the directory needs to show
// live deals and to match searches against dishes ("shawarma", "latte").
export interface DirectoryEntry extends Restaurant {
  promotions?: Pick<Promotion, 'name' | 'percentOff' | 'schedule' | 'active' | 'description'>[]
  // Section and item names (not hidden), for search.
  menu?: string[]
}

export interface StorefrontBundle {
  restaurant: Restaurant
  categories: MenuCategory[]
  items: MenuItem[]
  promotions: Promotion[]
}

export interface ResourceMap {
  restaurants: Restaurant
  categories: MenuCategory
  items: MenuItem
  promotions: Promotion
  orders: Order
  ingredients: Ingredient
  recipes: Recipe
  stockMoves: StockMove
  expenses: Expense
  packaging: PackagingRule
}
export type ResourceName = keyof ResourceMap
