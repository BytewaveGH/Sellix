'use client'

import { Calendar, Home, Inbox, Lock, Search, Settings } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Fragment } from 'react'
import { SellixLogo } from '@/components/brand/sellix-logo'

interface SidebarProps {
  isGrouped?: boolean
  groupedItems?: any[]
  // Session still loading: a neutral placeholder instead of any module's menu.
  loading?: boolean
}
// Menu items.
const items = [
  {
    title: 'Home',
    url: '#',
    icon: Home,
  },
  {
    title: 'Inbox',
    url: '#',
    icon: Inbox,
  },
  {
    title: 'Calendar',
    url: '#',
    icon: Calendar,
  },
  {
    title: 'Search',
    url: '#',
    icon: Search,
  },
  {
    title: 'Settings',
    url: '#',
    icon: Settings,
  },
]

export function AppSidebar({ isGrouped, groupedItems = [], loading }: SidebarProps) {
  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-3 pt-4 pb-1">
          <SellixLogo size={36} tagline="Business suite" />
        </div>
        <SidebarGroup>
          {loading ? (
            <div className="flex flex-col gap-5 px-2 pt-2" aria-busy="true" aria-label="Loading menu" data-testid="sidebar-loading">
              {[3, 4, 2].map((n, g) => (
                <div key={g} className="flex flex-col gap-2.5">
                  <span className="h-2.5 w-16 animate-pulse rounded bg-stone-200/80" />
                  {Array.from({ length: n }).map((_, i) => (
                    <span key={i} className="flex items-center gap-2.5">
                      <span className="h-4 w-4 animate-pulse rounded bg-stone-200/80" />
                      <span className="h-3 animate-pulse rounded bg-stone-100" style={{ width: `${55 + ((i * 17 + g * 11) % 35)}%` }} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : isGrouped ? (
            <>
              {groupedItems.map(
                (group: { title: string; items: { label: string; href: string; icon: React.ReactNode | any; locked?: boolean }[] }) => {
                  return (
                    <>
                      <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {group.items.map((item) => (
                            <SidebarMenuItem key={item.label}>
                              <SidebarMenuButton asChild>
                                <a href={item.href}>
                                  <item.icon />
                                  <span>{item.label}</span>
                                  {item.locked && <Lock className="ml-auto !h-3.5 !w-3.5 text-stone-400" aria-label="Not on your plan" />}
                                </a>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </>
                  )
                }
              )}
            </>
          ) : (
            <Fragment key={'no-group'}>
              <SidebarGroupLabel>Application</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <a href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </Fragment>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
