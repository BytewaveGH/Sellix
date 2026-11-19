// @vitest-environment node
// The Windows desktop app is set up for one business, which stands in for the
// subdomain (src/lib/tenant.ts, desktop/business.js). On the web it's never set.
import authConfig from '@/auth.config'
import { desktopBusiness, hostTenantSlug } from '@/lib/tenant'

const authorize = (providerId: string) => {
  const provider: any = authConfig.providers.find((p: any) => (p.options?.id ?? p.id) === providerId)
  return (creds: Record<string, string>) => provider.options.authorize(creds, { headers: new Headers({ host: 'localhost:3210' }) })
}

// Records the X-Tenant-Domain each API call was sent with.
const recordTenants = () => {
  const sent: Record<string, string | null> = {}
  const fetchMock = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input)
    const path = url.replace(/^.*?\/(auth\/admin-login|employees\/login|platform\/tenants\/lookup).*$/, '$1')
    sent[path] = new Headers(init?.headers).get('X-Tenant-Domain')
    if (path === 'auth/admin-login') {
      return Response.json({
        status: true,
        data: {
          accessToken: 'a',
          refreshToken: 'r',
          accessTokenExpiry: 9e9,
          refreshTokenExpiry: 9e9,
          user: { id: 1, username: 'Owner', accountType: 'admin', appType: 'retail' },
        },
      })
    }
    if (path === 'employees/login') {
      return Response.json({ status: true, data: { token: 't', expireAt: 9e9, employee: { id: 7, name: 'Ama', canManageSales: true } } })
    }
    return Response.json({ status: true, data: { exists: true, appType: 'retail' } })
  })
  return { sent, fetchMock }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the desktop business stands in for the subdomain', () => {
  it('is used only when set, and only as a valid business code', () => {
    expect(hostTenantSlug('localhost:3210', {})).toBeNull()
    expect(hostTenantSlug('localhost:3210', { SELLIX_DESKTOP_BUSINESS: 'belkis' })).toBe('belkis')
    expect(hostTenantSlug('localhost:3210', { SELLIX_DESKTOP_BUSINESS: 'belkis-foods' })).toBe('belkis-foods')
    for (const bad of ['', 'Belkis', 'bel kis', 'belkis.app', '-belkis', 'a/b']) {
      expect(desktopBusiness({ SELLIX_DESKTOP_BUSINESS: bad })).toBeNull()
    }
  })

  it('staff sign in to the desktop business', async () => {
    vi.stubEnv('SELLIX_DESKTOP_BUSINESS', 'belkis')
    const { sent, fetchMock } = recordTenants()
    vi.stubGlobal('fetch', fetchMock)
    const user = await authorize('employee-credentials')({ email: 'ama@x.com', password: 'pw' })
    expect(sent['employees/login']).toBe('belkis')
    expect(user).toMatchObject({ accountType: 'employee', tenant: 'belkis' })
  })

  it('owners sign in to the desktop business', async () => {
    vi.stubEnv('SELLIX_DESKTOP_BUSINESS', 'frozen')
    const { sent, fetchMock } = recordTenants()
    vi.stubGlobal('fetch', fetchMock)
    const user = await authorize('credentials')({ email: 'o@x.com', password: 'secret12' })
    expect(sent['auth/admin-login']).toBe('frozen')
    expect(user).toMatchObject({ tenant: 'frozen' })
  })

  it('without it, login is unchanged (the web)', async () => {
    const { sent, fetchMock } = recordTenants()
    vi.stubGlobal('fetch', fetchMock)
    await authorize('employee-credentials')({ email: 'ama@x.com', password: 'pw' })
    expect(sent['employees/login']).toBe('admin')
  })
})
