// In the browser, the desktop app's business comes from the page's meta tag
// (src/app/layout.tsx), since localhost has no subdomain.
import { clientTenantSlug, DESKTOP_BUSINESS_META } from '@/lib/tenant'

const setMeta = (content: string | null) => {
  document.head.querySelectorAll(`meta[name="${DESKTOP_BUSINESS_META}"]`).forEach((m) => m.remove())
  if (content === null) return
  const meta = document.createElement('meta')
  meta.name = DESKTOP_BUSINESS_META
  meta.content = content
  document.head.appendChild(meta)
}

afterEach(() => setMeta(null))

describe('clientTenantSlug', () => {
  it('is null on the web with no subdomain and no meta tag', () => {
    expect(clientTenantSlug()).toBeNull()
  })

  it('reads the desktop business from the meta tag', () => {
    setMeta('belkis')
    expect(clientTenantSlug()).toBe('belkis')
  })

  it('ignores a meta tag that is not a business code', () => {
    setMeta('<script>')
    expect(clientTenantSlug()).toBeNull()
  })
})
