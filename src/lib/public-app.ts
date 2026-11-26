// Customers can install a public site — a restaurant's Sellix Eat storefront,
// a landlord's rentals site, or the directories — as its own app on their
// phone: named after the business, in its colour, opening on its page.
//
// Its icon is the business's logo, or the Sellix logo when it has none.
// The page knows the business (its data may only exist in the browser), so it
// passes name, colours and logo to /api/app-manifest and /api/app-icon, which
// only accept public pages and plain values. Pure helpers here, tested.

export type PublicAppParams = {
  path: string
  name: string
  bg: string
  fg: string
  // The logo, when it's an https image on a host we fetch from.
  logo?: string
}

// Storefronts, rentals sites and their directories. Never the dashboards.
export const PUBLIC_APP_PATH = /^\/(?:en|fr)\/(?:eat|rentals)(?:\/[A-Za-z0-9._~%-]{1,120})?\/?$/

const HEX = /^#[0-9a-f]{6}$/i

export const cleanName = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 40)

export const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase())
    .join('') || 'S'

// Query values → safe params, or null if this isn't a public page.
export const parseAppParams = (q: URLSearchParams): PublicAppParams | null => {
  const path = q.get('path') ?? ''
  if (!PUBLIC_APP_PATH.test(path) || path.includes('..')) return null
  const name = cleanName(q.get('name')) || 'Sellix'
  const bg = HEX.test(q.get('bg') ?? '') ? q.get('bg')! : '#0865AC'
  const fg = HEX.test(q.get('fg') ?? '') ? q.get('fg')! : '#FFFFFF'
  const logo = q.get('logo') ?? ''
  return { path: path.replace(/\/$/, '') || path, name, bg, fg, ...(/^https:\/\/\S+$/i.test(logo) && logo.length <= 1000 ? { logo } : {}) }
}

export const appQuery = (p: PublicAppParams) => {
  const q = new URLSearchParams({ path: p.path, name: p.name, bg: p.bg, fg: p.fg })
  if (p.logo && /^https:\/\//i.test(p.logo)) q.set('logo', p.logo)
  return q.toString()
}

export const iconUrl = (p: PublicAppParams, size: number, maskable = false) => {
  const q = new URLSearchParams({ text: initialsFor(p.name), bg: p.bg, fg: p.fg, size: String(size) })
  if (maskable) q.set('maskable', '1')
  if (p.logo) q.set('logo', p.logo)
  return `/api/app-icon?${q.toString()}`
}

export const shortName = (name: string) => {
  if (name.length <= 12) return name
  const first = name.split(/\s+/)[0]
  return first.length >= 3 && first.length <= 12 ? first : name.slice(0, 12)
}

export const publicManifest = (p: PublicAppParams) => ({
  // Its own app, separate from the business dashboard and other storefronts.
  id: p.path,
  name: p.name,
  // Under the home-screen icon: the whole name if short, else its first word.
  short_name: shortName(p.name),
  start_url: p.path,
  // The start page must sit inside the scope, so no trailing slash: checkout
  // and order tracking (/eat/<slug>/…) stay in the app.
  scope: p.path,
  display: 'standalone' as const,
  background_color: '#ffffff',
  theme_color: p.bg,
  icons: [
    { src: iconUrl(p, 192), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: iconUrl(p, 512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: iconUrl(p, 512, true), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
})

// ── Icons ───────────────────────────────────────────────────────────────────

export const ICON_SIZES = [180, 192, 512] as const

export const iconParams = (q: URLSearchParams) => {
  const size = Number(q.get('size'))
  return {
    size: (ICON_SIZES as readonly number[]).includes(size) ? size : 192,
    text: (q.get('text') ?? 'S').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'S',
    bg: HEX.test(q.get('bg') ?? '') ? q.get('bg')! : '#0865AC',
    fg: HEX.test(q.get('fg') ?? '') ? q.get('fg')! : '#FFFFFF',
    maskable: q.get('maskable') === '1',
    logo: /^https:\/\/\S+$/i.test(q.get('logo') ?? '') ? q.get('logo')! : null,
  }
}

// Logos are fetched only from our own API's host, or hosts listed in
// APP_ICON_HOSTS (comma-separated) — never anything a visitor types.
export const allowedLogoHost = (url: string, env: Record<string, string | undefined> = process.env) => {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const hosts = new Set(
      [env.NEXT_PUBLIC_API_URL ? new URL(env.NEXT_PUBLIC_API_URL).host : '', ...(env.APP_ICON_HOSTS ?? '').split(',')]
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    )
    return hosts.has(u.host.toLowerCase())
  } catch {
    return false
  }
}
