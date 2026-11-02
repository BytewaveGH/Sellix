import { auth } from '@/auth'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import type { NextRequest } from 'next/server'
import type { NextAuthRequest } from 'next-auth'
import { classifyHost } from '@/lib/tenant'

const intlMiddleware = createMiddleware(routing)

const SELECT_APP_RE = /^\/(en|fr)\/select-app\/?$/
const SUPER_ADMIN_LOGIN_RE = /^\/(en|fr)\/super-admin\/login\/?$/
const SUPER_ADMIN_AREA_RE = /^\/(en|fr)\/super-admin(\/.*)?$/
// Public leaderboard display — no login required (meant for a lobby screen or a
// shared link); see src/app/[locale]/(amusement-public)/amusement/board.
const AMUSEMENT_BOARD_RE = /^\/(en|fr)\/amusement\/board\/?$/
// The customer-facing eatery site (directory, menus, checkout, order tracking).
const EAT_RE = /^\/(en|fr)\/eat(\/.*)?$/

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
]

// A route's `perm` is one key, or a list of which any one is enough.
const allows = (user: any, perm: string | string[]) => (Array.isArray(perm) ? perm : [perm]).some((k) => !!user?.[k])

// Redirect targets stay inside the employee's own vertical. Retail (and the
// verticals without their own routes yet) keep using the /stores list.
const verticalRoot = (appType: unknown) => (appType === 'real-estate' ? '/real-estate' : appType === 'eatery' ? '/eatery' : '/stores')

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
    if (SELECT_APP_RE.test(pathname) || EAT_RE.test(pathname)) {
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
    pathname === '/'

  if (!isLoggedIn && !isAuthPage) {
    return Response.redirect(new URL('/en', req.url))
  }

  // Permission guard for employees
  if (isLoggedIn && req.auth?.user?.accountType === 'employee') {
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
