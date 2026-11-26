'use client'

// On a public site (storefront, rentals site, directory): point the page's
// manifest at that site's own app, so "Install" / "Add to Home Screen" saves
// it under its own name, colour and icon, opening on its page. Everything is
// put back when the customer leaves.

import { useEffect } from 'react'
import { appQuery, iconUrl, publicAppName, type PublicAppParams } from '@/lib/public-app'
import { clientTenantSlug } from '@/lib/tenant'
import { setPublicApp } from './install-state'

export const APP_TITLE_META = 'apple-mobile-web-app-title'

const ensure = <T extends HTMLElement>(selector: string, make: () => T) => {
  const found = document.head.querySelector<T>(selector)
  if (found) return { el: found, made: false }
  const el = make()
  document.head.appendChild(el)
  return { el, made: true }
}

// The name follows the address (publicAppName), as in the page's HTML.
export type PublicAppInput = Omit<PublicAppParams, 'name'>

export const usePublicApp = (input: PublicAppInput | null | undefined) => {
  const app: PublicAppParams | null = input ? { ...input, name: publicAppName(input.path, clientTenantSlug()) } : null
  const key = app ? appQuery(app) : ''
  useEffect(() => {
    if (!app) return
    const manifest = ensure('link[rel="manifest"]', () => Object.assign(document.createElement('link'), { rel: 'manifest' }))
    // iPhones use this, not the manifest, for the home-screen icon.
    const touch = ensure('link[rel="apple-touch-icon"]', () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }))
    const title = ensure(`meta[name="${APP_TITLE_META}"]`, () => Object.assign(document.createElement('meta'), { name: APP_TITLE_META }))
    const saved = [manifest.el.getAttribute('href'), touch.el.getAttribute('href'), touch.el.getAttribute('sizes'), title.el.getAttribute('content')]

    manifest.el.setAttribute('href', `/api/app-manifest?${key}`)
    touch.el.setAttribute('href', iconUrl(app, 180))
    touch.el.setAttribute('sizes', '180x180')
    title.el.setAttribute('content', app.name)
    setPublicApp({ path: app.path, name: app.name, kind: /\/rentals(\/|$)/.test(app.path) ? 'rentals' : 'eat' })

    const ours = { manifest: manifest.el.getAttribute('href'), touch: touch.el.getAttribute('href'), title: title.el.getAttribute('content') }
    // Put things back only if they're still what we set. Moving from Sellix
    // Eats to a storefront, Next has already written the storefront's manifest
    // into the page by the time this runs; putting Sellix Eats' back would make
    // "Add to Home Screen" save Sellix Eats instead of the storefront.
    const restore = (el: Element, attr: string, mine: string | null, v: string | null) => {
      if (el.getAttribute(attr) !== mine) return
      if (v === null) el.removeAttribute(attr)
      else el.setAttribute(attr, v)
    }
    return () => {
      setPublicApp(null)
      if (manifest.made) manifest.el.remove()
      else restore(manifest.el, 'href', ours.manifest, saved[0])
      if (touch.made) touch.el.remove()
      else if (touch.el.getAttribute('href') === ours.touch) {
        restore(touch.el, 'href', ours.touch, saved[1])
        if (saved[2] === null) touch.el.removeAttribute('sizes')
        else touch.el.setAttribute('sizes', saved[2])
      }
      if (title.made) title.el.remove()
      else restore(title.el, 'content', ours.title, saved[3])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

// For the directories' server layouts.
export const PublicApp = ({ app }: { app: PublicAppInput }) => {
  usePublicApp(app)
  return null
}
