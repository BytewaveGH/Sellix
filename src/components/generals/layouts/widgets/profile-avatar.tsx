'use client'

import { signOut, useSession } from 'next-auth/react'
import React from 'react'
import { CircleUser, LogOut } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import AvatarTemplate from '@/components/templates/avatar'
import Link from 'next/link'
import { PopoverTemplate } from '@/components/templates/popover'

interface ProfileAvatarProps {
  image: React.JSX.Element
}

const ProfileAvatar = ({ image }: ProfileAvatarProps) => {
  const router = useRouter()
  const params = useParams()
  const { data: session } = useSession()

  const locale = (params?.locale as string) || 'en'
  const username = session?.user?.username ?? ''
  const email = session?.user?.email ?? ''
  const initial = username[0]?.toUpperCase() ?? 'U'

  return (
    <PopoverTemplate
      contentClassName="bg-white w-60 mr-6"
      trigger={<div className="flex space-x-2 items-center py-2 ml-5  cursor-pointer">{image}</div>}
      content={[
        // <div className="space-y-1">
        <div key={'avatar'} className="w-full flex gap-2 items-center">
          <AvatarTemplate src={session?.user?.avatar || ''} fallback={initial} />
          <div className="w-full">
            <p className="seedstars-paragraph font-mulish-semi-bold line-clamp-2">{username}</p>
            <h5 className="seedstars-link text-endeavour line-clamp-1 text-ellipsis overflow-hidden whitespace-nowrap">{email}</h5>
          </div>
        </div>,

        <Link key={'link'} className="p-2  hover:bg-gray-100  flex items-center rounded cursor-pointer" href={`/${locale}/account`}>
          <CircleUser size={16} className="text-endeavour" />
          <span className="inline-block ml-2 seedstars-paragraph text-stone-500">My account</span>
        </Link>,

        // <Separator className="bg-gray-200" />,
        <div
          key={'logout'}
          className="p-2 hover:bg-gray-100 rounded cursor-pointer flex items-center"
          onClick={async () => {
            // Staff go back to the staff sign-in, owners to theirs.
            const back = session?.user?.accountType === 'employee' ? `/${locale}/staff` : `/${locale}`
            await signOut({ callbackUrl: back, redirect: false })
            router.push(back)
          }}
        >
          <LogOut size={16} className="text-endeavour" />{' '}
          <span className="inline-block ml-2 seedstars-paragraph text-stone-500">Log Out</span>
        </div>,
        // {/* </div> */}
      ]}
    />
  )
}

export default ProfileAvatar
