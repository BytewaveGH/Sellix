'use client'

// Orders: counter sales and invoices in one list. "Pending" is unpaid
// invoices (oldest first, to chase); "Completed" is everything paid.

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Banknote, CheckCircle2, Clock, FileText, Plus, Printer, Receipt, Search, ShoppingBag, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFetchData } from '@/hooks/use-fetch'
import { useAxios } from '@/hooks/use-axios'
import { IGeneric } from '@/types/interfaces'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/kit/ui'
import { ConfirmDialog, Drawer, Input } from '@/components/kit/form'
import { SheetTemplate } from '@/components/templates/sheet'
import {
  DEFAULT_FILTERS,
  daysSince,
  filterOrders,
  formatDate,
  mergeOrders,
  money,
  orderTotals,
  type Order,
  type OrderFilters,
  type OrdersView,
} from '@/lib/store/orders'
import { printOrder } from '@/lib/store/receipt'
import { useStoreSettings } from '@/lib/store/settings'
import { SalesServices } from '../../pos/_logics/services'
import { InvoiceServices } from '../../products/inventory/_logics/services'
import CreateInvoice from '../../products/inventory/_widgets/_forms/create-invoice'

// The lists have no date filter or search on the server yet (§11.2): load the
// latest and filter here.
const SALES_LIMIT = 300
const INVOICE_LIMIT = 500

const VIEWS: { view: OrdersView; label: string; href: string }[] = [
  { view: 'all', label: 'All orders', href: '/stores/orders' },
  { view: 'pending', label: 'Pending', href: '/stores/orders/pending' },
  { view: 'completed', label: 'Completed', href: '/stores/orders/completed' },
]

const DATE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: 'All time', days: null },
]

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cn(
      'h-8 rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors',
      on ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300'
    )}
  >
    {children}
  </button>
)

const StatusBadge = ({ o }: { o: Order }) =>
  o.status === 'pending' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
      <Clock className="h-3 w-3" /> Unpaid
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckCircle2 className="h-3 w-3" /> Paid
    </span>
  )

const PaymentIcon = ({ type }: { type: string }) =>
  type === 'momo' ? <Smartphone className="h-3.5 w-3.5" aria-label="MoMo" /> : <Banknote className="h-3.5 w-3.5" aria-label="Cash" />

const Stat = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'amber' }) => (
  <Card className="p-4">
    <p className="text-xs font-semibold text-stone-500">{label}</p>
    <p className={cn('mt-1 text-2xl font-extrabold tabular-nums', tone === 'amber' ? 'text-amber-700' : 'text-stone-900')}>{value}</p>
    {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
  </Card>
)

export const Orders = ({ view }: { view: OrdersView }) => {
  const locale = (useParams()?.locale as string) || 'en'
  const request = useAxios()
  const { settings } = useStoreSettings()
  const [filters, setFilters] = useState<OrderFilters>({ ...DEFAULT_FILTERS, view, kind: view === 'pending' ? 'invoice' : 'all' })
  const set = (patch: Partial<OrderFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const [open, setOpen] = useState<Order | null>(null)
  const [paying, setPaying] = useState<Order | null>(null)
  const [newInvoice, setNewInvoice] = useState(false)

  const sales = useFetchData('store-orders-sales', SalesServices.FetchAll({ limit: SALES_LIMIT, offset: 0 }) as unknown as IGeneric)
  const invoices = useFetchData(
    'store-orders-invoices',
    InvoiceServices.FetchAll({ limit: INVOICE_LIMIT, offset: 0 }) as unknown as IGeneric
  )
  const loading = (sales.isLoading && !sales.data) || (invoices.isLoading && !invoices.data)
  const salesList = (sales.data as any[]) ?? []
  const invoiceList = (invoices.data as any[]) ?? []
  const all = useMemo(() => mergeOrders(salesList, invoiceList), [salesList, invoiceList])
  const shown = useMemo(() => filterOrders(all, filters), [all, filters])
  const totals = orderTotals(shown)
  const pendingAll = orderTotals(all.filter((o) => o.status === 'pending'))
  const truncated = salesList.length >= SALES_LIMIT || invoiceList.length >= INVOICE_LIMIT
  const refetch = () => Promise.all([sales.refetch(), invoices.refetch()])

  const markPaid = async (o: Order) => {
    await request(InvoiceServices.MarkAsPaid(o.id))
    await refetch()
    setOpen((cur) => (cur?.key === o.key ? { ...cur, status: 'paid', paidAt: new Date().toISOString() } : cur))
  }

  const title = view === 'pending' ? 'Pending orders' : view === 'completed' ? 'Completed orders' : 'Orders'
  const description =
    view === 'pending'
      ? 'Invoices waiting for payment, oldest first.'
      : view === 'completed'
        ? 'Counter sales and paid invoices.'
        : 'Every counter sale and invoice, newest first.'

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Sales"
        title={title}
        description={description}
        actions={
          <Button icon={Plus} onClick={() => setNewInvoice(true)}>
            New invoice
          </Button>
        }
      />

      <nav aria-label="Order views" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1 w-full sm:w-fit">
        {VIEWS.map((v) => (
          <Link
            key={v.view}
            href={`/${locale}${v.href}`}
            aria-current={v.view === view ? 'page' : undefined}
            className={cn(
              'flex-1 sm:flex-none whitespace-nowrap rounded-lg px-3.5 py-1.5 text-center text-sm font-semibold transition-colors',
              v.view === view ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-400' : 'text-stone-500 hover:text-stone-800'
            )}
          >
            {v.label}
            {v.view === 'pending' && pendingAll.count > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{pendingAll.count}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Orders" value={loading ? '—' : totals.count.toLocaleString()} hint="Matching the filters" />
        <Stat label="Value" value={loading ? '—' : money(totals.value)} />
        {view !== 'completed' && (
          <Stat
            label="Still owed"
            value={loading ? '—' : money(view === 'pending' ? totals.value : pendingAll.outstanding)}
            hint={`${pendingAll.count} unpaid invoice${pendingAll.count === 1 ? '' : 's'} in total`}
            tone="amber"
          />
        )}
      </div>

      <Card className="mb-4 p-3 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            aria-label="Search orders"
            placeholder="Search by order number, customer, phone or product"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filters">
          {DATE_PRESETS.map((p) => (
            <Chip key={p.label} on={filters.days === p.days} onClick={() => set({ days: p.days })}>
              {p.label}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-stone-200" aria-hidden />
          {view !== 'pending' &&
            (['all', 'sale', 'invoice'] as const).map((k) => (
              <Chip key={k} on={filters.kind === k} onClick={() => set({ kind: k })}>
                {k === 'all' ? 'All types' : k === 'sale' ? 'Counter sales' : 'Invoices'}
              </Chip>
            ))}
          <span className="mx-1 w-px bg-stone-200" aria-hidden />
          {(['all', 'cash', 'momo'] as const).map((p) => (
            <Chip key={p} on={filters.payment === p} onClick={() => set({ payment: p })}>
              {p === 'all' ? 'Any payment' : p === 'cash' ? 'Cash' : 'MoMo'}
            </Chip>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={view === 'pending' ? CheckCircle2 : ShoppingBag}
          title={view === 'pending' && all.length ? 'Nothing waiting for payment' : 'No orders found'}
          description={
            filters.q || filters.days !== null || filters.payment !== 'all' || filters.kind !== (view === 'pending' ? 'invoice' : 'all')
              ? 'Try a different search or clear the filters.'
              : 'Sales from the POS and invoices you create will show here.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-100" aria-label="Orders">
            {shown.map((o) => {
              const overdue = o.status === 'pending' ? daysSince(o.date) : 0
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(o)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 transition-colors"
                    aria-label={`${o.ref}, ${money(o.total)}, ${o.status === 'paid' ? 'paid' : 'unpaid'}`}
                  >
                    <span
                      className={cn(
                        'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
                        o.kind === 'invoice' ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600'
                      )}
                    >
                      {o.kind === 'invoice' ? <FileText className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-stone-900">{o.ref}</span>
                        <span className="hidden sm:inline">
                          <StatusBadge o={o} />
                        </span>
                      </span>
                      <span className="block truncate text-xs text-stone-500">
                        {o.kind === 'invoice' ? o.customerName : 'Counter sale'} · {o.lines.length} item{o.lines.length === 1 ? '' : 's'} ·{' '}
                        {formatDate(o.date, o.kind === 'sale')}
                        {overdue > 0 && (
                          <span className="font-semibold text-amber-700">
                            {' '}
                            · {overdue} day{overdue === 1 ? '' : 's'} unpaid
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-sm font-extrabold tabular-nums text-stone-900">{money(o.total)}</span>
                      <span className="flex items-center gap-1 text-[11px] text-stone-400 capitalize">
                        <PaymentIcon type={o.paymentType} /> {o.paymentType === 'momo' ? 'MoMo' : o.paymentType}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {truncated && !loading && (
        <p className="mt-3 text-xs text-stone-400">
          Showing the latest {SALES_LIMIT} counter sales and {INVOICE_LIMIT} invoices. Older orders are in Inventory › Transactions and
          Invoices.
        </p>
      )}

      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${open.kind === 'invoice' ? 'Invoice' : 'Counter sale'} ${open.ref}` : 'Order'}
        description={open ? formatDate(open.date, open.kind === 'sale') : undefined}
        footer={
          open && (
            <>
              <Button variant="secondary" icon={Printer} onClick={() => printOrder(open, settings)}>
                {open.kind === 'invoice' ? 'Print invoice' : 'Print receipt'}
              </Button>
              {open.status === 'pending' && (
                <Button icon={CheckCircle2} onClick={() => setPaying(open)}>
                  Mark as paid
                </Button>
              )}
            </>
          )
        }
      >
        {open && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge o={open} />
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                <PaymentIcon type={open.paymentType} /> {open.paymentType === 'momo' ? 'MoMo' : 'Cash'}
              </span>
              {open.paidAt && open.kind === 'invoice' && open.status === 'paid' && (
                <span className="text-xs text-stone-500">Paid {formatDate(open.paidAt)}</span>
              )}
            </div>
            {open.kind === 'invoice' ? (
              <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                <p className="font-semibold text-stone-900">{open.customerName}</p>
                {open.customerPhone && (
                  <a href={`tel:${open.customerPhone}`} className="text-endeavour hover:underline">
                    {open.customerPhone}
                  </a>
                )}
              </div>
            ) : (
              (open.cashier || open.warehouse) && (
                <p className="text-sm text-stone-600">
                  {[open.cashier && `Served by ${open.cashier}`, open.warehouse].filter(Boolean).join(' · ')}
                </p>
              )
            )}
            <table className="w-full text-sm">
              <caption className="sr-only">Items</caption>
              <thead>
                <tr className="text-left text-xs text-stone-400">
                  <th className="pb-2 font-semibold">Item</th>
                  <th className="pb-2 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {open.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2">
                      <p className="font-semibold text-stone-800">{l.productName}</p>
                      <p className="text-xs text-stone-500">
                        {l.quantity} × {l.unitName} @ {money(l.unitPrice)}
                        {l.pricingType === 'wholesale' && ' · wholesale'}
                      </p>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 text-base font-extrabold">Total</td>
                  <td className="pt-3 text-right text-base font-extrabold tabular-nums">{money(open.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        title={`Mark ${paying?.ref} as paid?`}
        description={
          paying ? `${paying.customerName} paid ${money(paying.total)} by ${paying.paymentType === 'momo' ? 'MoMo' : 'cash'} today.` : ''
        }
        confirmLabel="Mark as paid"
        onConfirm={() => (paying ? markPaid(paying) : undefined)}
      />

      <SheetTemplate
        open={newInvoice}
        handleOpen={() => setNewInvoice(true)}
        handleClose={() => setNewInvoice(false)}
        title="New invoice"
        contentBodyClassName="flex flex-col"
        contentClassName="md:min-w-[40rem]"
        content={
          <CreateInvoice
            onSuccess={() => {
              setNewInvoice(false)
              void refetch()
            }}
          />
        }
      />
    </div>
  )
}
