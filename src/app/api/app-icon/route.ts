import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { allowedLogoHost, iconParams } from '@/lib/public-app'

// A public site's home-screen icon: the business's logo, squared. With no
// logo — or one we can't fetch — the Sellix logo. Maskable icons keep the
// picture inside the middle 80% so a round launcher crop never cuts it.
export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024

const fetchLogo = async (url: string): Promise<Buffer | null> => {
  if (!allowedLogoHost(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' })
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length <= MAX_BYTES ? buf : null
  } catch {
    return null
  }
}

// The platform's own icons (public/icons, made from the Sellix logo).
const sellixIcon = (size: number, maskable: boolean) =>
  readFile(path.join(process.cwd(), 'public', 'icons', `${maskable ? 'maskable' : 'icon'}-512.png`)).then((buf) =>
    sharp(buf).resize(size, size).png().toBuffer()
  )

const logoIcon = async (logo: Buffer, size: number, maskable: boolean, bg: string) => {
  const inner = maskable ? Math.round(size * 0.72) : size
  const art = await sharp(logo).resize(inner, inner, { fit: 'cover' }).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: maskable ? bg : '#ffffff' } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toBuffer()
}

export async function GET(req: Request) {
  const p = iconParams(new URL(req.url).searchParams)
  const logo = p.logo ? await fetchLogo(p.logo) : null
  let png: Buffer
  try {
    png = logo ? await logoIcon(logo, p.size, p.maskable, p.bg) : await sellixIcon(p.size, p.maskable)
  } catch {
    // Not a picture after all: the Sellix logo.
    png = await sellixIcon(p.size, p.maskable)
  }
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  })
}
