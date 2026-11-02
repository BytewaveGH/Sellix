'use client'

import { SellixLogo } from '@/components/brand/sellix-logo'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useParams, usePathname } from 'next/navigation'
import { Layers, LayoutDashboard, LogOut, Menu, Plus, Search, Store, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import ToastTemplate from '@/components/templates/toast'
import { Avatar } from '@/components/kit/ui'
import { useTenants } from './super-admin/_logics/api'
import { useBillingBook } from './super-admin/_logics/billing'
import { attentionCount } from '@/lib/subscription/insights'
import { CommandPalette, openCommandPalette } from './super-admin/_components/command-palette'
import { RegisterAppWizard } from './super-admin/_components/app-forms'
import { ConsoleContext } from './super-admin/_components/console-context'

const BrandMark = () => <SellixLogo size={36} tagline="Platform console" />

const Sidebar = ({ base, onNavigate, onRegister }: { base: string; onNavigate?: () => void; onRegister: () => void }) => {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { data: tenants = [] } = useTenants()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const suspended = tenants.filter((t) => t.status === 'suspended').length
  const { view: billing } = useBillingBook()
  const billingAlerts = billing ? attentionCount(billing.attention) : 0

  const nav: { label: string; href: string; icon: typeof Store; active?: boolean; count?: number; alert?: number }[] = [
    { label: 'Overview', href: base, icon: LayoutDashboard, active: pathname === base },
    { label: 'Apps', href: `${base}/apps`, icon: Store, active: pathname?.startsWith(`${base}/apps`), count: tenants.length },
    { label: 'Billing', href: `${base}/billing`, icon: Wallet, active: pathname?.startsWith(`${base}/billing`), alert: billingAlerts },
    { label: 'Plans', href: `${base}/plans`, icon: Layers, active: pathname?.startsWith(`${base}/plans`) },
  ]
  const email = session?.user?.email ?? 'Super admin'

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-4">
        <BrandMark />
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={openCommandPalette}
          className="w-full h-10 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-stone-400 hover:border-stone-300 hover:text-stone-600 transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-semibold border border-stone-200 bg-white rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>
      </div>
      <nav className="px-3 mt-5 flex flex-col gap-1" aria-label="Console">
        <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Manage</p>
        {nav.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-semibold transition-colors',
              item.active ? 'bg-endeavour text-white shadow-sm shadow-endeavour/25' : 'text-stone-600 hover:bg-stone-100'
            )}
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {!!item.alert && (
              <span
                className={cn(
                  'text-[11px] font-bold tabular-nums rounded-md px-1.5',
                  item.active ? 'bg-white/20' : 'bg-amber-100 text-amber-800'
                )}
                aria-label={`${item.alert} need attention`}
              >
                {item.alert}
              </span>
            )}
            {item.count !== undefined && (
              <span
                className={cn(
                  'text-[11px] font-bold tabular-nums rounded-md px-1.5',
                  item.active ? 'bg-white/20' : 'bg-stone-100 text-stone-500'
                )}
              >
                {item.count}
              </span>
            )}
          </Link>
        ))}
        {suspended > 0 && (
          <Link
            href={`${base}/apps?status=suspended`}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl px-3 h-9 text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            <span className="h-2 w-2 rounded-full bg-rose-500 ml-1" />
            {suspended} suspended
          </Link>
        )}
      </nav>
      <div className="px-3 mt-6">
        <button
          type="button"
          onClick={() => {
            onNavigate?.()
            onRegister()
          }}
          className="w-full h-10 rounded-xl bg-stone-900 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
        >
          <Plus className="h-4 w-4" /> Register app
        </button>
      </div>
      <div className="mt-auto p-3">
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-2.5">
          <Avatar name={email} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-stone-900 truncate">Super admin</p>
            <p className="text-[11px] text-stone-500 truncate">{email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: `/${locale}/super-admin/login` })}
            aria-label="Sign out"
            title="Sign out"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const locale = (params?.locale as string) || 'en'
  const { data: session, status } = useSession()
  const isSuperAdmin = (session?.user as any)?.accountType === 'super-admin'
  const [mobileNav, setMobileNav] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)

  const base = `/${locale}/super-admin`
  const isLoginPage = pathname?.startsWith(`${base}/login`)

  if (status === 'loading' && !isLoginPage) {
    return (
      <main className="min-h-screen bg-[#F7F7F5] flex items-center justify-center" aria-busy="true">
        <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-endeavour to-veniceBlue animate-pulse" />
      </main>
    )
  }

  if (!isSuperAdmin || isLoginPage) {
    return <main className="min-h-screen bg-[#F7F7F5]">{children}</main>
  }

  return (
    <ConsoleContext.Provider value={{ openRegister: () => setRegisterOpen(true) }}>
      <ToastTemplate position="top-right" />
      <div className="min-h-screen bg-[#F7F7F5] lg:flex">
        <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-stone-200 bg-white sticky top-0 h-screen">
          <Sidebar base={base} onRegister={() => setRegisterOpen(true)} />
        </aside>

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/90 backdrop-blur px-4 h-14">
          <button
            type="button"
            onClick={() => setMobileNav(true)}
            aria-label="Open menu"
            className="h-10 w-10 -ml-2 rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark />
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search"
            className="h-10 w-10 -mr-2 rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100"
          >
            <Search className="h-5 w-5" />
          </button>
        </header>
        <Sheet open={mobileNav} onOpenChange={setMobileNav}>
          <SheetContent side="left" className="p-0 w-72 bg-white">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Console navigation</SheetDescription>
            <Sidebar base={base} onNavigate={() => setMobileNav(false)} onRegister={() => setRegisterOpen(true)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-9">
          <div className="max-w-[1320px] mx-auto">{children}</div>
        </main>
      </div>

      <CommandPalette base={base} onNewApp={() => setRegisterOpen(true)} />
      <RegisterAppWizard open={registerOpen} onOpenChange={setRegisterOpen} onCreated={(t) => router.prefetch(`${base}/apps/${t.id}`)} />
    </ConsoleContext.Provider>
  )
}
