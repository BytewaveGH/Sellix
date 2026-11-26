// @vitest-environment node
// Public sites as their own installable apps (src/lib/public-app.ts and the
// /api/app-manifest and /api/app-icon routes).
import sharp from 'sharp'

// Logo hosts resolve to a public address unless the test says otherwise.
const dns = vi.hoisted(() => ({ addrs: {} as Record<string, string[]> }))
vi.mock('node:dns/promises', () => ({
  lookup: async (host: string) => (dns.addrs[host] ?? ['93.184.216.34']).map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
}))

import { isPublicAddress, logoUrlProblem, iconParams, parseAppParams, publicAppMetadata, publicAppName, publicManifest, shortName } from '@/lib/public-app'
import { GET as manifestRoute } from '@/app/api/app-manifest/route'
import { GET as iconRoute } from '@/app/api/app-icon/route'

const q = (o: Record<string, string>) => new URLSearchParams(o)

describe('public app manifest', () => {
  it('opens on the storefront and keeps checkout and order tracking inside the app', () => {
    const p = parseAppParams(q({ path: '/en/eat/kofi-and-crumb', name: 'Kofi & Crumb', bg: '#D4572A', fg: '#ffffff' }))!
    const m = publicManifest(p)
    expect(m).toMatchObject({ id: '/en/eat/kofi-and-crumb', start_url: '/en/eat/kofi-and-crumb', scope: '/en/eat/kofi-and-crumb', name: 'Kofi & Crumb', theme_color: '#D4572A', display: 'standalone' })
    expect('/en/eat/kofi-and-crumb/checkout'.startsWith(m.scope)).toBe(true)
    expect(m.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable'])
  })

  it('only for public pages, with safe values', () => {
    expect(parseAppParams(q({ path: '/en/stores/pos', name: 'x' }))).toBeNull()
    expect(parseAppParams(q({ path: '/en/eat/../stores', name: 'x' }))).toBeNull()
    expect(parseAppParams(q({ path: 'https://evil.com/en/eat', name: 'x' }))).toBeNull()
    expect(parseAppParams(q({ path: '/fr/rentals/asokwa', name: '<b>Asokwa</b>', bg: 'red', logo: 'http://x.com/a.png' }))).toEqual({
      path: '/fr/rentals/asokwa',
      name: 'bAsokwa/b',
      bg: '#0865AC',
      fg: '#FFFFFF',
    })
    expect(shortName('Mama Esi’s Chop Bar')).toBe('Mama')
    expect(shortName('Blaze Grill')).toBe('Blaze Grill')
  })

  it('logos come from anywhere public, never inside our own network', () => {
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '172.32.0.1']) expect(isPublicAddress(ip)).toBe(true)
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '999.1.1.1'])
      expect(isPublicAddress(ip)).toBe(false)
    expect(logoUrlProblem('https://res.cloudinary.com/x/logo.png')).toBeNull()
    for (const u of ['http://cdn.example.com/a.png', 'https://user:pw@cdn.example.com/a.png', 'https://cdn.example.com:8443/a.png', 'https://localhost/a.png', 'https://db.internal/a.png', 'nope'])
      expect(logoUrlProblem(u)).not.toBeNull()
    expect(iconParams(q({ size: '9999', text: '<s>' }))).toMatchObject({ size: 192, text: 'S' })
  })

  it('named after the subdomain, else the site, else Sellix Eats / Sellix Homes', () => {
    expect(publicAppName('/en/eat/kofi-and-crumb', 'belkis-hub')).toBe('Belkis Hub')
    expect(publicAppName('/en/eat', 'belkis-hub')).toBe('Belkis Hub')
    expect(publicAppName('/en/eat/kofi-and-crumb', null)).toBe('Kofi And Crumb')
    expect(publicAppName('/fr/rentals/asokwa%20lodge', null)).toBe('Asokwa Lodge')
    expect(publicAppName('/en/eat', null)).toBe('Sellix Eats')
    expect(publicAppName('/en/rentals', null)).toBe('Sellix Homes')
    expect(publicAppName('/en/stores', null)).toBe('Sellix')
  })

  it('the page’s HTML points at the site’s own app, never the dashboard’s (whose start is the sign-in)', () => {
    const md = publicAppMetadata('/en/eat/kofi-and-crumb', null)
    expect(md.manifest).toMatch(/^\/api\/app-manifest\?path=%2Fen%2Feat%2Fkofi-and-crumb&/)
    expect(md.appleWebApp.title).toBe('Kofi And Crumb')
  })

  it('the manifest route answers for public pages only, named by the address', async () => {
    const ok = await manifestRoute(new Request('http://x/api/app-manifest?path=%2Fen%2Feat&name=Something%20Else'))
    expect(ok.headers.get('content-type')).toBe('application/manifest+json')
    expect(await ok.json()).toMatchObject({ name: 'Sellix Eats', start_url: '/en/eat', id: '/en/eat' })
    expect((await manifestRoute(new Request('http://x/api/app-manifest?path=%2Fen%2Fsuper-admin'))).status).toBe(400)
  })

  const pixel = async (res: Response, x: number, y: number) => {
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true })
    const i = (y * info.width + x) * info.channels
    return { size: [info.width, info.height], rgb: [data[i], data[i + 1], data[i + 2]] }
  }

  it('no logo: the Sellix logo, at the asked size', async () => {
    const res = await iconRoute(new Request('http://x/api/app-icon?text=KC&bg=%23D4572A&size=512&maskable=1'))
    expect(res.headers.get('content-type')).toBe('image/png')
    const corner = await pixel(res, 2, 2)
    expect(corner.size).toEqual([512, 512])
    expect(corner.rgb).toEqual([255, 255, 255]) // the Sellix icon's white tile, not the brand colour
    // A logo that points inside our network gets the Sellix logo, never fetched.
    dns.addrs['sneaky.example'] = ['10.0.0.5']
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const other = await pixel(await iconRoute(new Request('http://x/api/app-icon?size=192&logo=https%3A%2F%2Fsneaky.example%2Fa.png')), 2, 2)
      expect(other).toEqual({ size: [192, 192], rgb: [255, 255, 255] })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('with a logo: uses the storefront’s logo, wherever it is stored', async () => {
    const red = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#E01010' } }).png().toBuffer()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(red), { headers: { 'content-type': 'image/png' } })))
    try {
      const res = await iconRoute(new Request('http://x/api/app-icon?size=192&logo=https%3A%2F%2Fres.cloudinary.com%2Fsellix%2Flogo.png'))
      expect((await pixel(res, 96, 96)).rgb).toEqual([224, 16, 16])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a redirect into our own network is not followed', async () => {
    dns.addrs['metadata.example'] = ['169.254.169.254']
    const fetchSpy = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://metadata.example/latest' } }))
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const res = await iconRoute(new Request('http://x/api/app-icon?size=192&logo=https%3A%2F%2Fcdn.example.com%2Flogo.png'))
      expect((await pixel(res, 2, 2)).rgb).toEqual([255, 255, 255])
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
