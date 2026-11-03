'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight, MapPin, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { landSizeLabel, landStageLabel, propertyTypeLabel } from '../_logics/constants'
import { propertyInvestment } from '../_logics/development'
import { usePortfolio } from '../_logics/hooks'
import { money, percent, plural, shortDate } from '../_logics/format'
import type { PropertyStats, TenancyRow } from '../_logics/selectors'
import type { Property } from '../_logics/types'
import { Avatar, Badge, Card, OccupancyBar, PropertyCover, RENT } from './ui'
import { useLocaleHref } from './module-frame'
import { propertyPhotos } from '../_logics/site'

const TITLE_SHORT: Record<string, string> = {
  none: 'None yet',
  'allocation-note': 'Allocation',
  indenture: 'Indenture',
  'site-plan': 'Site plan',
  registered: 'Registered',
  'title-certificate': 'Titled',
}

export const PropertyCard = ({ property, stats }: { property: Property; stats: PropertyStats }) => {
  const href = useLocaleHref()
  const p = usePortfolio()
  const isLand = property.type === 'land'
  const invested = isLand ? propertyInvestment(property, p.expenses, p.maintenance).total : 0
  return (
    <Link
      href={href(`/properties/${property.id}`)}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-endeavour/40 rounded-2xl"
    >
      <Card className="overflow-hidden transition-all group-hover:shadow-[0_8px_24px_-12px_rgba(8,101,172,0.35)] group-hover:border-endeavour/30">
        <div className="relative">
          <PropertyCover src={propertyPhotos(property)[0]} name={property.name} className="h-32 w-full" />
          <span className="absolute top-3 left-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-stone-700">
            {propertyTypeLabel(property.type)}
          </span>
          <span className="absolute top-3 right-3 rounded-full bg-stone-900/70 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-white tabular-nums">
            {isLand ? (property.land ? landStageLabel(property.land.stage) : 'Land') : `${percent(stats.occupancy.rate)} occupied`}
          </span>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-stone-900 truncate">{property.name}</p>
              <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {[property.address, property.city].filter(Boolean).join(', ')}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-stone-300 group-hover:text-endeavour transition-colors mt-1 flex-shrink-0" />
          </div>
          {isLand ? (
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <Metric label="Size" value={property.land ? landSizeLabel(property.land.size, property.land.sizeUnit) : '—'} />
              <Metric label="Papers" value={property.land ? TITLE_SHORT[property.land.titleStatus] : '—'} />
              <Metric label="Invested" value={money(invested, { compact: true })} />
            </div>
          ) : (
            <>
              <OccupancyBar counts={stats.occupancy.counts} className="mt-4" showLegend={false} />
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <Metric label="Units" value={String(stats.unitCount)} />
                <Metric label="Rent / mo" value={money(stats.rentRoll, { compact: true })} />
                <Metric label="Owed" value={stats.arrears > 0 ? money(stats.arrears, { compact: true }) : '—'} warn={stats.arrears > 0} />
              </div>
            </>
          )}
        </div>
      </Card>
    </Link>
  )
}

const Metric = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className="rounded-xl bg-stone-50 py-2">
    <p className={cn('text-sm font-bold tabular-nums', warn ? 'text-rose-600' : 'text-stone-900')}>{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
  </div>
)

// One tenancy in a list: who, where, and where their rent stands.
export const TenancyItem = ({ row, onPay, compact }: { row: TenancyRow; onPay?: () => void; compact?: boolean }) => {
  const { tenant, unit, property, rent } = row
  const detail =
    rent.status === 'overdue'
      ? `${money(rent.arrears)} owed · ${plural(rent.daysOverdue, 'day')} late`
      : rent.status === 'due-soon'
        ? `${money(rent.nextDueAmount)} due ${shortDate(rent.nextDueDate)}`
        : rent.status === 'upcoming'
          ? `Moves in ${shortDate(row.lease.startDate)}`
          : rent.status === 'ended'
            ? `Moved out ${shortDate(row.lease.terminatedOn)}`
            : `Paid through ${shortDate(rent.paidThrough)}`
  return (
    <div className={cn('flex items-center gap-3', compact ? 'py-2.5' : 'py-3')}>
      <Avatar name={tenant?.fullName ?? '?'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900 truncate">{tenant?.fullName ?? 'Unknown tenant'}</p>
        <p className="text-xs text-stone-500 truncate">
          {unit?.name ?? 'Unit'}
          {row.unitType && !compact ? ` · ${row.unitType.name}` : ''}
          {property ? ` · ${property.name}` : ''}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <Badge spec={RENT[rent.status]} />
        <p className={cn('text-[11px] mt-1 tabular-nums', rent.status === 'overdue' ? 'text-rose-600 font-semibold' : 'text-stone-500')}>
          {detail}
        </p>
      </div>
      {(tenant?.phone || onPay) && !compact && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {tenant?.phone && (
            <a
              href={`tel:${tenant.phone.replace(/\s+/g, '')}`}
              aria-label={`Call ${tenant.fullName}`}
              className="h-9 w-9 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-endeavour"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {onPay && rent.status !== 'ended' && (
            <button type="button" onClick={onPay} className="h-9 px-3 rounded-xl text-xs font-semibold text-endeavour hover:bg-endeavour/5">
              Record
            </button>
          )}
        </div>
      )}
    </div>
  )
}
