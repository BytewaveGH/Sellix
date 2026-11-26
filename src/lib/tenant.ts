// Multi-tenant subdomain routing helpers.
//
// The whole feature is inert until NEXT_PUBLIC_ROOT_DOMAIN is set: with no root
// domain configured, classifyHost() always returns 'disabled' and every caller
// (middleware, auth.config) falls back to today's single-tenant behavior.

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || ''

export function isTenancyEnabled(): boolean {
  return !!ROOT_DOMAIN
}

export type HostKind = 'disabled' | 'root' | 'tenant' | 'unknown'

export interface HostClassification {
  kind: HostKind
  slug: string | null
}

// Strips the port so "acme.localhost:3000" and "acme.bytewave.app" compare the same way.
const bare = (host: string) => host.split(':')[0].toLowerCase()

export function classifyHost(host: string | null | undefined): HostClassification {
  if (!ROOT_DOMAIN || !host) return { kind: 'disabled', slug: null }

  const bareHost = bare(host)
  const bareRoot = bare(ROOT_DOMAIN)

  if (bareHost === bareRoot || bareHost === `www.${bareRoot}`) {
    return { kind: 'root', slug: null }
  }

  const suffix = `.${bareRoot}`
  if (bareHost.endsWith(suffix)) {
    const slug = bareHost.slice(0, -suffix.length)
    return slug ? { kind: 'tenant', slug } : { kind: 'root', slug: null }
  }

  // Unrecognized host (e.g. a raw preview deployment URL) — never lock anyone out over this.
  return { kind: 'unknown', slug: null }
}

// ── The Windows desktop app ─────────────────────────────────────────────────
// Each desktop install (desktop/) is set up for one business, and runs on
// localhost where there's no subdomain. Electron passes that business to its
// local server as SELLIX_DESKTOP_BUSINESS, and the page carries it in a
// <meta name="sellix-business"> tag. Both stand in for the subdomain only when
// the address names none, and neither is ever set on the web.

export const DESKTOP_BUSINESS_META = 'sellix-business'

const validSlug = (value: unknown): string | null => (typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null)

// Server side: the desktop's business, or null.
export const desktopBusiness = (env: Record<string, string | undefined> = process.env): string | null =>
  validSlug(env.SELLIX_DESKTOP_BUSINESS)

// Server side: the business this request is for — the subdomain, else the desktop's.
export function hostTenantSlug(host: string | null | undefined, env?: Record<string, string | undefined>): string | null {
  return classifyHost(host).slug ?? desktopBusiness(env)
}

// In the browser: the same, from the address or the page's meta tag.
export function clientTenantSlug(): string | null {
  if (typeof window === 'undefined') return null
  const fromHost = classifyHost(window.location.host).slug
  if (fromHost) return fromHost
  return validSlug(document.querySelector(`meta[name="${DESKTOP_BUSINESS_META}"]`)?.getAttribute('content'))
}

// In the browser: is this page running inside the Windows desktop app?
export function isDesktopApp(): boolean {
  if (typeof document === 'undefined') return false
  return !!document.querySelector(`meta[name="${DESKTOP_BUSINESS_META}"]`)
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildTenantUrl(slug: string, path: string, protocol: string = 'https'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${protocol}://${slug}.${ROOT_DOMAIN}${cleanPath}`
}

export function redirectPathForAppType(appType: string | undefined | null, locale: string): string {
  switch (appType) {
    case 'eatery':
      return `/${locale}/eatery`
    case 'amusement':
      return `/${locale}/amusement`
    case 'real-estate':
      return `/${locale}/real-estate`
    default:
      return `/${locale}/stores/overview`
  }
}
