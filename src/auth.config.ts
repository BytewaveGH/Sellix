import { CredentialsSignin, type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import type { ExtendedUser } from './types/next-auth'
import { SignInFormSchema } from './types/schemas/schema'
import { IAuth } from './types/interfaces'
import { classifyHost } from './lib/tenant'
import { refreshOutcome } from './lib/network'
import { lookupTenantAppType, normalizeAppType } from './lib/app-type'
import { LOGIN_CODES, encodeBusinessChoice, type OwnerBusiness } from './lib/owner-login'
import * as z from 'zod'

const EmployeeSignInSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})

// ── Permission defaults ───────────────────────────────────────────────────────
const ADMIN_PERMS = {
  canViewReports: true,
  canManageProducts: true,
  canManageStock: true,
  canManageSales: true,
  canManageInvoices: true,
  canManageOperations: true,
  canManageWarehouses: true,
  canManageEmployees: true,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const whichTenant = (req: Request): string => {
  const { slug } = classifyHost(req.headers.get('host'))
  return slug ?? 'admin'
}

// Errors surfaced to signIn() as `code` (see src/lib/owner-login.ts).
class OwnerLoginError extends CredentialsSignin {
  constructor(code: string) {
    super()
    this.code = code
  }
}

type AdminLoginResult =
  | { ok: true; data: IAuth.Response['data'] & { tenant: string } }
  | { ok: false; status: number; businesses?: OwnerBusiness[] }

// POST /auth/admin-login. `tenant` (a business slug) is sent only once the
// owner has picked a business after a 409; it also becomes the tenant header so
// the two never disagree.
async function adminLoginRequest(
  body: { email: string; password: string; tenant?: string },
  hostTenant: string
): Promise<AdminLoginResult> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Domain': body.tenant || hostTenant || 'admin' },
      body: JSON.stringify(body),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status !== 401) console.error('[auth] admin login error', response.status, json?.error ?? '')
      const businesses = Array.isArray(json?.data?.businesses) ? (json.data.businesses as OwnerBusiness[]) : undefined
      return { ok: false, status: response.status, businesses }
    }
    return { ok: true, data: { ...(json as IAuth.Response).data, tenant: body.tenant || hostTenant } }
  } catch (err) {
    console.error('[auth] adminLoginRequest failed:', err)
    return { ok: false, status: 0 }
  }
}

async function employeeLoginRequest(body: { email: string; password: string }, tenant: string): Promise<any | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/employees/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Domain': tenant || 'admin' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      console.error('[auth] employee login error', response.status, text)
      return null
    }
    const raw = await response.json()
    console.log('[auth] employee login response:', JSON.stringify(raw))
    // Support both { data: { user, accessToken, ... } } and flat { user, accessToken, ... }
    const payload = raw.data ?? raw
    return { ...payload, tenant }
  } catch (err) {
    console.error('[auth] employeeLoginRequest failed:', err)
    return null
  }
}

const toAbsoluteExpiry = (v: number | undefined | null): number => {
  if (!v || isNaN(Number(v))) return Math.floor(Date.now() / 1000) + 3600
  const n = Number(v)
  return n < 86400 ? Math.floor(Date.now() / 1000) + n : n
}

// Only a real refusal ends the session. When the API can't be reached (down,
// slow, a gateway error) the token is kept as it is and the refresh is tried
// again on the next session check — poor internet must not log anyone out.
async function refreshAccessToken(tokenObject: any) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': tokenObject.refreshToken as string,
        'X-Tenant-Domain': (tokenObject?.tenant as string) || 'admin',
      },
      signal: AbortSignal.timeout(10_000),
    })
    const outcome = refreshOutcome(response.status)
    if (outcome === 'unreachable') return tokenObject
    if (outcome === 'rejected') return { ...tokenObject, error: 'RefreshAccessTokenError' }
    const data: IAuth.Response = await response.json()
    return {
      ...tokenObject, // preserves permission fields for employees
      userId: data.data.user.id,
      username: data.data.user.username,
      accountType: data.data.user.accountType,
      avatar: data.data.user.avatar,
      phone: data.data.user.phone,
      email: data.data.user.email,
      // Tokens are bound to a tenant; keep the header in sync with it.
      tenant: data.data.user.tenant ?? tokenObject.tenant,
      appType: data.data.user.appType ? normalizeAppType(data.data.user.appType, '/auth/refresh') : tokenObject.appType,
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
      accessTokenExpiry: toAbsoluteExpiry(data.data.accessTokenExpiry),
      refreshTokenExpiry: toAbsoluteExpiry(data.data.refreshTokenExpiry),
      error: undefined,
    }
  } catch {
    // No answer (offline, timeout) or an unreadable one: try again later.
    return tokenObject
  }
}

// ── Auth config ───────────────────────────────────────────────────────────────

export default {
  providers: [
    // Admin / store owner login
    Credentials({
      id: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        // Business slug — only after the owner picked one from a 409.
        tenant: { label: 'Business', type: 'text' },
      },
      async authorize(credentials, req) {
        const parsed = SignInFormSchema.safeParse(credentials)
        if (!parsed.success) return null
        const chosen = typeof credentials?.tenant === 'string' && credentials.tenant.trim() ? credentials.tenant.trim() : undefined
        const result = await adminLoginRequest({ ...parsed.data, ...(chosen ? { tenant: chosen } : {}) }, whichTenant(req as Request))
        if (!result.ok) {
          if (result.status === 409 && result.businesses?.length) throw new OwnerLoginError(encodeBusinessChoice(result.businesses))
          if (result.status === 401) throw new OwnerLoginError(LOGIN_CODES.invalid)
          if (result.status === 403) throw new OwnerLoginError(LOGIN_CODES.suspended)
          throw new OwnerLoginError(LOGIN_CODES.unavailable)
        }
        const res = result.data
        return {
          id: String(res.user.id),
          userId: res.user.id,
          username: res.user.username,
          accountType: res.user.accountType,
          avatar: res.user.avatar,
          phone: res.user.phone,
          email: res.user.email,
          // The server's tenant is authoritative: /pos/* routes reject an
          // X-Tenant-Domain that differs from the token's tenant.
          tenant: res.user.tenant || res.tenant,
          appType: normalizeAppType(res.user.appType, '/auth/admin-login'),
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          accessTokenExpiry: res.accessTokenExpiry,
          refreshTokenExpiry: res.refreshTokenExpiry,
          ...ADMIN_PERMS,
        }
      },
    }),

    // Employee / staff login
    Credentials({
      id: 'employee-credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        try {
          const parsed = EmployeeSignInSchema.safeParse(credentials)
          if (!parsed.success) {
            console.error('[auth] employee schema parse failed:', parsed.error.flatten())
            return null
          }
          const tenant = whichTenant(req as Request)
          const res = await employeeLoginRequest({ email: parsed.data.email, password: parsed.data.password }, tenant)
          if (!res) return null

          // API returns { employee: {...}, token, expireAt }
          const emp = res.employee ?? res.user ?? res
          if (!emp?.id) {
            console.error('[auth] employee login: no user id in response', JSON.stringify(res))
            return null
          }

          // Permissions sit directly on emp
          const perms = emp.permissions ?? emp
          // /employees/login doesn't return appType — take it from the tenant lookup.
          const employeeTenant: string = res.tenant ?? tenant
          const appType = await lookupTenantAppType(employeeTenant)

          return {
            id: String(emp.id),
            // data.employee.id — sent as employeeId on POST /sales (see pos/_logics/checkout.ts).
            userId: emp.id,
            username: emp.username ?? emp.name ?? '',
            accountType: 'employee' as const,
            avatar: emp.avatar ?? emp.profilePicture ?? '',
            phone: emp.phone ?? '',
            email: emp.email ?? parsed.data.email,
            tenant: employeeTenant,
            appType,
            accessToken: res.accessToken ?? res.token ?? '',
            refreshToken: res.refreshToken ?? '',
            accessTokenExpiry: toAbsoluteExpiry(res.expireAt ?? res.accessTokenExpiry ?? res.expiresIn),
            refreshTokenExpiry: toAbsoluteExpiry(res.refreshTokenExpiry ?? res.refreshExpiresIn),
            canViewReports: !!(perms.canViewReports ?? false),
            canManageProducts: !!(perms.canManageProducts ?? false),
            canManageStock: !!(perms.canManageStock ?? false),
            canManageSales: !!(perms.canManageSales ?? false),
            canManageInvoices: !!(perms.canManageInvoices ?? false),
            canManageOperations: !!(perms.canManageOperations ?? false),
            canManageWarehouses: !!(perms.canManageWarehouses ?? false),
            canManageEmployees: !!(perms.canManageEmployees ?? false),
          }
        } catch (err) {
          console.error('[auth] employee authorize threw:', err)
          return null
        }
      },
    }),

    // Platform operator login — manages tenants, not scoped to any tenant.
    // No external backend call: this is a bootstrap-only mechanism (env-var
    // credentials) until there's a real operator-account store.
    Credentials({
      id: 'super-admin-credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = EmployeeSignInSchema.safeParse(credentials)
        if (!parsed.success) return null

        const envEmail = process.env.SUPER_ADMIN_EMAIL
        const envPassword = process.env.SUPER_ADMIN_PASSWORD
        if (!envEmail || !envPassword) return null
        if (parsed.data.email !== envEmail || parsed.data.password !== envPassword) return null

        // No real access/refresh token for this account. The jwt callback below
        // skips refresh logic entirely for accountType 'super-admin', so this expiry
        // only feeds the client-side refetch-interval calculation (RefreshTokenHandler)
        // — keep it well under 24.8 days, or it overflows setInterval's 32-bit delay
        // and fires immediately in a tight loop instead of "never".
        const oneDayOut = Math.floor(Date.now() / 1000) + 60 * 60 * 24
        return {
          id: 'super-admin',
          userId: 0,
          username: 'Super Admin',
          accountType: 'super-admin',
          avatar: '',
          phone: '',
          email: envEmail,
          tenant: 'platform',
          appType: 'platform',
          accessToken: '',
          refreshToken: '',
          accessTokenExpiry: oneDayOut,
          refreshTokenExpiry: oneDayOut,
          ...ADMIN_PERMS,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, session, trigger }) {
      if (trigger === 'update') return { ...token, ...session.user }
      if (user) {
        const u = user as ExtendedUser
        token.userId = u.userId
        token.username = u.username
        token.accountType = u.accountType
        token.avatar = u.avatar
        token.phone = u.phone
        token.email = u.email
        token.tenant = u.tenant
        token.appType = u.appType
        token.accessToken = u.accessToken
        token.refreshToken = u.refreshToken
        token.accessTokenExpiry = toAbsoluteExpiry(u.accessTokenExpiry)
        token.refreshTokenExpiry = toAbsoluteExpiry(u.refreshTokenExpiry)
        token.exp = toAbsoluteExpiry(u.refreshTokenExpiry)
        // Permissions (admins always get all; employees get what the API returned)
        token.canViewReports = u.canViewReports
        token.canManageProducts = u.canManageProducts
        token.canManageStock = u.canManageStock
        token.canManageSales = u.canManageSales
        token.canManageInvoices = u.canManageInvoices
        token.canManageOperations = u.canManageOperations
        token.canManageWarehouses = u.canManageWarehouses
        token.canManageEmployees = u.canManageEmployees
        return token
      }

      // Super admin has no real backend session to refresh — never attempt it.
      if (token.accountType === 'super-admin') return token

      const shouldRefreshTime = (token.accessTokenExpiry as number) - 5 * 60 - Math.floor(Date.now() / 1000)
      if (shouldRefreshTime > 0) return token

      return refreshAccessToken(token)
    },

    async session({ token, session }) {
      session.user.userId = token.userId as number
      session.user.username = token.username as string
      session.user.accountType = token.accountType as string
      session.user.avatar = token.avatar as string
      session.user.phone = token.phone as string
      session.user.email = token.email as string
      session.user.tenant = token.tenant as string
      session.user.appType = token.appType as string
      session.user.accessToken = token.accessToken as string
      session.user.refreshToken = token.refreshToken as string
      session.user.accessTokenExpiry = token.accessTokenExpiry as number
      session.user.refreshTokenExpiry = token.refreshTokenExpiry as number
      session.user.canViewReports = token.canViewReports as boolean
      session.user.canManageProducts = token.canManageProducts as boolean
      session.user.canManageStock = token.canManageStock as boolean
      session.user.canManageSales = token.canManageSales as boolean
      session.user.canManageInvoices = token.canManageInvoices as boolean
      session.user.canManageOperations = token.canManageOperations as boolean
      session.user.canManageWarehouses = token.canManageWarehouses as boolean
      session.user.canManageEmployees = token.canManageEmployees as boolean
      return session
    },
  },

  session: { strategy: 'jwt' },
  pages: {
    signIn: '/en',
    signOut: '/en',
    error: '/en',
  },
  secret: process.env.BETTER_AUTH_SECRET,
} satisfies NextAuthConfig
