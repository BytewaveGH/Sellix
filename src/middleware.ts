import { auth } from '@/auth'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import type { NextRequest } from 'next/server'
import type { NextAuthRequest } from 'next-auth'
import { classifyHost, redirectPathForAppType } from '@/lib/tenant'
import { LAST_PAGE_COOKIE, lastPageFor, whoFor } from '@/lib/last-page'

const intlMiddleware = createMiddleware(routing)

const SELECT_APP_RE = /^\/(en|fr)\/select-app\/?$/
const SUPER_ADMIN_LOGIN_RE = /^\/(en|fr)\/super-admin\/login\/?$/
const SUPER_ADMIN_AREA_RE = /^\/(en|fr)\/super-admin(\/.*)?$/
// Public leaderboard display — no login required (meant for a lobby screen or a
// shared link); see src/app/[locale]/(amusement-public)/amusement/board.
const AMUSEMENT_BOARD_RE = /^\/(en|fr)\/amusement\/board\/?$/
// The customer-facing eatery site (directory, menus, checkout, order tracking).
const EAT_RE = /^\/(en|fr)\/eat(\/.*)?$/
// A landlord's public website (/rentals/<business>/…).
const RENTALS_RE = /^\/(en|fr)\/rentals(\/.*)?$/

// Ordered list used to find the first route an employee can access.
// More specific paths must come before their parents (e.g. /products/inventory before /products).
const EMPLOYEE_ROUTE_PRIORITY = [
  { path: '/stores/pos', perm: 'canManageSales' },
  { path: '/stores/overview', perm: 'canViewReports' },
  { path: '/stores/analytics', perm: 'canViewReports' },
  { path: '/stores/orders', perm: 'canManageSales' },
  { path: '/stores/products/inventory', perm: 'canManageStock' },
  { path: '/stores/products/categories', perm: 'canManageWarehouses' },
  { path: '/stores/products', perm: 'canManageProducts' },
  { path: '/stores/customers', perm: 'canManageSales' },
  { path: '/stores/users', perm: 'canManageEmployees' },
  // Shared by every module (src/app/[locale]/(account)). /account is open to all staff.
  { path: '/team', perm: 'canManageEmployees' },
  { path: '/stores/settings', perm: 'canManageOperations' },
  { path: '/stores/payment-settings', perm: 'canManageOperations' },
  // Real estate — same permission keys as its sidebar (src/components/generals/layouts/logics/data.tsx).
  { path: '/real-estate/properties', perm: 'canManageProducts' },
  { path: '/real-estate/room-types', perm: 'canManageProducts' },
  { path: '/real-estate/website', perm: 'canManageProducts' },
  { path: '/real-estate/documents', perm: ['canManageProducts', 'canViewReports'] },
  { path: '/real-estate/tenants', perm: ['canManageSales', 'canViewReports'] },
  { path: '/real-estate/rent', perm: ['canManageSales', 'canViewReports'] },
  { path: '/real-estate/bookings', perm: ['canManageSales', 'canViewReports'] },
  { path: '/real-estate/maintenance', perm: ['canManageOperations', 'canViewReports'] },
  { path: '/real-estate', perm: 'canViewReports' },
  // Eatery
  { path: '/eatery/pos', perm: 'canManageSales' },
  { path: '/eatery/sales', perm: 'canViewReports' },
  { path: '/eatery/orders', perm: 'canManageSales' },
  { path: '/eatery/stock', perm: 'canManageStock' },
  { path: '/eatery/menu', perm: 'canManageProducts' },
  { path: '/eatery/brand', perm: 'canManageProducts' },
  { path: '/eatery/settings', perm: 'canManageOperations' },
  { path: '/eatery', perm: 'canViewReports' },
  // Amusement — same permission keys as its sidebar.
  { path: '/amusement/counter', perm: 'canManageSales' },
  { path: '/amusement/gate', perm: 'canManageSales' },
  { path: '/amusement/tickets', perm: 'canManageSales' },
  { path: '/amusement/bookings', perm: ['canManageSales', 'canViewReports'] },
  { path: '/amusement/leaderboard', perm: 'canManageSales' },
  { path: '/amusement/wheel', perm: 'canManageSales' },
  { path: '/amusement/attractions', perm: 'canManageProducts' },
  { path: '/amusement', perm: 'canViewReports' },
]

// A route's `perm` is one key, or a list of which any one is enough.
const allows = (user: any, perm: string | string[]) => (Array.isArray(perm) ? perm : [perm]).some((k) => !!user?.[k])

// Redirect targets stay inside the employee's own vertical. Retail (and the
// verticals without their own routes yet) keep using the /stores list.
const verticalRoot = (appType: unknown) =>
  appType === 'real-estate' ? '/real-estate' : appType === 'eatery' ? '/eatery' : appType === 'amusement' ? '/amusement' : '/stores'

function firstAllowedPath(user: any, locale: string): string {
  const root = verticalRoot(user.appType)
  for (const { path, perm } of EMPLOYEE_ROUTE_PRIORITY) {
    if (path.startsWith(root) && allows(user, perm)) return `/${locale}${path}`
  }
  // No permissions at all — send back to staff login
  return `/${locale}/staff`
}

export default auth((req: NextAuthRequest) => {
  const pathname = req.nextUrl.pathname

  // On the root/marketing domain, the only reachable page is the app picker —
  // everything else (including the normal sign-in page) redirects there.
  // Disabled entirely (kind is never 'root') until NEXT_PUBLIC_ROOT_DOMAIN is set.
  const hostKind = classifyHost(req.headers.get('host')).kind
  if (hostKind === 'root') {
    if (SELECT_APP_RE.test(pathname) || EAT_RE.test(pathname) || RENTALS_RE.test(pathname)) {
      return intlMiddleware(req as unknown as NextRequest)
    }
    if (!SUPER_ADMIN_AREA_RE.test(pathname)) {
      const locale = pathname.split('/')[1] === 'fr' ? 'fr' : 'en'
      return Response.redirect(new URL(`/${locale}/select-app`, req.url))
    }
    // Super-admin area — fall through to the auth/permission logic below.
  }

  const isLoggedIn = !!req.auth
  const authUser = req.auth?.user as any

  // The super-admin area is off-limits to anyone but a logged-in super admin
  // (its own login page excepted). Checked before the generic redirect below so
  // an unauthenticated hit lands on /super-admin/login, not the app picker.
  if (SUPER_ADMIN_AREA_RE.test(pathname) && !SUPER_ADMIN_LOGIN_RE.test(pathname)) {
    if (!isLoggedIn || authUser?.accountType !== 'super-admin') {
      const locale = pathname.split('/')[1] === 'fr' ? 'fr' : 'en'
      return Response.redirect(new URL(`/${locale}/super-admin/login`, req.url))
    }
    return intlMiddleware(req as unknown as NextRequest)
  }

  // Locale root + staff login + super-admin login + the public leaderboard board are public
  const isAuthPage =
    /^\/(en|fr)\/?$/.test(pathname) ||
    /^\/(en|fr)\/staff\/?$/.test(pathname) ||
    /^\/(en|fr)\/forgot-password\/?$/.test(pathname) ||
    SUPER_ADMIN_LOGIN_RE.test(pathname) ||
    AMUSEMENT_BOARD_RE.test(pathname) ||
    EAT_RE.test(pathname) ||
    RENTALS_RE.test(pathname) ||
    pathname === '/'

  // Already signed in, on the sign-in page (or the bare site): go to the
  // dashboard. The installed phone app always opens on "/" (manifest.ts), so
  // without this, closing and reopening it showed the sign-in every time even
  // though the session was still good. If the session has gone bad, the
  // dashboard signs out as usual (refresh-token-handler) and lands back here
  // signed out. The staff sign-in stays reachable, for handing a device over.
  // (A real user, not an auth error object, so a misconfigured server still shows sign-in.)
  if (isLoggedIn && authUser?.accountType && (pathname === '/' || /^\/(en|fr)\/?$/.test(pathname))) {
    const locale = pathname.split('/')[1] === 'fr' ? 'fr' : 'en'
    // The installed app goes back to the screen it was last on (src/lib/last-page.ts);
    // that page's own checks (permissions, super-admin) still run on the next request.
    const last = lastPageFor(req.cookies.get(LAST_PAGE_COOKIE)?.value, whoFor(authUser))
    const home = last
      ? last
      : authUser?.accountType === 'super-admin'
        ? `/${locale}/super-admin`
        : authUser?.accountType === 'employee'
          ? firstAllowedPath(authUser, locale)
          : redirectPathForAppType(authUser?.appType, locale)
    // An employee with no permissions would be sent to /staff, not back here.
    return Response.redirect(new URL(home, req.url))
  }

  if (!isLoggedIn && !isAuthPage) {
    return Response.redirect(new URL('/en', req.url))
  }

  // Permission guard for employees
  // (The public Hall of Fame board is open to everyone, signed in or not.)
  if (isLoggedIn && req.auth?.user?.accountType === 'employee' && !AMUSEMENT_BOARD_RE.test(pathname)) {
    const user = req.auth.user as any
    const locale = pathname.split('/')[1] || 'en'

    // Strip locale prefix to get the bare path (e.g. /stores/pos)
    const barePath = pathname.replace(/^\/(en|fr)/, '') || '/'

    // Plan & billing is the owner's alone.
    if (barePath === '/billing' || barePath.startsWith('/billing/')) {
      return Response.redirect(new URL(firstAllowedPath(user, locale), req.url))
    }

    // Find which permission this path requires
    const match = EMPLOYEE_ROUTE_PRIORITY.find(({ path }) => barePath === path || barePath.startsWith(path + '/'))

    if (match && !allows(user, match.perm)) {
      return Response.redirect(new URL(firstAllowedPath(user, locale), req.url))
    }
  }

  return intlMiddleware(req as unknown as NextRequest)
})

export const config = {
  matcher: ['/', '/(fr|en)/:path*'],
}
