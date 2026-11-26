'use client'

import React from 'react'
import { AppSidebar } from './widgets/sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import TopNav from './widgets/top-nav'
import { getSidebarItems } from './logics/data'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { dashboardAppType } from '@/lib/app-type'
import { canUseFeature } from '@/lib/subscription/access'
import { featureForPath } from '@/lib/subscription/features'
import { useBilling } from '@/lib/subscription/client'
import { SubscriptionGate } from '@/components/billing/gate'
import { ActivityTracker } from '@/components/activity/activity-tracker'

const ILayout = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const user = session?.user as any
  const isEmployee = user?.accountType === 'employee'
  // The page's own module first; while the session loads on a slow network,
  // no menu at all rather than another module's (it used to flash retail's POS).
  const appType = dashboardAppType(pathname, user?.appType, status === 'loading')
  // Employees' items depend on their permissions, which arrive with the session.
  const loading = appType === null || (status === 'loading' && !session)
  const sidebarItems = appType ? getSidebarItems(appType) : []
  const { access } = useBilling()

  const visibleItems = sidebarItems
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => {
          if (!isEmployee) return true
          if (item.ownerOnly) return false
          // requiredPermission: one key, or a list of which any one is enough.
          const req: string | string[] | undefined = item.requiredPermission
          return !req || (Array.isArray(req) ? req : [req]).some((k) => !!user?.[k])
        })
        // Pages not on the plan stay visible (with a lock) so owners can discover them.
        .map((item) => {
          const feature = featureForPath(item.href)
          return feature && !canUseFeature(access, feature.key) ? { ...item, locked: true } : item
        }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <main className="w-full">
      <ActivityTracker />
      <nav className="w-full sticky left-0 top-0 z-10 bg-white">
        <TopNav />
      </nav>
      <SidebarProvider>
        <AppSidebar isGrouped groupedItems={loading ? [] : visibleItems} loading={loading} />
        <main className="w-full min-w-0 flex">
          <SidebarTrigger />
          {/* min-w-0: wide rows (e.g. scrolling strips) scroll inside the page instead of stretching it */}
          <div className="w-full min-w-0 p-3 md:p-4">
            <SubscriptionGate>{children}</SubscriptionGate>
          </div>
        </main>
      </SidebarProvider>
    </main>
  )
}

export default ILayout
