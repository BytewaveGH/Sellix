'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Mail,
  Package,
  Pencil,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROOT_DOMAIN } from '@/lib/tenant'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, Button, Card, EmptyState, ErrorNote, Skeleton, StatCard } from '@/components/kit/ui'
import { Segmented } from '@/components/kit/form'
import { usePlatformActions, useTenantEmployees, useTenantStats, useTenants } from '../../_logics/api'
import { tenantHost, tenantUrl } from '../../_logics/insights'
import { verticalMeta } from '../../_logics/verticals'
import type { TenantStatus } from '../../_logics/types'
import { AppAvatar, CopyButton, StatusPill, VerticalBadge, fullDate, timeAgo } from '../../_components/bits'
import { ConfirmDeleteApp } from '../../_components/confirm-delete'
import { EditAppDrawer } from '../../_components/app-forms'
import { SubscriptionPanel } from '../../_components/subscription-panel'
import { TenantUsage } from '../../_components/tenant-usage'

const cedis = (n: number) => `₵${new Intl.NumberFormat('en-GH', { maximumFractionDigits: 0 }).format(n)}`

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-3">
    <dt className="text-xs font-semibold text-stone-500">{label}</dt>
    <dd className="text-sm text-stone-900 text-right min-w-0">{children}</dd>
  </div>
)

export default function AppDetailPage() {
  const params = useParams()
  const router = useRouter()
  const locale = (params?.locale as string) || 'en'
  const base = `/${locale}/super-admin`
  const id = Number(params?.id)
  const actions = usePlatformActions()
  const { data: tenants = [], isLoading } = useTenants()
  const tenant = tenants.find((t) => t.id === id) ?? null
  const stats = useTenantStats(tenant ? id : null)
  const employees = useTenantEmployees(tenant ? id : null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [staffQuery, setStaffQuery] = useState('')
  const [staffStatus, setStaffStatus] = useState<TenantStatus | 'all'>('all')
  const [busyEmployee, setBusyEmployee] = useState<number | null>(null)
  const [tab, setTab] = useState('overview')
  // ?tab=billing (links from the billing dashboard).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'staff' || t === 'billing' || t === 'usage') setTab(t)
  }, [])

  const staff = useMemo(() => {
    const list = employees.data ?? []
    const q = staffQuery.trim().toLowerCase()
    return list.filter(
      (e) => (staffStatus === 'all' || e.status === staffStatus) && (!q || `${e.name} ${e.email} ${e.role}`.toLowerCase().includes(q))
    )
  }, [employees.data, staffQuery, staffStatus])
  const staffCounts = useMemo(() => {
    const list = employees.data ?? []
    return {
      all: list.length,
      active: list.filter((e) => e.status === 'active').length,
      suspended: list.filter((e) => e.status === 'suspended').length,
    }
  }, [employees.data])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-44" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (!tenant) {
    return (
      <EmptyState
        icon={Info}
        title="App not found"
        description="It may have been deleted."
        action={
          <Link href={`${base}/apps`}>
            <Button variant="secondary" icon={ArrowLeft}>
              All apps
            </Button>
          </Link>
        }
      />
    )
  }

  const url = tenantUrl(tenant.slug, ROOT_DOMAIN)
  const meta = verticalMeta(tenant.appType)
  const shareMessage = `Your ${meta.short} app on Bytewave: ${url}\nSign in with: ${tenant.ownerEmail}`

  return (
    <>
      <Link
        href={`${base}/apps`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-endeavour mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Apps
      </Link>

      {/* Hero */}
      <Card className="overflow-hidden">
        <div
          className="h-20 sm:h-24"
          style={{ background: `linear-gradient(120deg, ${meta.color}, ${meta.color}99 60%, ${meta.color}55)` }}
          aria-hidden
        />
        <div className="px-5 sm:px-6 pb-5 -mt-8 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="ring-4 ring-white rounded-2xl w-fit">
            <AppAvatar name={tenant.name} appType={tenant.appType} status={tenant.status} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 truncate">{tenant.name}</h1>
              <StatusPill status={tenant.status} />
              <VerticalBadge appType={tenant.appType} />
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-stone-500">
              <span className="font-mono">{tenantHost(tenant.slug, ROOT_DOMAIN)}</span>
              <CopyButton value={url} label="Copy sign-in link" />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open app"
                className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-stone-400 hover:text-endeavour hover:bg-stone-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {tenant.status === 'active' ? (
              <Button variant="secondary" icon={Ban} onClick={() => void actions.setStatus(tenant, 'suspended')}>
                Suspend
              </Button>
            ) : (
              <Button icon={CheckCircle2} onClick={() => void actions.setStatus(tenant, 'active')}>
                Reactivate
              </Button>
            )}
          </div>
        </div>
        {tenant.status === 'suspended' && (
          <div className="mx-5 sm:mx-6 mb-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <Ban className="h-4 w-4 mt-0.5 flex-shrink-0" /> Suspended — the owner and all staff are blocked from signing in. Data is kept.
          </div>
        )}
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="h-auto p-1 rounded-xl bg-stone-100">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:shadow-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="staff" className="rounded-lg data-[state=active]:shadow-sm">
            Staff
            {employees.data && (
              <span className="ml-1.5 text-[10px] font-bold rounded-full bg-stone-200/70 text-stone-600 px-1.5 py-0.5 tabular-nums">
                {staffCounts.all}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="usage" className="rounded-lg data-[state=active]:shadow-sm">
            Usage
          </TabsTrigger>
          <TabsTrigger value="billing" className="rounded-lg data-[state=active]:shadow-sm">
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
          {stats.error && <ErrorNote message={`Activity stats unavailable: ${stats.error.message}`} />}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Staff accounts" value={stats.data ? stats.data.employeeCount : '—'} icon={Users} />
            <StatCard label="Products" value={stats.data ? stats.data.productCount : '—'} icon={Package} tone="amber" />
            <StatCard label="Sales volume" value={stats.data ? cedis(stats.data.salesVolume ?? 0) : '—'} icon={TrendingUp} tone="green" />
            <StatCard
              label="Last activity"
              value={stats.data?.lastActivityAt ? timeAgo(stats.data.lastActivityAt) : '—'}
              icon={Clock}
              tone="stone"
              hint={stats.data?.lastActivityAt ? fullDate(stats.data.lastActivityAt) : 'Not reported yet'}
            />
          </div>
          <p className="text-[11px] text-stone-400 inline-flex items-center gap-1 -mt-1">
            <Info className="h-3 w-3" /> If the backend doesn’t isolate tenant data yet, these counts can reflect the whole shared database.
          </p>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <p className="text-[15px] font-bold text-stone-900 mb-1">Details</p>
              <dl className="divide-y divide-stone-100">
                <Detail label="Business">{tenant.name}</Detail>
                <Detail label="Subdomain">
                  <span className="font-mono">{tenant.slug}</span>
                </Detail>
                <Detail label="Type">
                  <span className="font-semibold">{meta.label}</span>
                  <span className="block text-xs text-stone-500">{meta.description}</span>
                </Detail>
                <Detail label="Registered">
                  {fullDate(tenant.createdAt)} <span className="text-stone-400">· {timeAgo(tenant.createdAt)}</span>
                </Detail>
                <Detail label="App ID">
                  <span className="font-mono text-stone-500">#{tenant.id}</span>
                </Detail>
              </dl>
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="p-5">
                <p className="text-[15px] font-bold text-stone-900 mb-3">Owner</p>
                <div className="flex items-center gap-3">
                  <Avatar name={tenant.ownerName} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-900 truncate">{tenant.ownerName}</p>
                    <p className="text-xs text-stone-500 truncate">{tenant.ownerEmail}</p>
                  </div>
                  <a
                    href={`mailto:${tenant.ownerEmail}`}
                    aria-label={`Email ${tenant.ownerName}`}
                    className="h-9 w-9 rounded-xl border border-stone-200 flex items-center justify-center text-stone-500 hover:text-endeavour hover:border-endeavour/40"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                </div>
                <div className="mt-4 rounded-xl bg-stone-50 border border-stone-200 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Share sign-in details</p>
                  <p className="text-xs text-stone-600 mt-1 whitespace-pre-line">{shareMessage}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => void navigator.clipboard.writeText(shareMessage).catch(() => {})}
                  >
                    Copy message
                  </Button>
                </div>
              </Card>

              <Card className="p-5 border-rose-200/70">
                <p className="text-[15px] font-bold text-stone-900">Danger zone</p>
                <p className="text-xs text-stone-500 mt-1">
                  Deleting removes the business, its owner login and its subdomain for good. Suspending is reversible.
                </p>
                <Button variant="danger" size="sm" icon={Trash2} className="mt-3" onClick={() => setDeleting(true)}>
                  Delete app…
                </Button>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input
                value={staffQuery}
                onChange={(e) => setStaffQuery(e.target.value)}
                placeholder="Search name, email, role"
                aria-label="Search staff"
                className="w-full h-10 rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base sm:text-sm focus:outline-none focus:border-endeavour focus:ring-2 focus:ring-endeavour/15"
              />
            </div>
            <div className="sm:w-80">
              <Segmented
                ariaLabel="Staff status"
                value={staffStatus}
                onChange={setStaffStatus}
                options={[
                  { value: 'all', label: `All ${staffCounts.all}` },
                  { value: 'active', label: `Active ${staffCounts.active}` },
                  { value: 'suspended', label: `Suspended ${staffCounts.suspended}` },
                ]}
              />
            </div>
          </div>
          {employees.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : employees.error ? (
            <ErrorNote message={employees.error.message} />
          ) : (employees.data ?? []).length === 0 ? (
            <EmptyState icon={Users} title="No staff accounts" description="The owner hasn’t added any employees yet." />
          ) : staff.length === 0 ? (
            <Card className="py-10 text-center text-sm text-stone-500">No staff match.</Card>
          ) : (
            <Card className="divide-y divide-stone-100">
              {staff.map((e) => (
                <div key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar name={e.name} />
                    <div className="min-w-0">
                      <p className={cn('text-sm font-semibold truncate', e.status === 'suspended' ? 'text-stone-400' : 'text-stone-900')}>
                        {e.name}
                      </p>
                      <p className="text-xs text-stone-500 truncate">{e.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-[11px] font-semibold capitalize rounded-full bg-stone-100 text-stone-600 px-2 py-0.5">
                      {e.role || 'staff'}
                    </span>
                    <StatusPill status={e.status} />
                    <Button
                      size="sm"
                      variant={e.status === 'active' ? 'secondary' : 'primary'}
                      loading={busyEmployee === e.id}
                      onClick={async () => {
                        setBusyEmployee(e.id)
                        try {
                          await actions.setEmployeeStatus(tenant.id, e, e.status === 'active' ? 'suspended' : 'active')
                        } catch {
                          // toast shown
                        } finally {
                          setBusyEmployee(null)
                        }
                      }}
                    >
                      {e.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <TenantUsage tenant={tenant} lastActivityAt={stats.data?.lastActivityAt} />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <SubscriptionPanel tenant={tenant} />
        </TabsContent>
      </Tabs>

      <EditAppDrawer tenant={editing ? tenant : null} onOpenChange={(o) => !o && setEditing(false)} />
      <ConfirmDeleteApp
        tenant={deleting ? tenant : null}
        onOpenChange={(o) => !o && setDeleting(false)}
        onConfirm={async (t) => {
          await actions.remove(t)
          router.push(`${base}/apps`)
        }}
      />
    </>
  )
}
