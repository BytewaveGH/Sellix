// The screen the till was last on, so closing the window (by mistake or at the
// end of the day) and opening it again goes back there instead of to the
// sign-in page. The sign-in itself is the session cookie, which lasts until
// it expires or someone signs out; this only remembers where to reopen.
//
// If the session has ended, the web app's middleware sends the page to
// sign-in as usual, so a saved page never gets anyone past sign-in.
//
// Kept in the user's app data as last-page.json: { path, business }.

const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

const file = () => path.join(app.getPath('userData'), 'last-page.json')

// Sign-in pages reopen without their query (?reason=expired would show the
// old message again).
const SIGN_IN_RE = /^\/(en|fr)(\/staff|\/forgot-password)?\/?$/

// Only our own app's pages: /en/... or /fr/...
function pageOf(url, origin) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.origin !== origin || !/^\/(en|fr)(\/|$)/.test(u.pathname)) return null
  return SIGN_IN_RE.test(u.pathname) ? u.pathname : u.pathname + u.search
}

function rememberPage(url, origin, business) {
  const page = pageOf(url, origin)
  if (!page) return
  try {
    fs.writeFileSync(file(), JSON.stringify({ path: page, business }))
  } catch {
    // not worth interrupting a sale over
  }
}

// The saved page for this business, or null.
function lastPage(origin, business) {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'))
    if (saved?.business !== business) return null
    return pageOf(origin + saved.path, origin)
  } catch {
    return null
  }
}

function forgetPage() {
  try {
    fs.rmSync(file(), { force: true })
  } catch {
    // nothing saved
  }
}

module.exports = { rememberPage, lastPage, forgetPage, pageOf }
