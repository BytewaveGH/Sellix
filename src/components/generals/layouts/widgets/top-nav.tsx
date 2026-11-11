'use client'

import React, { Fragment } from 'react'
import ProfileAvatar from './profile-avatar'
import { cn } from '@/lib/utils'
import AvatarTemplate from '@/components/templates/avatar'
import { usePathname, useRouter } from 'next/navigation'
import { dashboardAppType } from '@/lib/app-type'
import { useSession } from 'next-auth/react'
import { ThemeSwitch } from '@/components/theme/theme'
import { ConnectionBadge } from '@/components/connection/connection-badge'

interface TopNavProps {
  trigger?: any
}

const TopNav = ({ trigger }: TopNavProps) => {
  const router = useRouter()
  const { data: session, status } = useSession()
  const pathname = usePathname()

  const username = session?.user?.username ?? ''
  const email = session?.user?.email ?? ''
  const initial = username[0]?.toUpperCase() ?? 'U'
  // Only once known: on a slow network the retail "Access POS" button must not
  // flash up inside the eatery, real-estate or amusement dashboards.
  const appType = dashboardAppType(pathname, (session?.user as any)?.appType, status === 'loading')

  const navItems = [
    ...(appType === 'retail'
      ? [
          {
            id: 5,
            label: 'Access POS',
            comp: (
              <button
                onClick={() => {
                  router.push('/en/stores/pos')
                }}
                className="px-3 py-1.5 md:px-4 md:py-2 bg-endeavour text-white rounded-md text-xs md:text-sm"
              >
                {'Access POS'}
              </button>
            ),
          },
        ]
      : []),
    { id: 8, label: 'Connection', comp: <ConnectionBadge /> },
    { id: 7, label: 'Theme', comp: <ThemeSwitch compact /> },
    {
      id: 6,
      label: '',
      comp: (
        <div className="flex items-center gap-2">
          <AvatarTemplate src={session?.user?.avatar || ''} fallback={initial} className="size-8 md:size-10" />
          <span className="hidden sm:inline text-sm text-gray-600">{email}</span>
        </div>
      ),
    },
  ]

  return (
    <main className="w-full">
      <section className={cn('w-full h-full flex justify-between items-center px-2 border-slate-100  border-b-2 ')}>
        {/* Left Side */}
        <aside className={cn('w-[20%] flex items-center pl-2 space-x-2')}>
          {/* {menuWidth > 0 && (
            <>
              <button onClick={() => handleLeftMenu(false)} className="mr-1">
                <ChevronsRightIcon color="#0865AC" size="32" strokeWidth="1" />
              </button>
              <span className="">
                <SigmaLogo fill="#0865AC" width={130} />
              </span>
            </>
          )} */}
        </aside>
        {/* right side */}
        <aside className={cn('w-[80%] flex items-center justify-end mr-5 gap-2')}>
          {navItems.map(({ id, label, comp }) => {
            return (
              <Fragment key={id}>
                {id === 6 ? <ProfileAvatar image={comp} /> : <div className={cn('flex  items-center  py-2')}>{comp}</div>}
              </Fragment>
            )
          })}
        </aside>
      </section>
    </main>
  )
}

export default TopNav
