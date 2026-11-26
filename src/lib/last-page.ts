// The installed phone/tablet app reopens on the screen it was last on, like
// the Windows desktop app (desktop/last-page.js). The page keeps it in a
// cookie (RememberPage) so the middleware can send the app's start page
// straight there when the person is still signed in.
//
// It's tied to who saved it (business, user, kind of account): someone else
// signing in on the same phone starts on their own home page. It never gets
// anyone past sign-in or a permission check: the middleware still checks the
// page it redirects to.

export const LAST_PAGE_COOKIE = 'sellix.last'
export const LAST_PAGE_MAX_AGE_S = 30 * 24 * 60 * 60

type Who = { tenant?: unknown; userId?: unknown; accountType?: unknown } | null | undefined

export const whoFor = (u: Who) => (u?.accountType ? `${String(u.tenant ?? '')}:${String(u.userId ?? '')}:${String(u.accountType)}` : null)

// Dashboard screens only: not the sign-in pages, the public sites or anything odd.
const SIGN_IN = /^\/(en|fr)(\/staff|\/forgot-password|\/select-app|\/super-admin\/login)?\/?$/
const PUBLIC = /^\/(en|fr)\/(eat|rentals|amusement\/board)(\/|$)/

export const keepablePage = (page: string) =>
  page.length <= 300 &&
  /^\/(en|fr)\/[A-Za-z0-9\-._~%/]+(\?[A-Za-z0-9\-._~%=&+]*)?$/.test(page) &&
  !page.includes('//') &&
  !page.includes('..') &&
  !SIGN_IN.test(page.split('?')[0]) &&
  !PUBLIC.test(page)

export const lastPageCookie = (who: string, page: string) => encodeURIComponent(`${who}|${page}`)

// The saved page, if it's this person's and still a dashboard screen.
export const lastPageFor = (cookie: string | undefined, who: string | null) => {
  if (!cookie || !who) return null
  let value: string
  try {
    value = decodeURIComponent(cookie)
  } catch {
    return null
  }
  const bar = value.indexOf('|')
  if (bar < 0 || value.slice(0, bar) !== who) return null
  const page = value.slice(bar + 1)
  return keepablePage(page) ? page : null
}
