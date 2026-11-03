'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarPlus,
  FileText,
  Hammer,
  HardHat,
  KeyRound,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePortfolio, useRealEstateActions } from '../../_logics/hooks'
import { leaseState, todayISO } from '../../_logics/calc'
import { byUrgency, propertyStats, tenancyRows, unitViews, type UnitView } from '../../_logics/selectors'
import { landSizeLabel, landStageLabel, landTitleLabel, paymentMethodLabel, propertyTypeLabel } from '../../_logics/constants'
import { propertyInvestment } from '../../_logics/development'
import { money, percent, plural, shortDate } from '../../_logics/format'
import type { Lease, MaintenanceRequest } from '../../_logics/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  MAINTENANCE,
  OccupancyBar,
  PRIORITY,
  PropertyCover,
  Skeleton,
} from '../../_components/ui'
import { TenancyItem } from '../../_components/cards'
import { NoAccess } from '../../_components/load-state'
import { UnitBoard } from '../../_components/unit-board'
import { UnitDetail } from '../../_components/unit-detail'
import { useLocaleHref } from '../../_components/module-frame'
import { ConfirmDialog } from '../../_components/form'
import { PropertyForm } from '../../_components/forms/property-form'
import { UnitForm } from '../../_components/forms/unit-form'
import { MoveInForm, MoveOutForm, PaymentForm } from '../../_components/forms/tenancy-forms'
import { BookingForm, MaintenanceForm } from '../../_components/forms/booking-maintenance-forms'
import { DevelopmentSection } from '../../_components/development'
import { DocumentList, DocumentUploadForm } from '../../_components/documents'
import { propertyPhotos } from '../../_logics/site'

type DrawerState =
  | { kind: 'edit-property' }
  | { kind: 'unit'; unitId: number | null }
  | { kind: 'move-in'; unitId: number | null }
  | { kind: 'move-out'; lease: Lease }
  | { kind: 'payment'; leaseId: number | null }
  | { kind: 'booking'; unitId: number | null }
  | { kind: 'repair'; item: MaintenanceRequest | null }
  | { kind: 'delete-property' }
  | { kind: 'delete-unit'; unitId: number }
  | null

const TabLabel = ({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count?: number }) => (
  <span className="inline-flex items-center gap-1.5">
    <Icon className="h-4 w-4" /> {label}
    {count !== undefined && (
      <span className="text-[10px] font-bold rounded-full bg-stone-200/70 text-stone-600 px-1.5 py-0.5 tabular-nums">{count}</span>
    )}
  </span>
)

export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const href = useLocaleHref()
  const id = Number(params?.propertyId)
  const p = usePortfolio()
  const actions = useRealEstateActions()
  const today = todayISO()
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [openUnit, setOpenUnit] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const close = () => setDrawer(null)
  const canBuild = p.can.write('catalog')
  const canLet = p.can.write('lettings')
  const canRepair = p.can.write('maintenance')
  const canFile = p.can.write('development')

  const property = p.propertyById.get(id)
  const data = useMemo(() => {
    if (!property) return null
    const views = unitViews(p, id, today)
    const unitIds = new Set(views.map((v) => v.unit.id))
    const rows = tenancyRows(p, today).filter((r) => unitIds.has(r.lease.unitId))
    const leaseIds = new Set(rows.map((r) => r.lease.id))
    return {
      views,
      stats: propertyStats(p, id, today),
      tenants: rows.filter((r) => r.state !== 'ended' || r.rent.arrears > 0).sort(byUrgency),
      formerTenants: rows.filter((r) => r.state === 'ended' && r.rent.arrears === 0),
      payments: p.payments.filter((x) => leaseIds.has(x.leaseId)).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)),
      repairs: p.maintenance
        .filter((m) => m.propertyId === id)
        .sort((a, b) => (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0)),
      hasStays: views.some((v) => v.unit.rentalMode === 'short-stay'),
    }
  }, [p, id, property, today])

  if (p.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (!property || !data) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Property not found"
        description="It may have been deleted."
        action={
          <Link href={href('/properties')}>
            <Button variant="secondary" icon={ArrowLeft}>
              All properties
            </Button>
          </Link>
        }
      />
    )
  }

  const isLand = property.type === 'land'
  const investment = propertyInvestment(property, p.expenses, p.maintenance)
  const unitIdsHere = new Set(data.views.map((v) => v.unit.id))
  const leaseIdsHere = new Set(p.leases.filter((l) => unitIdsHere.has(l.unitId)).map((l) => l.id))
  const projectIdsHere = new Set(p.projects.filter((x) => x.propertyId === id).map((x) => x.id))
  const propertyDocs = p.documents.filter(
    (d) =>
      d.propertyId === id ||
      (d.unitId != null && unitIdsHere.has(d.unitId)) ||
      (d.leaseId != null && leaseIdsHere.has(d.leaseId)) ||
      (d.projectId != null && projectIdsHere.has(d.projectId))
  )

  const unitView: UnitView | null = openUnit !== null ? (data.views.find((v) => v.unit.id === openUnit) ?? null) : null
  const leaseById = new Map(p.leases.map((l) => [l.id, l]))
  const hasActiveLease = p.leases.some((l) => data.views.some((v) => v.unit.id === l.unitId) && leaseState(l, today) === 'active')

  return (
    <>
      <Link
        href={href('/properties')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-endeavour mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Properties
      </Link>
      {p.error && <ErrorNote message={p.error} />}

      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="relative">
          <PropertyCover src={propertyPhotos(property)[0]} name={property.name} className="h-40 sm:h-52 w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="min-w-0 text-white">
              <span className="inline-block rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-[11px] font-bold mb-2">
                {propertyTypeLabel(property.type)}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">{property.name}</h1>
              <p className="text-sm text-white/80 mt-1 flex items-center gap-1.5 truncate">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                {[property.address, property.city, property.region].filter(Boolean).join(', ')}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {canBuild && (
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setDrawer({ kind: 'edit-property' })}>
                  Edit
                </Button>
              )}
              {canLet && data.hasStays && (
                <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={() => setDrawer({ kind: 'booking', unitId: null })}>
                  New booking
                </Button>
              )}
              {canLet && data.views.some((v) => v.unit.rentalMode === 'long-term') && (
                <Button size="sm" icon={KeyRound} onClick={() => setDrawer({ kind: 'move-in', unitId: null })}>
                  Move tenant in
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-stone-100">
          {(isLand
            ? [
                { label: 'Size', value: property.land ? landSizeLabel(property.land.size, property.land.sizeUnit) : '—' },
                { label: 'Stage', value: property.land ? landStageLabel(property.land.stage) : '—' },
                { label: 'Paperwork', value: property.land ? landTitleLabel(property.land.titleStatus) : '—' },
                { label: 'GPS address', value: property.land?.gpsAddress || '—' },
                { label: 'Total invested', value: money(investment.total) },
              ]
            : [
                { label: 'Units', value: String(data.stats.unitCount) },
                { label: 'Occupancy', value: percent(data.stats.occupancy.rate) },
                { label: 'Rent roll / mo', value: money(data.stats.rentRoll) },
                { label: 'Owed', value: data.stats.arrears > 0 ? money(data.stats.arrears) : '—', warn: data.stats.arrears > 0 },
                { label: 'Open repairs', value: String(data.stats.openRepairs) },
              ]
          ).map((s: { label: string; value: string; warn?: boolean }) => (
            <div key={s.label} className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{s.label}</p>
              <p className={`text-lg font-extrabold tabular-nums mt-0.5 ${s.warn ? 'text-rose-600' : 'text-stone-900'}`}>{s.value}</p>
            </div>
          ))}
        </div>
        {!isLand && (
          <div className="px-5 pb-5">
            <OccupancyBar counts={data.stats.occupancy.counts} />
          </div>
        )}
      </Card>

      <Tabs key={isLand ? 'land' : 'let'} defaultValue={isLand ? 'development' : 'units'} className="mt-6">
        <TabsList className="h-auto p-1 rounded-xl bg-stone-100 flex-wrap justify-start">
          {!isLand && (
            <>
              <TabsTrigger value="units" className="rounded-lg data-[state=active]:shadow-sm">
                <TabLabel icon={LayoutGrid} label="Units" count={data.views.length} />
              </TabsTrigger>
              <TabsTrigger value="tenants" className="rounded-lg data-[state=active]:shadow-sm">
                <TabLabel icon={Users} label="Tenants" count={data.tenants.length} />
              </TabsTrigger>
              <TabsTrigger value="payments" className="rounded-lg data-[state=active]:shadow-sm">
                <TabLabel icon={Receipt} label="Payments" />
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="development" className="rounded-lg data-[state=active]:shadow-sm">
            <TabLabel icon={HardHat} label="Development" />
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg data-[state=active]:shadow-sm">
            <TabLabel icon={FileText} label="Documents" count={propertyDocs.length || undefined} />
          </TabsTrigger>
          <TabsTrigger value="repairs" className="rounded-lg data-[state=active]:shadow-sm">
            <TabLabel icon={Hammer} label="Repairs" count={data.stats.openRepairs || undefined} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="units" className="mt-4">
          <UnitBoard
            views={data.views}
            onOpen={(v) => setOpenUnit(v.unit.id)}
            onMoveIn={canLet ? (v) => setDrawer({ kind: 'move-in', unitId: v.unit.id }) : undefined}
            onAdd={canBuild ? () => setDrawer({ kind: 'unit', unitId: null }) : undefined}
          />
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          {!p.can.read('lettings') ? (
            <NoAccess />
          ) : data.tenants.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No tenants yet"
              description="Move a tenant into a vacant unit to start tracking their rent."
              action={
                canLet && (
                  <Button icon={KeyRound} onClick={() => setDrawer({ kind: 'move-in', unitId: null })}>
                    Move tenant in
                  </Button>
                )
              }
            />
          ) : (
            <Card className="px-4 divide-y divide-stone-100">
              {data.tenants.map((r) => (
                <TenancyItem
                  key={r.lease.id}
                  row={r}
                  onPay={canLet ? () => setDrawer({ kind: 'payment', leaseId: r.lease.id }) : undefined}
                />
              ))}
            </Card>
          )}
          {data.formerTenants.length > 0 && (
            <p className="text-xs text-stone-400 mt-3">
              {plural(data.formerTenants.length, 'former tenant')} with no balance — see each unit’s history.
            </p>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {canLet && (
            <div className="flex justify-end mb-3">
              <Button size="sm" icon={Wallet} onClick={() => setDrawer({ kind: 'payment', leaseId: null })}>
                Record payment
              </Button>
            </div>
          )}
          {!p.can.read('lettings') ? (
            <NoAccess />
          ) : data.payments.length === 0 ? (
            <EmptyState icon={Receipt} title="No payments recorded" />
          ) : (
            <Card className="divide-y divide-stone-100">
              {data.payments.map((x) => {
                const lease = leaseById.get(x.leaseId)
                return (
                  <div key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {lease ? p.tenantById.get(lease.tenantId)?.fullName : 'Tenant'}
                        <span className="text-stone-400 font-normal"> · {lease ? p.unitById.get(lease.unitId)?.name : ''}</span>
                      </p>
                      <p className="text-xs text-stone-500">
                        {shortDate(x.paidOn)} · {paymentMethodLabel(x.method)}
                        {x.reference ? ` · ${x.reference}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-emerald-700 tabular-nums">+{money(x.amount)}</p>
                  </div>
                )
              })}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="development" className="mt-4">
          <DevelopmentSection property={property} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {canFile && (
            <div className="flex justify-end mb-3">
              <Button size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>
                Upload
              </Button>
            </div>
          )}
          {!p.can.read('development') ? (
            <NoAccess />
          ) : (
            <DocumentList
              documents={propertyDocs}
              emptyTitle={isLand ? 'Keep the land papers here' : 'No documents yet'}
              emptyDescription={
                isLand
                  ? 'Indenture, site plan, receipts from the family, building permit — upload photos or PDFs and share them on WhatsApp.'
                  : 'Tenancy agreements, receipts, permits and photos for this property.'
              }
              onUpload={canFile ? () => setUploadOpen(true) : undefined}
              showContext={false}
            />
          )}
        </TabsContent>

        <TabsContent value="repairs" className="mt-4">
          {canRepair && (
            <div className="flex justify-end mb-3">
              <Button size="sm" icon={Plus} onClick={() => setDrawer({ kind: 'repair', item: null })}>
                Log repair
              </Button>
            </div>
          )}
          {!p.can.read('maintenance') ? (
            <NoAccess />
          ) : data.repairs.length === 0 ? (
            <EmptyState
              icon={Hammer}
              title="No repairs logged"
              description="Track leaks, electrical faults and other jobs, with their cost."
            />
          ) : (
            <Card className="divide-y divide-stone-100">
              {data.repairs.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!canRepair}
                  onClick={() => setDrawer({ kind: 'repair', item: m })}
                  className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">{m.title}</p>
                    <p className="text-xs text-stone-500">
                      {m.unitId ? p.unitById.get(m.unitId)?.name : 'Shared area'} · reported {shortDate(m.reportedOn)}
                      {m.cost > 0 ? ` · ${money(m.cost)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Badge spec={PRIORITY[m.priority]} />
                    <Badge spec={MAINTENANCE[m.status]} />
                  </div>
                </button>
              ))}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {canBuild && (
        <div className="mt-10 flex justify-end">
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDrawer({ kind: 'delete-property' })}>
            Delete property
          </Button>
        </div>
      )}

      {/* Drawers & dialogs */}
      <UnitDetail
        view={unitView}
        onOpenChange={(o) => !o && setOpenUnit(null)}
        onEdit={
          canBuild
            ? () => {
                setDrawer({ kind: 'unit', unitId: openUnit })
                setOpenUnit(null)
              }
            : undefined
        }
        onDelete={
          canBuild
            ? () => {
                if (openUnit !== null) setDrawer({ kind: 'delete-unit', unitId: openUnit })
                setOpenUnit(null)
              }
            : undefined
        }
        onMoveIn={
          canLet
            ? () => {
                setDrawer({ kind: 'move-in', unitId: openUnit })
                setOpenUnit(null)
              }
            : undefined
        }
        onMoveOut={
          canLet
            ? (lease) => {
                setDrawer({ kind: 'move-out', lease })
                setOpenUnit(null)
              }
            : undefined
        }
        onPay={
          canLet
            ? (leaseId) => {
                setDrawer({ kind: 'payment', leaseId })
                setOpenUnit(null)
              }
            : undefined
        }
        onBook={
          canLet
            ? () => {
                setDrawer({ kind: 'booking', unitId: openUnit })
                setOpenUnit(null)
              }
            : undefined
        }
      />
      <DocumentUploadForm
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        preset={{ propertyId: id, category: isLand ? 'indenture' : undefined }}
      />
      <PropertyForm open={drawer?.kind === 'edit-property'} onOpenChange={(o) => !o && close()} property={property} />
      <UnitForm
        open={drawer?.kind === 'unit'}
        onOpenChange={(o) => !o && close()}
        propertyId={id}
        unit={drawer?.kind === 'unit' && drawer.unitId !== null ? p.unitById.get(drawer.unitId) : null}
      />
      <MoveInForm
        open={drawer?.kind === 'move-in'}
        onOpenChange={(o) => !o && close()}
        unitId={drawer?.kind === 'move-in' ? drawer.unitId : null}
      />
      <MoveOutForm
        open={drawer?.kind === 'move-out'}
        onOpenChange={(o) => !o && close()}
        lease={drawer?.kind === 'move-out' ? drawer.lease : null}
      />
      <PaymentForm
        open={drawer?.kind === 'payment'}
        onOpenChange={(o) => !o && close()}
        leaseId={drawer?.kind === 'payment' ? drawer.leaseId : null}
      />
      <BookingForm
        open={drawer?.kind === 'booking'}
        onOpenChange={(o) => !o && close()}
        preset={drawer?.kind === 'booking' && drawer.unitId ? { unitId: drawer.unitId } : null}
      />
      <MaintenanceForm
        open={drawer?.kind === 'repair'}
        onOpenChange={(o) => !o && close()}
        item={drawer?.kind === 'repair' ? drawer.item : null}
        propertyId={id}
      />
      <ConfirmDialog
        open={drawer?.kind === 'delete-property'}
        onOpenChange={(o) => !o && close()}
        title={`Delete ${property.name}?`}
        description={
          hasActiveLease
            ? 'This property still has tenants. Deleting it also removes its units, tenancies, payments, bookings and repairs. This cannot be undone.'
            : 'This removes the property with its units, tenancies, payments, bookings and repairs. This cannot be undone.'
        }
        onConfirm={async () => {
          await actions.remove('properties', id, { inline: true })
          router.push(href('/properties'))
        }}
      />
      <ConfirmDialog
        open={drawer?.kind === 'delete-unit'}
        onOpenChange={(o) => !o && close()}
        title={`Delete ${drawer?.kind === 'delete-unit' ? (p.unitById.get(drawer.unitId)?.name ?? 'unit') : 'unit'}?`}
        description="Its tenancies, payments and bookings are removed too. This cannot be undone."
        onConfirm={() => (drawer?.kind === 'delete-unit' ? actions.remove('units', drawer.unitId, { inline: true }) : undefined)}
      />
    </>
  )
}
