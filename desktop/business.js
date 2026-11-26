// Which business this till is set up for. It stands in for the subdomain the
// web app uses (belkis.example.com): the local server gets it as
// SELLIX_DESKTOP_BUSINESS and sends it on every login.
//
// Kept in the user's app data as business.json: { slug, appType, setAt }.

const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const file = () => path.join(app.getPath('userData'), 'business.json')

// "belkis-foods" → "Belkis Foods". The lookup gives no display name.
const displayName = (slug) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

const normalize = (input) =>
  String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    // Someone may paste their web address: "belkis.sellix.app" → "belkis".
    .split(/[./:]/)[0]

function readBusiness() {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'))
    if (saved && SLUG_RE.test(saved.slug)) return { ...saved, name: displayName(saved.slug) }
  } catch {
    // not set up yet
  }
  return null
}

function saveBusiness({ slug, appType }) {
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify({ slug, appType: appType ?? null, setAt: new Date().toISOString() }, null, 2))
  return readBusiness()
}

// The API this build talks to, written next to the bundled server by build-web.mjs.
function apiUrl(serverDir) {
  try {
    const { apiUrl: url } = JSON.parse(fs.readFileSync(path.join(serverDir, 'desktop-config.json'), 'utf8'))
    if (url) return url
  } catch {
    // fall through
  }
  throw new Error('This build has no API address. Rebuild it with "npm run build:web".')
}

const withTimeout = (ms) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, done: () => clearTimeout(timer) }
}

// Checks a business code with the same public lookup the web's business picker uses.
// Returns { ok: true, slug, appType, name } or { ok: false, message }.
async function lookUp(serverDir, input) {
  const slug = normalize(input)
  if (!slug) return { ok: false, message: 'Enter your business code.' }
  if (!SLUG_RE.test(slug)) return { ok: false, message: 'A business code has only letters, numbers and dashes, like "belkis".' }

  let base
  try {
    base = apiUrl(serverDir)
  } catch (err) {
    return { ok: false, message: err.message }
  }
  const t = withTimeout(15_000)
  try {
    const res = await fetch(`${base}/platform/tenants/lookup?slug=${encodeURIComponent(slug)}`, { signal: t.signal, cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.data?.exists) {
      return { ok: false, message: `No business uses the code "${slug}". Check it with the owner. It's the first part of the web address.` }
    }
    return { ok: true, slug, appType: body.data.appType ?? null, name: displayName(slug) }
  } catch {
    return {
      ok: false,
      message: "Couldn't reach Sellix to check the code. Setting up a till needs internet once. Check the connection and try again.",
    }
  } finally {
    t.done()
  }
}

// An owner of `slug` approves a change of business by signing in. The tokens
// that come back are thrown away; nothing about the owner is kept.
async function ownerApproves(serverDir, slug, email, password) {
  if (!email || !password) return { ok: false, message: "Enter the owner's email and password." }
  let base
  try {
    base = apiUrl(serverDir)
  } catch (err) {
    return { ok: false, message: err.message }
  }
  const t = withTimeout(15_000)
  try {
    const res = await fetch(`${base}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Domain': slug },
      body: JSON.stringify({ email: String(email).trim(), password: String(password) }),
      signal: t.signal,
    })
    await res.body?.cancel?.().catch(() => {})
    // 409: the password matches several of this owner's businesses, so it's right.
    if (res.ok || res.status === 409) return { ok: true }
    if (res.status === 401) return { ok: false, message: 'That email and password are not an owner of this business.' }
    if (res.status === 403) return { ok: false, message: 'This business is suspended. Contact Bytewave support.' }
    return { ok: false, message: `Sellix couldn't check the sign-in right now (error ${res.status}). Try again.` }
  } catch {
    return { ok: false, message: "Couldn't reach Sellix to check the owner's sign-in. Check the connection and try again." }
  } finally {
    t.done()
  }
}

module.exports = { readBusiness, saveBusiness, lookUp, ownerApproves, normalize }
