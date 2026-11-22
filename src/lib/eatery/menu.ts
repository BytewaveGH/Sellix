// Menu rules shared by the storefront, the cart and order pricing: opening
// hours, time-based availability, happy-hour promotions, option validation and
// prices. Pure functions of (menu, now) so they are easy to test.

import type {
  ClockTime,
  FulfilmentType,
  MenuCategory,
  MenuItem,
  OptionGroup,
  OrderLine,
  OrderLineInput,
  Promotion,
  Restaurant,
  TimeWindow,
  WeeklyHours,
} from './types'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const toMinutes = (t: ClockTime) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const nowMinutes = (now: Date) => now.getHours() * 60 + now.getMinutes()

// 24h "17:30" → "5:30pm"; "00:00" → "midnight"
export const clockLabel = (t: ClockTime) => {
  const m = toMinutes(t)
  if (m === 0 || m === 1440) return 'midnight'
  const h = Math.floor(m / 60) % 24
  const min = m % 60
  return `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

// Is `now` inside the window? Overnight windows (to <= from) belong to the day they start.
export const inWindow = (w: TimeWindow, now: Date) => {
  const from = toMinutes(w.from)
  const to = toMinutes(w.to)
  const cur = nowMinutes(now)
  const day = now.getDay()
  if (to > from) return w.days.includes(day) && cur >= from && cur < to
  const yesterday = (day + 6) % 7
  return (w.days.includes(day) && cur >= from) || (w.days.includes(yesterday) && cur < to)
}

export const inAnyWindow = (windows: TimeWindow[] | undefined, now: Date) => !windows?.length || windows.some((w) => inWindow(w, now))

export const windowLabel = (w: TimeWindow) => {
  const days =
    w.days.length === 7
      ? 'Daily'
      : w.days.length === 5 && [1, 2, 3, 4, 5].every((d) => w.days.includes(d))
        ? 'Mon–Fri'
        : w.days
            .slice()
            .sort()
            .map((d) => DAY_SHORT[d])
            .join(', ')
  return `${days} ${clockLabel(w.from)}–${clockLabel(w.to)}`
}

// ── Opening hours ──

const hoursAsWindows = (hours: WeeklyHours): TimeWindow[] =>
  Object.entries(hours).flatMap(([d, periods]) => (periods ?? []).map((p) => ({ days: [Number(d)], from: p.open, to: p.close })))

export const isOpenAt = (hours: WeeklyHours, now: Date) => hoursAsWindows(hours).some((w) => inWindow(w, now))

export interface OpenState {
  open: boolean
  // "Open until 2am" / "Opens 5pm" / "Opens Mon 7am" / "Closed"
  label: string
}

export const openState = (hours: WeeklyHours, now: Date): OpenState => {
  const windows = hoursAsWindows(hours)
  const current = windows.find((w) => inWindow(w, now))
  if (current) return { open: true, label: `Open until ${clockLabel(current.to)}` }
  // Next opening within a week.
  for (let i = 0; i < 7; i++) {
    const day = (now.getDay() + i) % 7
    const starts = (hours[day] ?? [])
      .map((p) => p.open)
      .filter((t) => i > 0 || toMinutes(t) > nowMinutes(now))
      .sort((a, b) => toMinutes(a) - toMinutes(b))
    if (starts.length)
      return {
        open: false,
        label: i === 0 ? `Opens ${clockLabel(starts[0])}` : `Opens ${i === 1 ? 'tomorrow' : DAY_SHORT[day]} ${clockLabel(starts[0])}`,
      }
  }
  return { open: false, label: 'Closed' }
}

export const todaysHoursLabel = (hours: WeeklyHours, now: Date) => {
  const periods = hours[now.getDay()] ?? []
  return periods.length ? periods.map((p) => `${clockLabel(p.open)}–${clockLabel(p.close)}`).join(', ') : 'Closed today'
}

// ── Availability ──

export type Availability =
  | { orderable: true }
  | { orderable: false; reason: 'sold-out' | 'hidden'; label: string }
  | { orderable: false; reason: 'not-now'; label: string }

export const itemAvailability = (item: MenuItem, category: MenuCategory | undefined, now: Date): Availability => {
  if (item.status === 'hidden') return { orderable: false, reason: 'hidden', label: 'Hidden' }
  if (item.status === 'sold-out') return { orderable: false, reason: 'sold-out', label: 'Sold out' }
  for (const windows of [category?.schedule, item.schedule]) {
    if (windows?.length && !inAnyWindow(windows, now))
      return { orderable: false, reason: 'not-now', label: windows.map(windowLabel).join(' · ') }
  }
  return { orderable: true }
}

// ── Promotions ──

export const promotionLive = (p: Promotion, now: Date) => p.active && p.percentOff > 0 && inAnyWindow(p.schedule, now)

export const promotionCovers = (p: Promotion, item: Pick<MenuItem, 'id' | 'categoryId'>) =>
  (p.categoryIds.length === 0 && p.itemIds.length === 0) || p.categoryIds.includes(item.categoryId) || p.itemIds.includes(item.id)

// The best live promotion for an item (promotions don't stack).
export const bestPromotion = (item: Pick<MenuItem, 'id' | 'categoryId'>, promotions: Promotion[], now: Date) =>
  promotions.filter((p) => promotionLive(p, now) && promotionCovers(p, item)).sort((a, b) => b.percentOff - a.percentOff)[0]

// ── Options & pricing ──

export const round2 = (n: number) => Math.round(n * 100) / 100

// "Choose 1" / "Choose up to 3" / "Choose 2–3" / "Optional"
export const groupRule = (g: { min: number; max: number }) =>
  g.min === g.max ? `Choose ${g.min}` : g.min === 0 ? (g.max === 1 ? 'Optional' : `Up to ${g.max}`) : `Choose ${g.min}–${g.max}`

// Default choices: the first available option of each required single-choice group.
export const defaultChoices = (item: MenuItem): Record<string, string[]> =>
  Object.fromEntries(
    item.optionGroups
      .filter((g) => g.min >= 1 && g.max === 1)
      .map((g) => [g.id, [g.choices.find((c) => !c.soldOut)?.id].filter(Boolean) as string[]])
  )

// "Each choice has its own price": an item priced at 0 whose first pick-one
// group holds the full prices (Vanilla ₵15, Pistachio ₵20) rather than extras.
export const priceGroup = (item: Pick<MenuItem, 'price' | 'optionGroups' | 'combo'>) =>
  item.price === 0 && !item.combo ? item.optionGroups.find((g) => g.min >= 1 && g.max === 1) : undefined

// Problems with a set of choices, keyed by group id (or slot id for combos).
export const choiceProblems = (item: MenuItem, choices: Record<string, string[]>, comboPicks: Record<string, number> = {}) => {
  const problems: Record<string, string> = {}
  for (const g of item.optionGroups) {
    const picked = (choices[g.id] ?? []).filter((id) => g.choices.some((c) => c.id === id && !c.soldOut))
    if (picked.length < g.min) problems[g.id] = g.min === 1 ? `Choose a ${g.name.toLowerCase()}` : `Choose at least ${g.min}`
    else if (picked.length > g.max) problems[g.id] = `Choose at most ${g.max}`
    else if (!repeatable(g) && new Set(picked).size < picked.length) problems[g.id] = 'Choose each one only once'
  }
  for (const s of item.combo?.slots ?? []) {
    if (!s.choices.some((c) => c.itemId === comboPicks[s.id])) problems[s.id] = `Choose your ${s.name.toLowerCase()}`
  }
  return problems
}

export interface LinePrice {
  // Before the promotion
  base: number
  discountPerUnit: number
  unitPrice: number
  // Extras charged once for the whole line (see OptionGroup.chargeOnce):
  // before the promotion, the promotion's share, and what's charged.
  onceBase: number
  onceDiscount: number
  onceExtras: number
  promotion?: Promotion
}

// Extras groups charged once per line rather than per portion.
export const chargedOnce = (g: OptionGroup) => g.kind === 'addon' && !!g.chargeOnce

// Extras groups where the same extra can be taken several times (Egg × 3).
export const repeatable = (g: OptionGroup) => g.kind === 'addon' && !!g.repeat

// How many times a choice was picked (repeated ids = more than one).
export const countOf = (ids: string[] | undefined, id: string) => (ids ?? []).filter((x) => x === id).length

// Ids of an item's groups charged once per line (for ingredient use).
export const onceGroupIds = (item: MenuItem | undefined) =>
  new Set((item?.optionGroups ?? []).filter(chargedOnce).map((g) => g.id))

// What a line costs: unitPrice × quantity + onceExtras.
export const lineAmount = (price: Pick<LinePrice, 'unitPrice' | 'onceExtras'>, quantity: number) =>
  round2(price.unitPrice * quantity + price.onceExtras)

export const linePrice = (
  item: MenuItem,
  choices: Record<string, string[]>,
  comboPicks: Record<string, number> | undefined,
  promotions: Promotion[],
  now: Date
): LinePrice => {
  let base = item.price
  let onceBase = 0
  for (const g of item.optionGroups) {
    for (const id of choices[g.id] ?? []) {
      const delta = g.choices.find((c) => c.id === id)?.priceDelta ?? 0
      if (chargedOnce(g)) onceBase += delta
      else base += delta
    }
  }
  for (const s of item.combo?.slots ?? []) base += s.choices.find((c) => c.itemId === comboPicks?.[s.id])?.upcharge ?? 0
  base = Math.max(0, round2(base))
  onceBase = Math.max(0, round2(onceBase))
  const promotion = bestPromotion(item, promotions, now)
  const off = (n: number) => (promotion ? round2((n * promotion.percentOff) / 100) : 0)
  const discountPerUnit = off(base)
  const onceDiscount = off(onceBase)
  return {
    base,
    discountPerUnit,
    unitPrice: round2(base - discountPerUnit),
    onceBase,
    onceDiscount,
    onceExtras: round2(onceBase - onceDiscount),
    promotion,
  }
}

// "Regular · + Fish small, Egg × 3". With more than one portion, extras charged once
// for the line say so ("+ Fish small (once)"), so the kitchen makes one and
// the receipt adds up.
export const choiceSummary = (
  item: MenuItem,
  line: Pick<OrderLineInput, 'choices' | 'comboPicks'> & { quantity?: number },
  itemsById?: Map<number, MenuItem>
) => {
  const parts: string[] = []
  for (const s of item.combo?.slots ?? []) {
    const picked = line.comboPicks?.[s.id]
    if (picked !== undefined) parts.push(itemsById?.get(picked)?.name ?? `#${picked}`)
  }
  for (const g of item.optionGroups) {
    // "Egg × 3, Fish" — each extra once, with how many when more than one.
    const ids = line.choices[g.id] ?? []
    const names = Array.from(new Set(ids))
      .map((id) => {
        const name = g.choices.find((c) => c.id === id)?.name
        const n = countOf(ids, id)
        return name && (n > 1 ? `${name} × ${n}` : name)
      })
      .filter(Boolean) as string[]
    if (!names.length) continue
    const once = chargedOnce(g) && (line.quantity ?? 1) > 1 ? ' (once)' : ''
    parts.push(g.kind === 'addon' ? `+ ${names.join(', ')}${once}` : names.join(', '))
  }
  return parts.join(' · ')
}

export interface PricedOrder {
  lines: OrderLine[]
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  // Human-readable reasons the order can't be placed as is.
  problems: string[]
}

// Prices an order from the current menu. Used for the cart, the checkout
// summary and (in local mode) to store the order — the customer never sends prices.
export const priceOrder = (
  bundle: { restaurant: Restaurant; categories: MenuCategory[]; items: MenuItem[]; promotions: Promotion[] },
  input: OrderLineInput[],
  fulfilment: FulfilmentType | null,
  now: Date
): PricedOrder => {
  const { restaurant } = bundle
  const itemsById = new Map(bundle.items.map((i) => [i.id, i]))
  const categoryById = new Map(bundle.categories.map((c) => [c.id, c]))
  const problems: string[] = []
  const lines: OrderLine[] = []
  let gross = 0
  let discount = 0
  for (const l of input) {
    const item = itemsById.get(l.itemId)
    if (!item) {
      problems.push('An item in your order is no longer on the menu')
      continue
    }
    const avail = itemAvailability(item, categoryById.get(item.categoryId), now)
    if (!avail.orderable) problems.push(`${item.name}: ${avail.reason === 'not-now' ? `only ${avail.label}` : avail.label.toLowerCase()}`)
    const bad = Object.values(choiceProblems(item, l.choices, l.comboPicks))
    if (bad.length) problems.push(`${item.name}: ${bad[0].toLowerCase()}`)
    const quantity = Math.max(1, Math.floor(l.quantity))
    const price = linePrice(item, l.choices, l.comboPicks, bundle.promotions, now)
    lines.push({
      ...l,
      quantity,
      name: item.name,
      summary: choiceSummary(item, { ...l, quantity }, itemsById),
      unitPrice: price.unitPrice,
      discountPerUnit: price.discountPerUnit,
      ...(price.onceBase > 0 ? { onceExtras: price.onceExtras } : {}),
      lineTotal: lineAmount(price, quantity),
    })
    gross += price.base * quantity + price.onceBase
    discount += price.discountPerUnit * quantity + price.onceDiscount
  }
  gross = round2(gross)
  discount = round2(discount)
  const subtotal = round2(gross - discount)
  const delivery = restaurant.fulfilment.delivery
  const deliveryFee = fulfilment === 'delivery' ? delivery.fee : 0
  if (fulfilment === 'delivery' && delivery.minOrder > 0 && subtotal < delivery.minOrder)
    problems.push(`Delivery needs a minimum order of ${formatMoney(delivery.minOrder, restaurant.currency)}`)
  if (fulfilment && !restaurant.fulfilment[fulfilment === 'dine-in' ? 'dineIn' : fulfilment].enabled)
    problems.push(`${fulfilment === 'dine-in' ? 'Dine-in' : fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} isn’t offered here`)
  if (!lines.length) problems.push('Your order is empty')
  return { lines, subtotal: gross, discount, deliveryFee, total: round2(subtotal + deliveryFee), problems }
}

// ── Money ──

const SYMBOLS: Record<string, string> = { GHS: '₵', NGN: '₦', USD: '$', EUR: '€', GBP: '£', XOF: 'CFA ' }
export const formatMoney = (n: number, currency = 'GHS') => {
  const sym = SYMBOLS[currency] ?? `${currency} `
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-GH', { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 })
  return `${n < 0 ? '−' : ''}${sym}${s}`
}
