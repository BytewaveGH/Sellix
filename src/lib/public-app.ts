// Customers can install a public site — a restaurant's Sellix Eat storefront,
// a landlord's rentals site, or the directories — as its own app on their
// phone: named after the business, in its colour, opening on its page.
//
// Its icon is the business's logo (wherever it's stored), or the Sellix logo
// when it has none or it can't be fetched.
// The page knows the business (its data may only exist in the browser), so it
// passes name, colours and logo to /api/app-manifest and /api/app-icon, which
// only accept public pages and plain values. Pure helpers here, tested.

export type PublicAppParams = {
  path: string
  name: string
  bg: string
  fg: string
  // The logo, when it's an https link (logos kept in the page itself can't be fetched).
  logo?: string
}

// "belkis-hub" → "Belkis Hub"
export const businessName = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

// The installed app's name: the business's subdomain; on the main site, the
// storefront or rentals site's own address; the directories are Sellix Eats
// and Sellix Homes; anything else plain Sellix.
export const publicAppName = (path: string, hostSlug: string | null | undefined) => {
  if (hostSlug) return businessName(hostSlug)
  const m = path.match(/^\/(?:en|fr)\/(eat|rentals)(?:\/([^/?#]+))?/)
  if (m?.[2]) {
    let site = m[2]
    try {
      site = decodeURIComponent(site)
    } catch {}
    return cleanName(businessName(site.replace(/[^A-Za-z0-9-]+/g, '-'))) || 'Sellix'
  }
  return m?.[1] === 'eat' ? 'Sellix Eats' : m?.[1] === 'rentals' ? 'Sellix Homes' : 'Sellix'
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
    .map((w) =>
      w
        .replace(/[^A-Za-z0-9]/g, '')
        .charAt(0)
        .toUpperCase()
    )
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
  if (p.logo && /^https:\/\//i.test(p.logo) && p.logo.length <= 1000) q.set('logo', p.logo)
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

// In the page's HTML from the start (the public layouts' generateMetadata), so
// a phone saving the page never picks up the dashboard's manifest, whose start
// page is the sign-in. The page then adds its colour and logo (usePublicApp).
export const publicAppMetadata = (path: string, hostSlug: string | null | undefined) => {
  const name = publicAppName(path, hostSlug)
  return {
    manifest: `/api/app-manifest?${appQuery({ path, name, bg: '#0865AC', fg: '#FFFFFF' })}`,
    appleWebApp: { capable: true, title: name, statusBarStyle: 'default' as const },
  }
}

// ── Icons ───────────────────────────────────────────────────────────────────

export const ICON_SIZES = [180, 192, 512] as const

export const iconParams = (q: URLSearchParams) => {
  const size = Number(q.get('size'))
  return {
    size: (ICON_SIZES as readonly number[]).includes(size) ? size : 192,
    text:
      (q.get('text') ?? 'S')
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 2)
        .toUpperCase() || 'S',
    bg: HEX.test(q.get('bg') ?? '') ? q.get('bg')! : '#0865AC',
    fg: HEX.test(q.get('fg') ?? '') ? q.get('fg')! : '#FFFFFF',
    maskable: q.get('maskable') === '1',
    logo: /^https:\/\/\S+$/i.test(q.get('logo') ?? '') ? q.get('logo')! : null,
  }
}

// Logos can live anywhere public (the upload storage, a pasted link), so the
// icon route fetches any https address, but never one that points inside our
// own network: every address the name resolves to must be public.
export const isPublicAddress = (ip: string): boolean => {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  const v6 = ip.toLowerCase()
  if (!v6.includes(':')) return false
  if (v6 === '::' || v6 === '::1') return false
  if (/^::ffff:/.test(v6)) return false // mapped forms not in dotted notation: refuse
  return !/^(fc|fd|fe[89ab]|ff)/.test(v6)
}

// The parts of a logo address we check before looking it up.
export const logoUrlProblem = (url: string): string | null => {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'not a link'
  }
  if (u.protocol !== 'https:') return 'not https'
  if (u.username || u.password) return 'has credentials'
  if (u.port && u.port !== '443') return 'odd port'
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) return 'local name'
  return null
}
