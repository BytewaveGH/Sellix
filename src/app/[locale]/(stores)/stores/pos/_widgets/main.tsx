'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, Package, X, Zap, ScanLine, Barcode, CheckCircle2, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PopoverTemplate } from '@/components/templates/popover'
import { Sheet, SheetContent, SheetClose } from '@/components/ui/sheet'
import { useFetchData } from '@/hooks/use-fetch'
import { useAxios } from '@/hooks/use-axios'
import { useSession } from 'next-auth/react'
import { ProductServices } from '../../products/inventory/_logics/services'
import { WarehouseServices } from '../../products/categories/_logics/services'
import { IGeneric } from '@/types/interfaces'
import ToastTemplate from '@/components/templates/toast'
import { toast } from 'sonner'
import { type CartItem, type Product, type SellingUnit, mapApiProduct, piecesHint } from '../_logics/types'
import { addLine, changeQty, normalizeStoredCart, removeLine, sanitizeQty, setQty, stockIssues } from '../_logics/cart'
import { buildSalePayload, submitSale, type SaleReceipt } from '../_logics/checkout'
import { looksLikeBarcode, scoreProduct } from '../_logics/scanner/text-match'
import { primeFeedback } from '../_logics/scanner/feedback'
import { RECOGNITION_CONFIG } from '../_logics/scanner/config'
import { RecognitionError } from '../_logics/scanner/recognition'
import { useRecognitionRequests } from '../_logics/scanner/use-recognition-requests'
import ProductScanner from './scanner/product-scanner'
import { formatPhone, MOMO_NETWORKS, useStoreSettings } from '@/lib/store/settings'
import { saleToOrder } from '@/lib/store/orders'
import { printOrder } from '@/lib/store/receipt'
import { useRecognitionFlow } from './scanner/use-recognition-flow'

// ── Pricing helpers ─────────────────────────────────────────────────────────

const computeLineTotal = (item: CartItem, customerType: 'retail' | 'wholesale'): number => {
  switch (item.pricingRule) {
    case 'half-box': {
      const halfQty = Math.floor((item.boxSize ?? 0) / 2)
      if (halfQty > 0 && item.quantity >= halfQty) {
        const halfBoxTotal = (item.boxRetailPrice ?? 0) / 2
        const extra = item.quantity - halfQty
        return halfBoxTotal + extra * item.retailPrice
      }
      return item.retailPrice * item.quantity
    }
    case 'bulk-wholesale':
      return (item.quantity >= (item.bulkThreshold ?? 5) ? item.wholesalePrice : item.retailPrice) * item.quantity
    default:
      return (customerType === 'retail' ? item.retailPrice : item.wholesalePrice) * item.quantity
  }
}

const isPieceAtHalfBox = (item: CartItem) =>
  item.pricingRule === 'half-box' && item.boxSize != null && item.quantity >= Math.floor(item.boxSize / 2)

const isPieceAtBulkWholesale = (item: CartItem) =>
  item.pricingRule === 'bulk-wholesale' && !!item.bulkThreshold && item.quantity >= item.bulkThreshold

// ── Fuzzy search ─────────────────────────────────────────────────────────────
// Returns a relevance score (0 = no match). Higher = better match.
const fuzzyScore = (name: string, query: string): number => {
  const n = name.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 1
  if (n === q) return 1000
  if (n.startsWith(q)) return 900
  if (n.includes(q)) return 800
  // Sequential character match — all query chars must appear in order
  let ni = 0,
    score = 0,
    prev = -1
  for (const ch of q) {
    const idx = n.indexOf(ch, ni)
    if (idx === -1) return 0
    score += prev !== -1 && idx === prev + 1 ? 10 : 1 // bonus for consecutive chars
    prev = idx
    ni = idx + 1
  }
  return score
}

// ── Unit picker list ─────────────────────────────────────────────────────
// Hoisted to module scope (not defined inside Main) so its identity stays
// stable across renders — otherwise every cart change would remount it.
type UnitListProps = {
  product: Product
  cart: CartItem[]
  customerType: 'retail' | 'wholesale'
  onAddToCart: (product: Product, unit: SellingUnit) => void
}

const UnitList = ({ product, cart, customerType, onAddToCart }: UnitListProps) => (
  <div className="flex flex-col gap-2.5">
    {product.units.map((unit: SellingUnit) => {
      const price = unit.pricingRule === 'flat' ? (customerType === 'retail' ? unit.retailPrice : unit.wholesalePrice) : unit.retailPrice
      const unitInCart = cart.find((i) => i.cartId === `${product.id}_${unit.unit}`)
      let hint: string | null = null
      if (unit.pricingRule === 'half-box' && unit.boxSize && unit.boxRetailPrice)
        hint = `₵${(unit.boxRetailPrice / 2).toFixed(2)} flat at ${unit.boxSize / 2}+`
      else if (unit.pricingRule === 'bulk-wholesale') hint = `₵${unit.wholesalePrice.toFixed(2)} at ${unit.bulkThreshold ?? 5}+`
      return (
        <button
          key={unit.unit}
          onClick={() => onAddToCart(product, unit)}
          className={cn(
            'flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border transition-all text-left active:scale-[0.98]',
            unitInCart ? 'border-endeavour bg-endeavour/5' : 'border-gray-200 hover:border-endeavour/60'
          )}
        >
          <div>
            <span className="text-sm font-semibold text-stone-700">
              {unit.label}
              {unitInCart && (
                <span className="ml-2 bg-endeavour text-white text-[10px] rounded-full px-2 py-0.5">{unitInCart.quantity} in cart</span>
              )}
            </span>
            {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
          </div>
          <span className="text-sm font-bold text-endeavour ml-4 flex-shrink-0">₵{price.toFixed(2)}</span>
        </button>
      )
    })}
  </div>
)

// ── Single product card (shared by grid and letter sections) ─────────────
// Also hoisted to module scope for the same reason as UnitList above.
type ProductCardProps = {
  product: Product
  cart: CartItem[]
  customerType: 'retail' | 'wholesale'
  openPopover: string | null
  onOpenPopoverChange: (open: boolean, productId: string) => void
  onAddToCart: (product: Product, unit: SellingUnit) => void
  onOpenUnitPicker: (product: Product) => void
}

const ProductCard = ({
  product,
  cart,
  customerType,
  openPopover,
  onOpenPopoverChange,
  onAddToCart,
  onOpenUnitPicker,
}: ProductCardProps) => {
  const inCartUnits = cart.filter((i) => i.productId === product.id)
  const totalInCart = inCartUnits.reduce((s, i) => s + i.quantity, 0)
  const isMultiUnit = product.units.length > 1
  const primaryUnit = product.units[0]
  const displayPrice =
    primaryUnit?.pricingRule === 'flat'
      ? customerType === 'retail'
        ? primaryUnit.retailPrice
        : primaryUnit.wholesalePrice
      : (primaryUnit?.retailPrice ?? 0)

  const cardClass = cn(
    'relative flex flex-col justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer select-none',
    'bg-white active:scale-[0.96]',
    totalInCart > 0 ? 'border-endeavour shadow-sm shadow-endeavour/10' : 'border-gray-200 hover:border-endeavour/50 hover:shadow-sm'
  )

  const inner = (
    <>
      {totalInCart > 0 && (
        <span className="absolute top-2 right-2 bg-endeavour text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-10">
          {totalInCart}
        </span>
      )}
      {isMultiUnit && (
        <span className="absolute top-2 left-2 bg-gray-100 text-gray-500 text-[9px] rounded-md px-1.5 py-0.5 font-medium">
          {product.units.length} units
        </span>
      )}
      <div className="w-full aspect-square rounded-xl bg-gray-50 mb-2.5 flex items-center justify-center text-2xl overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted catalog images
          <img src={product.imageUrl} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          '🛒'
        )}
      </div>
      <div>
        <p className="text-stone-700 font-semibold leading-tight line-clamp-2 text-xs">{product.name}</p>
        <p className="text-endeavour font-bold mt-1 text-sm">
          ₵{displayPrice.toFixed(2)}
          {isMultiUnit && primaryUnit && <span className="text-gray-400 font-normal text-[10px] ml-1">/ {primaryUnit.label}</span>}
        </p>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile: bottom sheet for multi-unit */}
      <div
        className={cn(cardClass, 'md:hidden')}
        onClick={() => (isMultiUnit ? onOpenUnitPicker(product) : onAddToCart(product, primaryUnit))}
      >
        {inner}
      </div>
      {/* Desktop: popover for multi-unit */}
      {isMultiUnit ? (
        <PopoverTemplate
          open={openPopover === product.id}
          onOpenChange={(open) => onOpenPopoverChange(open, product.id)}
          contentClassName="w-64 p-3"
          trigger={<div className={cn(cardClass, 'hidden md:flex flex-col')}>{inner}</div>}
          content={
            <div className="flex flex-col gap-2">
              <p className="text-stone-600 font-semibold text-sm">{product.name}</p>
              <p className="text-gray-400 text-xs -mt-1">Choose how to sell:</p>
              <UnitList product={product} cart={cart} customerType={customerType} onAddToCart={onAddToCart} />
            </div>
          }
        />
      ) : (
        <div className={cn(cardClass, 'hidden md:flex flex-col')} onClick={() => onAddToCart(product, primaryUnit)}>
          {inner}
        </div>
      )}
    </>
  )
}

// ── Quick Access strip ────────────────────────────────────────────────────
// Also hoisted to module scope for the same reason as UnitList/ProductCard above.
type QuickAccessStripProps = {
  quickAccess: Product[]
  cart: CartItem[]
  customerType: 'retail' | 'wholesale'
  onAddToCart: (product: Product, unit: SellingUnit) => void
  onOpenUnitPicker: (product: Product) => void
}

const QuickAccessStrip = ({ quickAccess, cart, customerType, onAddToCart, onOpenUnitPicker }: QuickAccessStripProps) => {
  if (quickAccess.length === 0) return null
  return (
    <div className="mb-3 flex-shrink-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="h-3 w-3 text-amber-500" />
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quick Access</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-0.5 px-0.5">
        {quickAccess.map((product) => {
          const pu = product.units[0]
          const price =
            pu?.pricingRule === 'flat' ? (customerType === 'retail' ? pu.retailPrice : pu.wholesalePrice) : (pu?.retailPrice ?? 0)
          const inCart = cart.filter((i) => i.productId === product.id).reduce((s, i) => s + i.quantity, 0)
          return (
            <button
              key={product.id}
              onClick={() => (product.units.length > 1 ? onOpenUnitPicker(product) : onAddToCart(product, pu))}
              className={cn(
                'flex-shrink-0 flex flex-col items-start px-3 py-2.5 rounded-2xl border transition-all active:scale-95 min-w-[76px] max-w-[110px]',
                inCart > 0 ? 'border-endeavour bg-endeavour/5' : 'border-gray-200 bg-white hover:border-endeavour/50'
              )}
            >
              <span className="text-[11px] font-semibold text-stone-700 truncate w-full leading-tight">{product.name}</span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[11px] font-bold text-endeavour">₵{price.toFixed(2)}</span>
                {inCart > 0 && <span className="text-[9px] bg-endeavour text-white rounded-full px-1.5 font-bold">{inCart}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

const Main = () => {
  const request = useAxios()
  const { data: session } = useSession()

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('bytewave-pos-cart')
      return saved ? normalizeStoredCart(JSON.parse(saved)) : []
    } catch {
      return []
    }
  })

  // Track how often each product is added to cart (for Quick Access ordering)
  const [freqMap, setFreqMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('bytewave-pos-freq') || '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('bytewave-pos-cart', JSON.stringify(cart))
    } catch {}
  }, [cart])

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [customerType, setCustomerType] = useState<'retail' | 'wholesale'>('retail')
  const [openPopover, setOpenPopover] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [unitPickerProduct, setUnitPickerProduct] = useState<Product | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  // Checkout feedback: server error (cart kept) or the server's receipt.
  const [checkoutError, setCheckoutError] = useState<{ message: string; productId?: string } | null>(null)
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null)

  // Store settings: starting warehouse and prices, payment methods, receipts.
  const { settings: storeSettings, loaded: settingsLoaded } = useStoreSettings()
  const appliedDefaults = useRef(false)
  useEffect(() => {
    if (!settingsLoaded || appliedDefaults.current) return
    appliedDefaults.current = true
    if (storeSettings.pos.defaultWarehouseId) setWarehouseId((w) => w || storeSettings.pos.defaultWarehouseId!)
    setCustomerType(storeSettings.pos.defaultCustomerType)
  }, [settingsLoaded, storeSettings])
  const pay = storeSettings.payments
  const momoHint = pay.momoNumber
    ? `${MOMO_NETWORKS.find((n) => n.value === pay.momoNetwork)?.label ?? 'MoMo'} ${formatPhone(pay.momoNumber)}${pay.momoName ? ` · ${pay.momoName}` : ''}`
    : ''
  const printReceipt = (r: SaleReceipt) =>
    printOrder(
      saleToOrder({ ...r, employeeName: session?.user?.username, warehouseName: warehouses.find((w: any) => w.id === warehouseId)?.name }),
      storeSettings
    )

  // Refs for alphabetic scroll
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Draggable cart sheet ────────────────────────────────────────────────
  const [cartHeight, setCartHeight] = useState(56)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(56)
  const liveH = useRef(56)

  const closeCartSheet = () => {
    setCartSheetOpen(false)
    setTimeout(() => {
      setCartHeight(56)
      liveH.current = 56
    }, 50)
  }

  const onHandleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragStartH.current = liveH.current
    setDragging(true)
  }
  const onHandleTouchMove = (e: React.TouchEvent) => {
    const dy = dragStartY.current - e.touches[0].clientY
    const newH = Math.min(97, Math.max(12, dragStartH.current + (dy / window.innerHeight) * 100))
    liveH.current = newH
    setCartHeight(newH)
  }
  const onHandleTouchEnd = () => {
    setDragging(false)
    const h = liveH.current
    if (h < 25) {
      closeCartSheet()
    } else if (h > 72) {
      setCartHeight(95)
      liveH.current = 95
    } else {
      setCartHeight(56)
      liveH.current = 56
    }
  }

  const { data: warehousesData } = useFetchData('warehouses', WarehouseServices.FetchAll() as unknown as IGeneric)
  const warehouses = (warehousesData as any[] | undefined) ?? []

  const { data: rawProducts, isLoading } = useFetchData('pos-products', ProductServices.FetchAll({ limit: 1000, offset: 0 }))

  const products: Product[] = useMemo(() => ((rawProducts as any[] | undefined) ?? []).map(mapApiProduct), [rawProducts])

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {}
    ;((rawProducts as any[] | undefined) ?? []).forEach((p: any) => {
      map[String(p.id)] = p.totalQuantity ?? 0
    })
    return map
  }, [rawProducts])

  // Advisory stock check in base units (quantity × baseQuantity, summed per
  // product across Box/Bottle lines). The server is the authority (409).
  const overStock = useMemo(() => stockIssues(cart, stockMap), [cart, stockMap])

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products])

  // ── Quick Access: top 8 most-frequently added (only in browse mode) ────────
  const quickAccess = useMemo(() => {
    if (search.trim() || activeCategory !== 'All') return []
    return [...products]
      .filter((p) => (freqMap[p.id] ?? 0) > 0)
      .sort((a, b) => (freqMap[b.id] ?? 0) - (freqMap[a.id] ?? 0))
      .slice(0, 8)
  }, [products, freqMap, search, activeCategory])

  // ── Fuzzy search results (used when search is active) ────────────────────
  // scoreProduct covers name/brand/SKU/barcode/category and tolerates typos;
  // fuzzyScore keeps the in-order-letters shorthand ("hpm" → "Happy Man").
  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const base = activeCategory === 'All' ? products : products.filter((p) => p.category === activeCategory)
    return base
      .map((p) => ({ p, score: scoreProduct(p, search), seq: fuzzyScore(p.name, search) }))
      .filter((x) => x.score >= 0.55 || x.seq > 0)
      .sort((a, b) => b.score - a.score || b.seq - a.seq)
      .map((x) => x.p)
  }, [products, search, activeCategory])

  // ── Alphabetical groups (used in browse mode, no search) ─────────────────
  const letterGroups = useMemo((): [string, Product[]][] => {
    if (search.trim()) return []
    const base = activeCategory === 'All' ? products : products.filter((p) => p.category === activeCategory)
    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name))
    const groups: Record<string, Product[]> = {}
    sorted.forEach((p) => {
      const ch = (p.name[0] ?? '').toUpperCase()
      const key = /[A-Z]/.test(ch) ? ch : '#'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
  }, [products, search, activeCategory])

  // ── Scroll product grid to a letter section ───────────────────────────────
  const scrollToLetter = (letter: string) => {
    const el = letterRefs.current[letter]
    const container = gridScrollRef.current
    if (!el || !container) return
    const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollBy({ top: offset - 8, behavior: 'smooth' })
  }

  const addToCart = (product: Product, unit: SellingUnit) => {
    setCart((prev) => addLine(prev, product, unit))
    setCheckoutError(null)
    // Bump frequency counter
    setFreqMap((prev) => {
      const next = { ...prev, [product.id]: (prev[product.id] ?? 0) + 1 }
      try {
        localStorage.setItem('bytewave-pos-freq', JSON.stringify(next))
      } catch {}
      return next
    })
    setOpenPopover(null)
    setUnitPickerProduct(null)
  }

  const updateQty = (cartId: string, delta: number) => setCart((prev) => changeQty(prev, cartId, delta))
  const setLineQty = (cartId: string, qty: number) => setCart((prev) => setQty(prev, cartId, qty))
  const removeFromCart = (cartId: string) => setCart((prev) => removeLine(prev, cartId))

  const clearCart = () => {
    setCart([])
    try {
      localStorage.removeItem('bytewave-pos-cart')
    } catch {}
  }

  const getLineTotal = (item: CartItem) => computeLineTotal(item, customerType)
  const subtotal = cart.reduce((sum, i) => sum + getLineTotal(i), 0)
  const total = subtotal
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const hasOverStock = Object.keys(overStock).length > 0
  // Stock warnings are advisory — the server re-checks atomically and answers 409.
  const canCharge = cart.length > 0 && !!warehouseId && !isSubmitting

  const handleCharge = async (paymentType: 'momo' | 'cash') => {
    if (!canCharge) return
    setIsSubmitting(true)
    setCheckoutError(null)
    // No prices are sent: the server prices the sale from the database.
    const result = await submitSale(request, buildSalePayload(cart, { paymentType, warehouseId, customerType, user: session?.user }))
    setIsSubmitting(false)
    if (result.ok) {
      clearCart()
      setCartSheetOpen(false)
      setReceipt(result.receipt)
      if (storeSettings.receipt.autoPrint) printReceipt(result.receipt)
    } else {
      // 409 / 422 / network: keep the cart so the cashier can adjust.
      setCheckoutError({ message: result.message, productId: result.kind === 'stock' ? result.productId : undefined })
    }
  }

  // ── Keyboard-wedge / typed barcode → exact barcode lookup ────────────────
  const barcodeRequests = useRecognitionRequests(RECOGNITION_CONFIG)
  const barcodeFlow = useRecognitionFlow({ products, customerType, onAdd: addToCart, onUndo: (cartId) => updateQty(cartId, -1) })
  const lookupTypedBarcode = async (code: string) => {
    try {
      const result = await barcodeRequests.lookup(code)
      if (result) {
        setSearch('')
        barcodeFlow.handleResult(result)
      }
    } catch (err) {
      toast.error(err instanceof RecognitionError ? err.message : 'Barcode lookup failed.')
    }
  }

  // ── Cart warehouse + customer type controls ──────────────────────────────
  const CartControls = () => (
    <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
      <select
        value={warehouseId}
        onChange={(e) => setWarehouseId(Number(e.target.value))}
        className="w-full mb-2.5 px-3 py-2.5 border border-gray-200 rounded-xl text-base md:text-sm text-stone-600 focus:outline-none focus:ring-1 focus:ring-endeavour bg-white"
      >
        <option value={0} disabled>
          Select warehouse
        </option>
        {warehouses.map((w: any) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <div className="flex rounded-xl border border-gray-200 overflow-hidden">
        {(['retail', 'wholesale'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setCustomerType(type)}
            className={cn(
              'flex-1 py-2 text-xs font-bold capitalize transition-colors',
              customerType === type ? 'bg-endeavour text-white' : 'bg-white text-gray-500'
            )}
          >
            {type}
          </button>
        ))}
      </div>
      <p className="text-[9px] text-gray-400 mt-1.5 text-center">Box & carton pricing only · Pieces priced by quantity rules</p>
    </div>
  )

  // ── Cart items list + totals ─────────────────────────────────────────────
  const CartBody = () => (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300 py-10">
            <ShoppingCart className="h-12 w-12 opacity-40" />
            <p className="text-sm">No items added yet</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {cart.map((item) => {
              const lineTotal = getLineTotal(item)
              const atHalfBox = isPieceAtHalfBox(item)
              const atBulkWholesale = isPieceAtBulkWholesale(item)
              const issue = overStock[item.productId]
              const conflict = checkoutError?.productId === item.productId
              const pcs = piecesHint(item.baseQuantity)
              return (
                <div
                  key={item.cartId}
                  className={cn(
                    'flex items-center gap-2.5 py-3',
                    (issue || conflict) && 'bg-red-50 -mx-2 px-2 rounded-xl',
                    conflict && 'ring-1 ring-red-300'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-700 text-sm font-semibold truncate">{item.name}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <p className="text-gray-400 text-xs">
                        {item.unitLabel}
                        {pcs ? ` (${pcs})` : ''}
                      </p>
                      {atHalfBox && (
                        <span className="text-[9px] bg-blue-100 text-blue-600 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap">
                          ½ box
                          {item.quantity > Math.floor(item.boxSize! / 2) ? ` + ${item.quantity - Math.floor(item.boxSize! / 2)}pc` : ''}
                        </span>
                      )}
                      {(atBulkWholesale || (item.pricingRule === 'flat' && customerType === 'wholesale')) && (
                        <span className="text-[9px] bg-amber-100 text-amber-600 rounded-md px-1.5 py-0.5 font-medium">wholesale</span>
                      )}
                      {issue && (
                        <span className="text-[9px] bg-red-100 text-red-600 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap">
                          ⚠ needs {issue.need} pcs, {issue.have} in stock
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateQty(item.cartId, -1)}
                      className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:border-endeavour hover:text-endeavour active:scale-90 transition-all"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      // Remount on external changes (+/−, scanner) so the field shows the new value.
                      key={item.quantity}
                      defaultValue={item.quantity}
                      inputMode="numeric"
                      aria-label={`Quantity of ${item.name} ${item.unitLabel}`}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      onBlur={(e) => {
                        const qty = sanitizeQty(e.currentTarget.value)
                        if (qty === null) e.currentTarget.value = String(item.quantity)
                        else if (qty !== item.quantity) setLineQty(item.cartId, qty)
                      }}
                      className="text-stone-700 w-9 h-7 text-center text-base md:text-sm font-bold rounded-md border border-transparent hover:border-gray-200 focus:border-endeavour focus:outline-none bg-transparent"
                    />
                    <button
                      onClick={() => updateQty(item.cartId, +1)}
                      className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:border-endeavour hover:text-endeavour active:scale-90 transition-all"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-stone-700 text-sm font-bold w-16 text-right flex-shrink-0">₵{lineTotal.toFixed(2)}</p>
                  <button
                    onClick={() => removeFromCart(item.cartId)}
                    className="text-gray-300 hover:text-red-400 active:scale-90 transition-all flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 py-4 flex flex-col gap-2 flex-shrink-0">
        {checkoutError && (
          <div role="alert" className="flex items-start gap-1.5 px-3 py-2 rounded-xl bg-red-50 border border-red-200 mb-1">
            <span className="text-red-500 text-xs">⚠</span>
            <p className="text-xs text-red-600">{checkoutError.message}</p>
          </div>
        )}
        {hasOverStock && !checkoutError && (
          <div className="flex items-start gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 mb-1">
            <span className="text-amber-500 text-xs">⚠</span>
            <p className="text-xs text-amber-700">Some items may exceed available stock. The sale will be checked when you charge.</p>
          </div>
        )}
        <div className="flex justify-between text-sm text-gray-500">
          <span>Subtotal</span>
          <span>₵{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-stone-700 text-base border-t border-gray-100 pt-2">
          <span>
            Total <span className="text-[10px] font-normal text-gray-400">(estimate)</span>
          </span>
          <span>₵{total.toFixed(2)}</span>
        </div>
        <div className="flex gap-2 mt-1">
          {pay.momo && (
            <button
              disabled={!canCharge}
              onClick={() => handleCharge('momo')}
              className={cn(
                'flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all',
                !canCharge
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-endeavour text-white hover:bg-veniceBlue active:scale-[0.97]'
              )}
            >
              {isSubmitting ? 'Processing...' : `MoMo · ₵${total.toFixed(2)}`}
              {momoHint && !isSubmitting && <span className="block text-[10px] font-normal opacity-80 truncate px-1">{momoHint}</span>}
            </button>
          )}
          {pay.cash && (
            <button
              disabled={!canCharge}
              onClick={() => handleCharge('cash')}
              className={cn(
                'flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all',
                !canCharge
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 active:scale-[0.97]'
              )}
            >
              {isSubmitting ? 'Processing...' : `Cash · ₵${total.toFixed(2)}`}
            </button>
          )}
        </div>
      </div>
    </>
  )

  const showSidebar = !search.trim() && letterGroups.length > 0
  const showBrowseMode = !search.trim()

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-[calc(100vh-5rem)] flex flex-col overflow-hidden">
      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden min-h-0 gap-3">
        {/* ── Products panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Search + category tabs */}
          <div className="flex-shrink-0 pb-3 space-y-2.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  // Hardware (keyboard-wedge) scanners type the code and press Enter.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && looksLikeBarcode(search)) {
                      e.preventDefault()
                      void lookupTypedBarcode(search.trim())
                    }
                  }}
                  placeholder="Search name, brand, SKU or scan a barcode…"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-base md:text-sm text-stone-600 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-endeavour bg-white"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  primeFeedback()
                  setScannerOpen(true)
                }}
                className="flex-shrink-0 flex items-center gap-2 px-4 rounded-xl bg-endeavour text-white text-sm font-semibold hover:bg-veniceBlue active:scale-[0.97] transition-all"
                aria-label="Scan products with camera"
              >
                <ScanLine className="h-4 w-4" />
                <span>Scan</span>
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat: string) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'px-4 py-1.5 rounded-full whitespace-nowrap border transition-colors text-xs font-semibold flex-shrink-0',
                    activeCategory === cat
                      ? 'bg-endeavour text-white border-endeavour'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-endeavour hover:text-endeavour'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product area with A-Z sidebar */}
          <div className="relative flex-1 overflow-hidden min-h-0">
            {/* Scrollable grid */}
            <div ref={gridScrollRef} className={cn('h-full overflow-y-auto pb-24 md:pb-2', showSidebar && 'pr-8')}>
              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 animate-pulse" style={{ aspectRatio: '3/4' }} />
                  ))}
                </div>
              ) : search.trim() ? (
                /* ── Fuzzy search results ── */
                searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
                    <Package className="h-8 w-8 opacity-40" />
                    <p className="text-sm">No products match "{search}"</p>
                    <button onClick={() => setSearch('')} className="text-xs text-endeavour underline underline-offset-2">
                      Clear search
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] text-gray-400 mb-2.5">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{search}"
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                      {searchResults.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          cart={cart}
                          customerType={customerType}
                          openPopover={openPopover}
                          onOpenPopoverChange={(open, id) => setOpenPopover(open ? id : null)}
                          onAddToCart={addToCart}
                          onOpenUnitPicker={setUnitPickerProduct}
                        />
                      ))}
                    </div>
                  </>
                )
              ) : (
                /* ── Browse mode: quick access + alphabetical sections ── */
                <>
                  <QuickAccessStrip
                    quickAccess={quickAccess}
                    cart={cart}
                    customerType={customerType}
                    onAddToCart={addToCart}
                    onOpenUnitPicker={setUnitPickerProduct}
                  />

                  {letterGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
                      <Package className="h-8 w-8 opacity-40" />
                      <p className="text-sm">No products found</p>
                    </div>
                  ) : (
                    letterGroups.map(([letter, prods]) => (
                      <div key={letter} className="mb-4">
                        {/* Letter section header */}
                        <div
                          ref={(el) => {
                            letterRefs.current[letter] = el
                          }}
                          className="flex items-center gap-2 mb-2"
                        >
                          <span className="text-xs font-bold text-endeavour bg-endeavour/8 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0">
                            {letter}
                          </span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {prods.map((p) => (
                            <ProductCard
                              key={p.id}
                              product={p}
                              cart={cart}
                              customerType={customerType}
                              openPopover={openPopover}
                              onOpenPopoverChange={(open, id) => setOpenPopover(open ? id : null)}
                              onAddToCart={addToCart}
                              onOpenUnitPicker={setUnitPickerProduct}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                  <div className="pb-4" />
                </>
              )}
            </div>

            {/* ── A-Z Sidebar ── */}
            {showSidebar && (
              <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center z-20 py-1">
                <div className="bg-white/80 backdrop-blur-sm rounded-l-xl border border-r-0 border-gray-200 shadow-sm py-1 flex flex-col items-center gap-0">
                  {letterGroups.map(([letter]) => (
                    <button
                      key={letter}
                      onClick={() => scrollToLetter(letter)}
                      className="w-7 h-7 text-[11px] font-bold text-gray-400 hover:text-endeavour active:text-endeavour active:bg-endeavour/10 transition-colors flex items-center justify-center rounded-lg"
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop: persistent cart panel ── */}
        <div className="hidden md:flex w-[340px] flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-endeavour" />
              <span className="font-semibold text-stone-700 text-sm">Current Order</span>
              {cartCount > 0 && (
                <span className="bg-endeavour text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                Clear all
              </button>
            )}
          </div>
          {CartControls()}
          {CartBody()}
        </div>
      </div>

      {/* ── Mobile: fixed floating cart bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-4 pt-2">
        <button
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all shadow-lg shadow-black/10',
            cartCount > 0 ? 'bg-endeavour text-white active:bg-veniceBlue' : 'bg-gray-100 text-gray-400 cursor-default'
          )}
          onClick={() => {
            if (cartCount > 0) {
              setCartSheetOpen(true)
              setCartHeight(95)
              liveH.current = 95
            }
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                cartCount > 0 ? 'bg-white/20' : 'bg-gray-200'
              )}
            >
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-tight">
                {cartCount > 0 ? `${cartCount} item${cartCount !== 1 ? 's' : ''} in cart` : 'Cart is empty'}
              </p>
              {cartCount > 0 && <p className="text-xs opacity-75">Tap to view & checkout</p>}
            </div>
          </div>
          {cartCount > 0 && <span className="font-bold text-base">₵{total.toFixed(2)}</span>}
        </button>
      </div>

      {/* ── Mobile: draggable cart overlay ── */}
      {cartSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200" onClick={closeCartSheet} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-[100%] duration-300"
            style={{ height: `${cartHeight}dvh`, transition: dragging ? 'none' : 'height 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          >
            <div
              className="flex justify-center pt-3 pb-2 flex-shrink-0 touch-none"
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
            >
              <div className={cn('w-12 h-1.5 rounded-full transition-colors', dragging ? 'bg-gray-400' : 'bg-gray-200')} />
            </div>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-endeavour" />
                <span className="font-semibold text-stone-700 text-sm">Current Order</span>
                {cartCount > 0 && (
                  <span className="bg-endeavour text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Clear all
                  </button>
                )}
                <button
                  onClick={closeCartSheet}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {CartControls()}
            {CartBody()}
          </div>
        </div>
      )}

      {/* ── Mobile: unit picker bottom sheet ── */}
      <Sheet
        open={!!unitPickerProduct}
        onOpenChange={(open) => {
          if (!open) setUnitPickerProduct(null)
        }}
      >
        <SheetContent side="bottom" className="p-0 gap-0 rounded-t-3xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          <div className="px-4 pb-3 pt-2 flex items-start justify-between">
            <div>
              <h3 className="font-bold text-stone-800 text-base leading-tight">{unitPickerProduct?.name}</h3>
              <p className="text-gray-400 text-xs mt-0.5">Choose how to sell</p>
            </div>
            <SheetClose asChild>
              <button className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0 mt-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </SheetClose>
          </div>
          <div className="px-4 pb-8">
            {unitPickerProduct && <UnitList product={unitPickerProduct} cart={cart} customerType={customerType} onAddToCart={addToCart} />}
          </div>
        </SheetContent>
      </Sheet>

      <ToastTemplate position="top-center" className="z-[70]" />

      {/* ── Barcode typed/scanned into the search box: prompts ── */}
      {(barcodeFlow.prompt || barcodeRequests.busy) && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={barcodeFlow.closePrompt} />
          {barcodeRequests.busy && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-lg text-sm text-stone-700">
                <Barcode className="h-4 w-4 animate-pulse" /> Looking up barcode…
              </div>
            </div>
          )}
          <div className="absolute inset-0 md:left-1/2 md:-translate-x-1/2 md:w-[480px] pointer-events-none [&>*]:pointer-events-auto">
            {barcodeFlow.prompts}
          </div>
        </div>
      )}

      {/* ── Receipt: the server's prices and total are final ── */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReceipt(null)} />
          <div
            role="dialog"
            aria-label="Sale receipt"
            className="relative bg-white w-full md:w-[420px] rounded-t-3xl md:rounded-3xl p-5 max-h-[85dvh] flex flex-col"
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="font-bold text-stone-800">Sale recorded</p>
              <span className="ml-auto text-xs text-gray-400 capitalize">{receipt.paymentType}</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {receipt.items.map((i) => (
                <div key={i.productUnitId} className="flex items-center gap-2 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-700 truncate">{i.productName}</p>
                    <p className="text-xs text-gray-400">
                      {i.unitName} · {i.quantity} × ₵{i.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <p className="font-bold text-stone-700">₵{i.subtotal.toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-stone-800 text-lg border-t border-gray-100 pt-3 mt-2">
              <span>Total</span>
              <span>₵{receipt.totalAmount.toFixed(2)}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => printReceipt(receipt)}
                className="h-12 flex-1 rounded-2xl border border-gray-200 text-stone-700 font-semibold inline-flex items-center justify-center gap-2 hover:bg-gray-50"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button onClick={() => setReceipt(null)} className="h-12 flex-[2] rounded-2xl bg-endeavour text-white font-semibold">
                New sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Camera product scanner ── */}
      <ProductScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        products={products}
        cart={cart}
        customerType={customerType}
        cartTotal={total}
        onAdd={addToCart}
        onUpdateQty={updateQty}
        onReviewCart={() => {
          setScannerOpen(false)
          if (!window.matchMedia('(min-width: 768px)').matches && cart.length > 0) {
            setCartSheetOpen(true)
            setCartHeight(95)
            liveH.current = 95
          }
        }}
      />
    </div>
  )
}

export default Main
