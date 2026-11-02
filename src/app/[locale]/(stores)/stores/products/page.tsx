'use client'

// All products: the catalogue at a glance — photo, prices per unit, cost,
// stock and low-stock warnings — with add, edit and delete. Stock movements,
// invoices and transfers stay in Inventory.

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFetchData } from '@/hooks/use-fetch'
import { useAxios } from '@/hooks/use-axios'
import { IGeneric } from '@/types/interfaces'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/kit/ui'
import { ConfirmDialog, Input, Select } from '@/components/kit/form'
import { SheetTemplate } from '@/components/templates/sheet'
import { money } from '@/lib/store/orders'
import { ProductServices } from './inventory/_logics/services'
import { unitCosts } from './inventory/_logics/product-payload'
import CreateProduct from './inventory/_widgets/_forms/create-product'

type Sort = 'name' | 'stock-low' | 'price-high'

const stockOf = (p: any) => Number(p.totalQuantity ?? 0) || 0
const isLow = (p: any) => p.minQuantity != null && stockOf(p) < Number(p.minQuantity)
const lowestPrice = (p: any) =>
  Math.min(...((p.units ?? []) as any[]).map((u) => Number(u.retailPrice) || 0).filter((n) => n > 0), Infinity)

// Stock is kept in base units; show it in the largest pack too ("240 · 10 Box").
const stockLabel = (p: any) => {
  const n = stockOf(p)
  const pack = ((p.units ?? []) as any[]).reduce<any>((best, u) => ((u.baseQuantity ?? 1) > (best?.baseQuantity ?? 1) ? u : best), null)
  return pack && pack.baseQuantity > 1 ? `${n} · ${Math.floor(n / pack.baseQuantity)} ${pack.unitName ?? 'pack'}` : String(n)
}

export default function ProductsPage() {
  const locale = (useParams()?.locale as string) || 'en'
  const request = useAxios()
  const { data, isLoading, refetch } = useFetchData(
    'store-products',
    ProductServices.FetchAll({ limit: 1000, offset: 0 }) as unknown as IGeneric
  )
  const products = (data as any[]) ?? []
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('name')
  const [editing, setEditing] = useState<{ open: boolean; product: any | null }>({ open: false, product: null })
  const [removing, setRemoving] = useState<any | null>(null)

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort() as string[], [products])
  const lowCount = products.filter(isLow).length
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products
      .filter(
        (p) =>
          (!category || p.category === category) &&
          (!lowOnly || isLow(p)) &&
          (!s ||
            [p.name, p.brand, p.sku, ...(p.aliases ?? [])].some((v) => typeof v === 'string' && v.toLowerCase().includes(s)) ||
            ((p.units ?? []) as any[]).some((u) => (u.barcodes ?? []).some((b: any) => String(b.code ?? b).includes(s))))
      )
      .sort((a, b) =>
        sort === 'stock-low'
          ? stockOf(a) - stockOf(b)
          : sort === 'price-high'
            ? lowestPrice(b) - lowestPrice(a)
            : String(a.name).localeCompare(String(b.name))
      )
  }, [products, q, category, lowOnly, sort])

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Products"
        title="All products"
        description="Your catalogue: prices, costs and stock for every unit you sell."
        actions={
          <>
            <Link
              href={`/${locale}/stores/products/inventory`}
              className="inline-flex h-10 items-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Inventory
            </Link>
            <Button icon={Plus} onClick={() => setEditing({ open: true, product: null })}>
              Add product
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-3 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            aria-label="Search products"
            placeholder="Search by name, brand, SKU or barcode"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <Select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
            ]}
            className="lg:w-44"
          />
          <Select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            options={[
              { value: 'name', label: 'Name A–Z' },
              { value: 'stock-low', label: 'Lowest stock' },
              { value: 'price-high', label: 'Highest price' },
            ]}
            className="lg:w-40"
          />
        </div>
        {lowCount > 0 && (
          <button
            type="button"
            aria-pressed={lowOnly}
            onClick={() => setLowOnly((v) => !v)}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold whitespace-nowrap',
              lowOnly ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
            )}
          >
            <AlertTriangle className="h-4 w-4" /> {lowCount} low on stock
          </button>
        )}
      </Card>

      {isLoading && !data ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length ? 'No products match' : 'No products yet'}
          description={
            products.length ? 'Try another search or category.' : 'Add the things you sell, with a price for each unit (piece, pack, box…).'
          }
          action={
            !products.length && (
              <Button icon={Plus} onClick={() => setEditing({ open: true, product: null })}>
                Add your first product
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-stone-500">
            {shown.length} of {products.length} products
          </p>
          <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" aria-label="Products">
            {shown.map((p) => {
              const units: any[] = p.units ?? []
              const costs = unitCosts(Number(p.purchasePrice) || 0, units)
              const low = isLow(p)
              return (
                <li key={p.id}>
                  <Card className="h-full p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted catalogue image
                        <img
                          src={p.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 rounded-xl object-cover flex-shrink-0 border border-stone-100"
                        />
                      ) : (
                        <span className="h-14 w-14 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center flex-shrink-0">
                          <Package className="h-6 w-6" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-stone-900 line-clamp-2">{p.name}</p>
                        <p className="text-xs text-stone-500 truncate">{[p.brand, p.category, p.sku].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    </div>

                    <table className="w-full text-xs">
                      <caption className="sr-only">Units and prices for {p.name}</caption>
                      <thead>
                        <tr className="text-left text-stone-400">
                          <th className="font-semibold pb-1">Unit</th>
                          <th className="font-semibold pb-1 text-right">Price</th>
                          <th className="font-semibold pb-1 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {units.map((u, i) => (
                          <tr key={u.id ?? i} className="border-t border-stone-100">
                            <td className="py-1 text-stone-700">
                              {u.unitName ?? 'Unit'}
                              {(u.baseQuantity ?? 1) > 1 && <span className="text-stone-400"> ({u.baseQuantity} pcs)</span>}
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums text-stone-900">
                              {money(Number(u.retailPrice) || 0)}
                            </td>
                            <td
                              className={cn(
                                'py-1 text-right tabular-nums',
                                costs.costs[i]?.loss ? 'font-bold text-rose-600' : 'text-stone-500'
                              )}
                            >
                              {Number(p.purchasePrice) > 0 ? money(costs.costs[i]?.cost ?? 0) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-auto flex items-center gap-2 border-t border-stone-100 pt-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                          low ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' : 'bg-stone-100 text-stone-600'
                        )}
                      >
                        {low && <AlertTriangle className="h-3 w-3" />}
                        {stockLabel(p)} in stock
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Pencil}
                        className="ml-auto"
                        onClick={() => setEditing({ open: true, product: p })}
                        aria-label={`Edit ${p.name}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        className="text-rose-600 hover:bg-rose-50"
                        onClick={() => setRemoving(p)}
                        aria-label={`Delete ${p.name}`}
                      />
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <SheetTemplate
        open={editing.open}
        handleOpen={() => setEditing((e) => ({ ...e, open: true }))}
        handleClose={() => setEditing({ open: false, product: null })}
        title={editing.product ? `Edit ${editing.product.name}` : 'Add product'}
        contentBodyClassName="flex flex-col"
        contentClassName="md:min-w-[40rem]"
        content={
          <CreateProduct
            key={editing.product?.id ?? 'new'}
            mode={editing.product ? 'update' : 'create'}
            productId={editing.product?.id}
            initialData={editing.product ?? undefined}
            onSuccess={() => {
              setEditing({ open: false, product: null })
              void refetch()
            }}
          />
        }
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete ${removing?.name}?`}
        description="It’s removed from the POS and the catalogue. Past sales keep their records. This can’t be undone."
        onConfirm={() =>
          removing
            ? request(ProductServices.Delete(removing.id)).then(() => {
                void refetch()
              })
            : undefined
        }
      />
    </div>
  )
}
