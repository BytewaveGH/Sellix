// The installed phone app reopens on its last screen (src/lib/last-page.ts,
// src/components/install/remember-page.tsx and the middleware).
import React from 'react'
import { render } from '@testing-library/react'

const nav = vi.hoisted(() => ({ path: '/en/eatery/menu' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }))
const auth = vi.hoisted(() => ({ user: { tenant: 'belkis', userId: 7, accountType: 'owner' } as any }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: auth.user ? { user: auth.user } : null }) }))

import { LAST_PAGE_COOKIE, keepablePage, lastPageCookie, lastPageFor, whoFor } from '@/lib/last-page'
import { RememberPage } from '@/components/install/remember-page'

const owner = whoFor({ tenant: 'belkis', userId: 7, accountType: 'owner' })!

describe('last page', () => {
  it('keeps dashboard screens, never sign-in pages, public sites or odd paths', () => {
    expect(keepablePage('/en/eatery/menu')).toBe(true)
    expect(keepablePage('/fr/super-admin/apps/3?tab=usage')).toBe(true)
    for (const p of ['/en', '/en/', '/en/staff', '/fr/forgot-password', '/en/select-app', '/en/super-admin/login', '/en/eat/kofi', '/en/rentals', '/en/amusement/board', 'https://evil.com/en/x', '//evil.com/x', '/en//evil.com', '/en/../x', '/de/x', '/en/a<b'])
      expect(keepablePage(p)).toBe(false)
  })

  it('is only handed back to the person who saved it', () => {
    const c = lastPageCookie(owner, '/en/eatery/orders')
    expect(lastPageFor(c, owner)).toBe('/en/eatery/orders')
    expect(lastPageFor(c, whoFor({ tenant: 'belkis', userId: 8, accountType: 'employee' }))).toBeNull()
    expect(lastPageFor(c, whoFor({ tenant: 'other', userId: 7, accountType: 'owner' }))).toBeNull()
    expect(lastPageFor(c, null)).toBeNull()
    expect(lastPageFor(undefined, owner)).toBeNull()
    expect(lastPageFor('%E0%A4%A', owner)).toBeNull()
    expect(lastPageFor(encodeURIComponent(`${owner}|/en/staff`), owner)).toBeNull()
    expect(whoFor(null)).toBeNull()
  })
})

describe('RememberPage', () => {
  const clear = () => (document.cookie = `${LAST_PAGE_COOKIE}=; Path=/; Max-Age=0`)
  const saved = () => document.cookie.split('; ').find((c) => c.startsWith(`${LAST_PAGE_COOKIE}=`))?.slice(LAST_PAGE_COOKIE.length + 1)
  const standalone = (on: boolean) =>
    (window.matchMedia = ((q: string) => ({ matches: on && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as any)

  beforeEach(() => {
    clear()
    auth.user = { tenant: 'belkis', userId: 7, accountType: 'owner' }
    window.history.replaceState(null, '', '/en/eatery/menu')
  })

  it('in the installed app, remembers the screen for this person', () => {
    standalone(true)
    render(<RememberPage />)
    expect(lastPageFor(saved(), owner)).toBe('/en/eatery/menu')
  })

  it('not in an ordinary browser tab, signed out, or on a sign-in page', () => {
    standalone(false)
    render(<RememberPage />).unmount()
    expect(saved()).toBeUndefined()
    standalone(true)
    auth.user = null
    render(<RememberPage />).unmount()
    expect(saved()).toBeUndefined()
    auth.user = { tenant: 'belkis', userId: 7, accountType: 'owner' }
    window.history.replaceState(null, '', '/en/staff')
    render(<RememberPage />)
    expect(saved()).toBeUndefined()
  })
})
