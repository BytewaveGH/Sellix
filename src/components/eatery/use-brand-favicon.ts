'use client'

// The browser-tab icon on a restaurant's public pages: their logo, or their
// initials in their brand colours (like BrandMark) when no logo is uploaded.
// The platform's own icons (src/app/icon.png…) come back when the customer
// leaves the storefront.

import { useEffect, useState } from 'react'
import { resolveTheme } from '@/lib/eatery/theme'
import type { Restaurant } from '@/lib/eatery/types'
import { initialsOf } from './theme-scope'

type Brand = Pick<Restaurant, 'name' | 'theme'>

const SIZE = 64

const cornerRadius = (shape: string) => (shape === 'sharp' ? 0 : shape === 'pill' ? SIZE / 2 : SIZE * 0.22)

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)

// Initials on the brand colour, as an SVG data URL.
export const initialsIcon = (brand: Brand) => {
  const p = resolveTheme(brand.theme).palette
  const text = escapeXml(initialsOf(brand.name) || '•')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" rx="${cornerRadius(brand.theme.shape)}" fill="${p.primary}"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-weight="800" font-size="${text.length > 1 ? 28 : 34}" fill="${p.onPrimary}">${text}</text>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// The logo cropped to a square with the brand's corners, as a PNG data URL.
// Falls back to the logo URL itself if it can't be drawn (e.g. a remote image
// without CORS headers).
const logoIcon = (url: string, shape: string) =>
  new Promise<string>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(url)
        const r = cornerRadius(shape)
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(0, 0, SIZE, SIZE, r)
        else ctx.rect(0, 0, SIZE, SIZE)
        ctx.clip()
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(url)
      }
    }
    img.onerror = () => resolve(url)
    img.src = url
  })

export const useBrandFavicon = (brand: Brand | undefined) => {
  const logo = brand?.theme.imagery.logoUrl
  const fallback = brand ? initialsIcon(brand) : null
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    if (!logo) return setHref(fallback)
    let live = true
    setHref(fallback)
    void logoIcon(logo, brand!.theme.shape).then((h) => live && setHref(h))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo, fallback])

  useEffect(() => {
    if (!href) return
    // Point every icon link at the brand icon; put the platform's back afterwards.
    // iOS home-screen icons can't be SVG, so the initials icon leaves that one alone.
    const type = href.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png'
    const selector = type === 'image/png' ? 'link[rel~="icon"], link[rel="apple-touch-icon"]' : 'link[rel~="icon"]'
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>(selector))
    const saved = links.map((l) => [l, l.getAttribute('href'), l.getAttribute('type'), l.getAttribute('sizes')] as const)
    for (const l of links) {
      l.href = href
      l.type = type
      l.removeAttribute('sizes')
    }
    let added: HTMLLinkElement | null = null
    if (!links.length) {
      added = document.createElement('link')
      added.rel = 'icon'
      added.href = href
      added.type = type
      document.head.appendChild(added)
    }
    return () => {
      for (const [l, h, t, s] of saved) {
        if (h === null) l.removeAttribute('href')
        else l.setAttribute('href', h)
        if (t === null) l.removeAttribute('type')
        else l.setAttribute('type', t)
        if (s !== null) l.setAttribute('sizes', s)
      }
      added?.remove()
    }
  }, [href])
}
