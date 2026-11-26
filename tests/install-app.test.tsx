// Installing Sellix on a phone or tablet: the web app manifest (named after the
// business on its subdomain) and the "Install app" button in the top bar.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

const host = vi.hoisted(() => {
  // Read when lib/tenant loads.
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'sellix.example.com'
  return { value: 'belkis-hub.sellix.example.com' }
})
vi.mock('next/headers', () => ({ headers: () => new Map([['host', host.value]]) }))
const nav = vi.hoisted(() => ({ path: '/en' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }))

import manifest, { businessName } from '@/app/manifest'
import { CARD_SNOOZE_MS, GetAppButton, InstallApp, InstallCard } from '@/components/install/install-app'
import { resetInstallState } from '@/components/install/install-state'
import { usePublicApp } from '@/components/install/use-public-app'
import { DESKTOP_BUSINESS_META } from '@/lib/tenant'

describe('manifest', () => {
  it('is named after the business on its subdomain, with installable icons', () => {
    const m = manifest()
    expect(m).toMatchObject({ name: 'Belkis Hub · Sellix', short_name: 'Belkis Hub', display: 'standalone', start_url: '/', theme_color: '#0865AC' })
    const sizes = (m.icons ?? []).map((i) => `${i.sizes} ${i.purpose}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '192x192 maskable', '512x512 maskable']))
  })

  it('on the main site it is plain Sellix', () => {
    host.value = 'sellix.example.com'
    expect(manifest()).toMatchObject({ name: 'Sellix POS', short_name: 'Sellix' })
    expect(businessName('kofi-and-crumb')).toBe('Kofi And Crumb')
  })
})

describe('Install app button', () => {
  const ua = navigator.userAgent
  beforeEach(() => {
    localStorage.clear()
    resetInstallState()
    nav.path = '/en'
    document.head.querySelector(`meta[name="${DESKTOP_BUSINESS_META}"]`)?.remove()
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any
  })

  it('appears when the browser offers an install, and installs in one tap', async () => {
    render(<InstallApp />)
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
    const prompt = vi.fn(async () => {})
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    act(() => void window.dispatchEvent(event))
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
    await act(async () => {})
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
  })

  it('on an iPhone explains Share → Add to Home Screen, and can be hidden for good', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', configurable: true })
    const { unmount } = render(<InstallApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Don’t show again' }))
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
    unmount()
    render(<InstallApp />)
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
  })

  it('never shows inside the Windows desktop app', () => {
    const meta = document.createElement('meta')
    meta.name = DESKTOP_BUSINESS_META
    meta.content = 'belkis'
    document.head.appendChild(meta)
    render(<InstallApp />)
    act(() => void window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) })))
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
  })
})

describe('first-visit install card (phones and tablets)', () => {
  const ua = navigator.userAgent
  const setUa = (v: string) => Object.defineProperty(navigator, 'userAgent', { value: v, configurable: true })
  const offer = (prompt = vi.fn(async () => {}), outcome: 'accepted' | 'dismissed' = 'accepted') =>
    act(() => void window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome }) })))
  beforeEach(() => {
    localStorage.clear()
    resetInstallState()
    nav.path = '/en'
    document.head.querySelector(`meta[name="${DESKTOP_BUSINESS_META}"]`)?.remove()
  })
  afterEach(() => setUa(ua))

  it('Android: offers a one-tap install on the sign-in page', async () => {
    setUa('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')
    render(<InstallCard />)
    // Before the browser says it can install: how to do it from the menu.
    expect(screen.getByText('Install app')).toBeTruthy()
    const prompt = vi.fn(async () => {})
    offer(prompt)
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    await act(async () => {})
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
  })

  it('iPhone: shows Share → Add to Home Screen; “Not now” waits two weeks', () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    let t = 1_000_000
    const { unmount } = render(<InstallCard now={() => t} />)
    expect(screen.getByText('Install Sellix on this phone')).toBeTruthy()
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
    unmount()
    const again = render(<InstallCard now={() => t} />)
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
    again.unmount()
    t += CARD_SNOOZE_MS + 1
    render(<InstallCard now={() => t} />)
    expect(screen.getByRole('dialog', { name: 'Install Sellix' })).toBeTruthy()
  })

  it('a restaurant’s storefront offers customers that restaurant as its own app', async () => {
    setUa('Mozilla/5.0 (Linux; Android 14) Mobile')
    nav.path = '/en/eat/kofi-and-crumb'
    const Page = () => {
      usePublicApp({ path: '/en/eat/kofi-and-crumb', bg: '#D4572A', fg: '#FFFFFF' })
      return <InstallCard />
    }
    render(<Page />)
    expect(await screen.findByText('Add Kofi And Crumb to your home screen')).toBeTruthy()
    expect(screen.getByText(/Order again in one tap/)).toBeTruthy()
    // Its own manifest and home-screen icon.
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toMatch(/^\/api\/app-manifest\?path=%2Fen%2Feat%2Fkofi-and-crumb&name=Kofi\+And\+Crumb/)
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toMatch(/^\/api\/app-icon\?text=KA&bg=%23D4572A/)
    // "Not now" there doesn't hide the dashboard's own card.
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(Object.keys(localStorage).some((k) => k.endsWith(':/en/eat/kofi-and-crumb'))).toBe(true)
    expect(localStorage.getItem('sellix.install.card:app')).toBeNull()
  })

  it('not on computers, before a public page has loaded, the console or the desktop app', () => {
    setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131')
    offer()
    const pc = render(<InstallCard />)
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
    pc.unmount()

    setUa('Mozilla/5.0 (Linux; Android 14) Mobile')
    nav.path = '/en/eat/kofi-and-crumb'
    const menu = render(<InstallCard />) // storefront not loaded yet: never the dashboard's app
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
    menu.unmount()

    nav.path = '/en/super-admin'
    const console_ = render(<InstallCard />)
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
    console_.unmount()

    nav.path = '/en'
    const meta = document.createElement('meta')
    meta.name = DESKTOP_BUSINESS_META
    meta.content = 'belkis'
    document.head.appendChild(meta)
    render(<InstallCard />)
    expect(screen.queryByRole('dialog', { name: 'Install Sellix' })).toBeNull()
  })
})

describe('public site manifest in the page', () => {
  it('going from Sellix Eats to a storefront saves the storefront, not Sellix Eats', () => {
    document.head.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove())
    // What the server put in the Sellix Eats page (publicAppMetadata).
    const link = Object.assign(document.createElement('link'), { rel: 'manifest' })
    link.setAttribute('href', '/api/app-manifest?path=%2Fen%2Feat&name=Sellix+Eats')
    document.head.appendChild(link)
    const Directory = () => {
      usePublicApp({ path: '/en/eat', bg: '#0865AC', fg: '#FFFFFF' })
      return null
    }
    const page = render(<Directory />)
    // Next moves to the storefront: its metadata writes the storefront's manifest…
    const storefront = '/api/app-manifest?path=%2Fen%2Feat%2Fkofi-and-crumb&name=Kofi+And+Crumb'
    link.setAttribute('href', storefront)
    // …then Sellix Eats' page goes away. It must not put its own manifest back.
    page.unmount()
    expect(link.getAttribute('href')).toBe(storefront)
    link.remove()
  })

  it('still tidies up after itself when nothing else changed the page', () => {
    const link = Object.assign(document.createElement('link'), { rel: 'manifest' })
    link.setAttribute('href', '/manifest.webmanifest')
    document.head.appendChild(link)
    const Directory = () => {
      usePublicApp({ path: '/en/eat', bg: '#0865AC', fg: '#FFFFFF' })
      return null
    }
    const page = render(<Directory />)
    expect(link.getAttribute('href')).toMatch(/^\/api\/app-manifest\?path=%2Fen%2Feat&/)
    page.unmount()
    expect(link.getAttribute('href')).toBe('/manifest.webmanifest')
    link.remove()
  })
})


describe('Get the app button on a public site', () => {
  const ua = navigator.userAgent
  const setUa = (v: string) => Object.defineProperty(navigator, 'userAgent', { value: v, configurable: true })
  beforeEach(() => {
    localStorage.clear()
    resetInstallState()
    nav.path = '/en/eat/kofi-and-crumb'
    // (The card tests above leave the desktop app's marker in the page.)
    document.head.querySelector(`meta[name="${DESKTOP_BUSINESS_META}"]`)?.remove()
  })
  afterEach(() => setUa(ua))
  const Storefront = () => {
    usePublicApp({ path: '/en/eat/kofi-and-crumb', bg: '#D4572A', fg: '#FFFFFF' })
    return <GetAppButton />
  }

  it('Android: one tap installs the storefront, no steps', async () => {
    setUa('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')
    render(<Storefront />)
    const prompt = vi.fn(async () => {})
    act(() => void window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })))
    fireEvent.click(await screen.findByRole('button', { name: 'Get the Kofi And Crumb app' }))
    await act(async () => {})
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('iPhone: shows the two steps with the storefront’s icon', async () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    render(<Storefront />)
    fireEvent.click(await screen.findByRole('button', { name: 'Get the Kofi And Crumb app' }))
    const sheet = screen.getByRole('dialog', { name: 'Get the Kofi And Crumb app' })
    expect(sheet.textContent).toContain('Add to Home Screen')
    expect(sheet.querySelector('img')?.getAttribute('src')).toMatch(/^\/api\/app-icon\?/)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('not on the dashboard’s pages, nor once installed', () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    nav.path = '/en/eatery'
    const a = render(<GetAppButton />)
    expect(screen.queryByRole('button', { name: /Get the/ })).toBeNull()
    a.unmount()
    window.matchMedia = ((q: string) => ({ matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as any
    render(<Storefront />)
    expect(screen.queryByRole('button', { name: /Get the/ })).toBeNull()
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any
  })
})
