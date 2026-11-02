'use client'

// Customers: everyone you've invoiced, grouped by phone number, with what
// they've paid and what they still owe. Counter sales are anonymous, so they
// don't appear here.

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Clock, MessageCircle, Phone, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFetchData } from '@/hooks/use-fetch'
import { IGeneric } from '@/types/interfaces'
import { Avatar, Card, EmptyState, PageHeader, Skeleton } from '@/components/kit/ui'
import { Drawer, Input, Select } from '@/components/kit/form'
import { customersFrom, formatDate, invoiceToOrder, money, sortCustomers, type Customer, type CustomerSort } from '@/lib/store/orders'
import { InvoiceServices } from '../products/inventory/_logics/services'

// WhatsApp wants the number in international form.
const waLink = (phone: string, text: string) => {
  const d = phone.replace(/\D/g, '')
  const intl = d.startsWith('0') ? `233${d.slice(1)}` : d
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

export default function CustomersPage() {
  const locale = (useParams()?.locale as string) || 'en'
  const { data, isLoading } = useFetchData(
    'store-orders-invoices',
    InvoiceServices.FetchAll({ limit: 500, offset: 0 }) as unknown as IGeneric
  )
  const invoices = (data as any[]) ?? []
  const customers = useMemo(() => customersFrom(invoices.map(invoiceToOrder)), [invoices])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<CustomerSort>('recent')
  const [open, setOpen] = useState<Customer | null>(null)

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return sortCustomers(
      customers.filter((c) => !s || c.name.toLowerCase().includes(s) || c.phone.replace(/\s/g, '').includes(s.replace(/\s/g, ''))),
      sort
    )
  }, [customers, q, sort])
  const owing = customers.filter((c) => c.owes > 0)
  const owed = owing.reduce((s, c) => s + c.owes, 0)

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Sales"
        title="Customers"
        description="Everyone you’ve sent an invoice to, what they’ve paid and what they still owe."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold text-stone-500">Customers</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-stone-900">{isLoading && !data ? '—' : customers.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-stone-500">Still owed</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-amber-700">{isLoading && !data ? '—' : money(owed)}</p>
          <p className="mt-1 text-xs text-stone-400">
            {owing.length} customer{owing.length === 1 ? '' : 's'} with unpaid invoices
          </p>
        </Card>
      </div>

      <Card className="mb-4 p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            aria-label="Search customers"
            placeholder="Search by name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="sm:w-52">
          <Select
            aria-label="Sort customers"
            value={sort}
            onChange={(e) => setSort(e.target.value as CustomerSort)}
            options={[
              { value: 'recent', label: 'Most recent' },
              { value: 'owes', label: 'Owes the most' },
              { value: 'spent', label: 'Spent the most' },
              { value: 'name', label: 'Name A–Z' },
            ]}
          />
        </div>
      </Card>

      {isLoading && !data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={customers.length ? 'No one matches' : 'No customers yet'}
          description={
            customers.length
              ? 'Try another name or number.'
              : 'Customers appear when you create an invoice with their name and phone. Counter sales at the POS are anonymous.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-100" aria-label="Customers">
            {shown.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 transition-colors"
                >
                  <Avatar name={c.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-stone-900 truncate">{c.name}</span>
                    <span className="block text-xs text-stone-500 truncate">
                      {c.phone || 'No phone'} · {c.orders.length} invoice{c.orders.length === 1 ? '' : 's'} · last {formatDate(c.lastOrder)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end flex-shrink-0">
                    <span className="text-sm font-extrabold tabular-nums text-stone-900">{money(c.totalSpent)}</span>
                    {c.owes > 0 ? (
                      <span className="text-[11px] font-bold text-amber-700">owes {money(c.owes)}</span>
                    ) : (
                      <span className="text-[11px] text-stone-400">paid up</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name ?? 'Customer'}
        description={open?.phone || undefined}
      >
        {open && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-stone-50 p-3">
                <p className="text-xs text-stone-500">Paid</p>
                <p className="text-lg font-extrabold tabular-nums">{money(open.totalSpent)}</p>
              </div>
              <div className={cn('rounded-xl p-3', open.owes > 0 ? 'bg-amber-50' : 'bg-stone-50')}>
                <p className="text-xs text-stone-500">Owes</p>
                <p className={cn('text-lg font-extrabold tabular-nums', open.owes > 0 && 'text-amber-700')}>{money(open.owes)}</p>
              </div>
            </div>
            {open.phone && (
              <div className="flex gap-2">
                <a
                  href={`tel:${open.phone}`}
                  className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a
                  href={waLink(
                    open.phone,
                    open.owes > 0
                      ? `Hello ${open.name}, a friendly reminder that ${money(open.owes)} is outstanding on your invoice. Thank you!`
                      : `Hello ${open.name}, `
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <MessageCircle className="h-4 w-4" /> {open.owes > 0 ? 'Send reminder' : 'WhatsApp'}
                </a>
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-bold text-stone-900">Invoices</p>
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {open.orders
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((o) => (
                    <li key={o.key} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-stone-800">{o.ref}</span>
                        <span className="block text-xs text-stone-500">
                          {formatDate(o.date)} · {o.lines.length} item{o.lines.length === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-bold tabular-nums">{money(o.total)}</span>
                        {o.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                            <Clock className="h-3 w-3" /> Unpaid
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-700">Paid</span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
              {open.owes > 0 && (
                <Link
                  href={`/${locale}/stores/orders/pending`}
                  className="mt-2 inline-block text-sm font-semibold text-endeavour hover:underline"
                >
                  Record a payment in Pending orders
                </Link>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
