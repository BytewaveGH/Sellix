// Which vertical a signed-in user's tenant runs. Used by the auth callbacks
// (server side) and the sign-in redirects.
//
// - Admins: `user.appType` from /auth/admin-login and /auth/refresh.
// - Employees: /employees/login doesn't return it, so it comes from the tenant
//   lookup (GET /platform/tenants/lookup) — never inferred from anything else.

export const APP_TYPES = ['retail', 'eatery', 'amusement', 'real-estate'] as const
export type AppType = (typeof APP_TYPES)[number]

const isAppType = (v: unknown): v is AppType => APP_TYPES.includes(v as AppType)

// Missing/unknown values fall back to retail, with a warning so it's visible.
export const normalizeAppType = (value: unknown, source: string): AppType => {
  if (isAppType(value)) return value
  console.warn(`[auth] ${source} returned no valid appType (${JSON.stringify(value)}); falling back to "retail"`)
  return 'retail'
}

export const lookupTenantAppType = async (slug: string, fetchImpl: typeof fetch = fetch): Promise<AppType> => {
  try {
    const res = await fetchImpl(`${process.env.NEXT_PUBLIC_API_URL}/platform/tenants/lookup?slug=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
    const body = await res.json().catch(() => null)
    return normalizeAppType(res.ok && body?.data?.exists ? body.data.appType : undefined, `tenant lookup for "${slug}"`)
  } catch {
    return normalizeAppType(undefined, `tenant lookup for "${slug}"`)
  }
}

// The module a dashboard URL belongs to: /en/eatery/… → eatery, /en/stores/… →
// retail. Pages every module shares (/team, /account, /billing) are ambiguous
// → null, so the session's appType decides there.
const PATH_MODULES: Record<string, AppType> = { stores: 'retail', eatery: 'eatery', 'real-estate': 'real-estate', amusement: 'amusement' }
export const appTypeFromPath = (pathname: string | null | undefined): AppType | null => {
  const seg = (pathname ?? '').replace(/^\/(en|fr)(?=\/|$)/, '').split('/')[1] ?? ''
  return PATH_MODULES[seg] ?? null
}

// Which menu the dashboard shows. Null while the session is still loading and
// the address doesn't say: show a neutral placeholder, never another module's menu.
export const dashboardAppType = (pathname: string | null | undefined, sessionAppType: unknown, sessionLoading: boolean): AppType | null => {
  const fromPath = appTypeFromPath(pathname)
  if (fromPath) return fromPath
  if (sessionLoading) return null
  return isAppType(sessionAppType) ? sessionAppType : 'retail'
}
