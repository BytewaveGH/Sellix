'use client'

// On a public site (storefront, rentals site, directory): point the page's
// manifest at that site's own app, so "Install" / "Add to Home Screen" saves
// it under its own name, colour and icon, opening on its page. Everything is
// put back when the customer leaves.

import { useEffect } from 'react'
import { appQuery, iconUrl, type PublicAppParams } from '@/lib/public-app'
import { setPublicApp } from './install-state'

export const APP_TITLE_META = 'apple-mobile-web-app-title'

const ensure = <T extends HTMLElement>(selector: string, make: () => T) => {
  const found = document.head.querySelector<T>(selector)
  if (found) return { el: found, made: false }
  const el = make()
  document.head.appendChild(el)
  return { el, made: true }
}

export const usePublicApp = (app: PublicAppParams | null | undefined) => {
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

    const restore = (el: Element, attr: string, v: string | null) => (v === null ? el.removeAttribute(attr) : el.setAttribute(attr, v))
    return () => {
      setPublicApp(null)
      if (manifest.made) manifest.el.remove()
      else restore(manifest.el, 'href', saved[0])
      if (touch.made) touch.el.remove()
      else {
        restore(touch.el, 'href', saved[1])
        restore(touch.el, 'sizes', saved[2])
      }
      if (title.made) title.el.remove()
      else restore(title.el, 'content', saved[3])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

// For the directories' server layouts.
export const PublicApp = ({ app }: { app: PublicAppParams }) => {
  usePublicApp(app)
  return null
}
