'use client'

// My account — for the owner and every staff member, in every module:
// who you are, what you can do here, and your password.

import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Check, ChevronRight, Gem, LogOut, Mail, Phone, Store, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, Button, Card, PageHeader, SectionTitle, Skeleton } from '@/components/kit/ui'
import { ChangePassword } from '@/components/account/change-password'
import { ThemeSwitch } from '@/components/theme/theme'
import { accountKind } from '@/lib/account'
import { matchingPreset, staffModule } from '@/lib/staff-roles'
import { verticalMeta } from '@/lib/verticals'

const Detail = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) =>
  value ? (
    <div className="flex items-center gap-3 py-2.5">
      <span className="h-8 w-8 rounded-lg bg-stone-100 text-stone-500 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
        <p className="text-sm font-medium text-stone-800 truncate">{value}</p>
      </div>
    </div>
  ) : null

const Shortcut = ({ href, icon: Icon, title, hint }: { href: string; icon: React.ElementType; title: string; hint: string }) => (
  <Link
    href={href}
    className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-3 hover:border-endeavour/40 hover:bg-endeavour/[0.03] transition-colors"
  >
    <span className="h-9 w-9 rounded-lg bg-endeavour/10 text-endeavour flex items-center justify-center flex-shrink-0">
      <Icon className="h-4 w-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-stone-900">{title}</span>
      <span className="block text-xs text-stone-500">{hint}</span>
    </span>
    <ChevronRight className="h-4 w-4 text-stone-300" />
  </Link>
)

export default function AccountPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const locale = (useParams()?.locale as string) || 'en'
  const user = session?.user

  if (status === 'loading' || !user) {
    return (
      <div className="max-w-5xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  const kind = accountKind(user.accountType)
  const vertical = verticalMeta(user.appType ?? 'retail')
  const staff = staffModule(user.appType)
  const role = kind === 'owner' ? 'Owner' : (matchingPreset(staff, user)?.label ?? 'Staff')
  const name = user.username || user.email || 'You'

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Account" title="My account" description="Your details, what you can do here, and your password." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start">
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={name} size="lg" />
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-stone-900 truncate">{name}</p>
                <span className="inline-flex items-center rounded-full bg-endeavour/10 px-2 py-0.5 text-[11px] font-bold text-endeavour">
                  {role}
                </span>
              </div>
            </div>
            <div className="mt-3 divide-y divide-stone-100">
              <Detail icon={Mail} label="Email" value={user.email} />
              <Detail icon={Phone} label="Phone" value={user.phone} />
              <Detail icon={Store} label="Business" value={user.tenant ? `${user.tenant} · ${vertical.label}` : vertical.label} />
            </div>
            <Button
              variant="secondary"
              icon={LogOut}
              className="mt-4 w-full"
              onClick={async () => {
                await signOut({ redirect: false })
                router.push(kind === 'staff' ? `/${locale}/staff` : `/${locale}`)
              }}
            >
              Sign out
            </Button>
          </Card>

          <Card className="p-5">
            <SectionTitle
              title="What you can do"
              hint={kind === 'owner' ? 'As the owner you can do everything.' : 'Set by the owner or a manager in Team.'}
            />
            <ul className="flex flex-col gap-1.5" aria-label="Your permissions">
              {staff.permissions.map((p) => {
                const on = kind === 'owner' || !!user[p.key]
                return (
                  <li key={p.key} className={cn('flex items-center gap-2.5 text-sm', on ? 'text-stone-800' : 'text-stone-400')}>
                    <span
                      className={cn(
                        'h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0',
                        on ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100'
                      )}
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className={cn(!on && 'line-through')}>{p.label}</span>
                    <span className="sr-only">{on ? '(allowed)' : '(not allowed)'}</span>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <ChangePassword kind={kind} />
          <Card className="p-5">
            <SectionTitle title="Appearance" hint="System follows your phone or computer’s light or dark setting. Saved on this device." />
            <ThemeSwitch className="mt-3" />
          </Card>
          {(kind === 'owner' || user.canManageEmployees) && (
            <Card className="p-5 flex flex-col gap-2">
              <SectionTitle title="Manage" />
              <Shortcut href={`/${locale}/team`} icon={Users} title="Team" hint="Add staff, set permissions, reset passwords" />
              {kind === 'owner' && (
                <Shortcut href={`/${locale}/billing`} icon={Gem} title="Plan & billing" hint="Your plan, staff seats and payments" />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
