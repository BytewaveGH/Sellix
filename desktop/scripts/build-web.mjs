// Builds the web app for the desktop and stages it in desktop/next-server.
//
// The same code as the web, built with BUILD_TARGET=desktop (see next.config.mjs)
// into .next-desktop, so the web build in .next is never touched.
//
// Settings: the web's .env files still apply, except where desktop/desktop.env
// says otherwise. Secrets and web-only settings are always blanked here, so
// they can't be built into an installer that goes on every till. Next never
// overrides a variable that is already set, even to an empty string.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(here, '..')
const root = path.resolve(desktopDir, '..')
const distDir = path.join(root, '.next-desktop')
const stage = path.join(desktopDir, 'next-server')

// Never in the desktop build.
const BLANKED = {
  PLATFORM_KEY: '',
  SUPER_ADMIN_EMAIL: '',
  SUPER_ADMIN_PASSWORD: '',
  BETTER_AUTH_SECRET: '',
  AUTH_SECRET: '',
  OPENAI_API_KEY: '',
  NEXT_PUBLIC_OPENAI_API_KEY: '',
  BILLING_FILE: '',
  // One business per till: no subdomain routing on localhost.
  NEXT_PUBLIC_ROOT_DOMAIN: '',
}

const parseEnv = (file) => {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    let value = line.slice(eq + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    out[line.slice(0, eq).trim()] = value
  }
  return out
}

const desktopEnv = parseEnv(path.join(desktopDir, 'desktop.env'))
for (const key of Object.keys(desktopEnv)) {
  if (key in BLANKED && desktopEnv[key]) {
    console.error(`desktop.env sets ${key}, which must never be in the desktop build. Remove it.`)
    process.exit(1)
  }
}

// The installer's version, so the console can see which tills run which build.
const appVersion = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8')).version
const env = {
  ...process.env,
  ...desktopEnv,
  ...BLANKED,
  BUILD_TARGET: 'desktop',
  NEXT_PUBLIC_APP_VERSION: appVersion,
  NEXT_TELEMETRY_DISABLED: '1',
}

// What the build will use, for the person running it.
const webEnv = {
  ...parseEnv(path.join(root, '.env')),
  ...parseEnv(path.join(root, '.env.production')),
  ...parseEnv(path.join(root, '.env.local')),
}
const shown = (key) => env[key] ?? webEnv[key] ?? '(not set)'
console.log('Desktop build settings:')
for (const key of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_EATERY_DATA_SOURCE', 'NEXT_PUBLIC_REAL_ESTATE_DATA_SOURCE']) {
  console.log(`  ${key} = ${shown(key)}${key in desktopEnv ? '  (desktop.env)' : ''}`)
}
if (shown('NEXT_PUBLIC_API_URL') === '(not set)') {
  console.error('NEXT_PUBLIC_API_URL is not set. Add it to desktop/desktop.env.')
  process.exit(1)
}

console.log('\nBuilding the web app for the desktop…')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npx, ['next', 'build'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
if (result.status !== 0) process.exit(result.status ?? 1)

const standalone = path.join(distDir, 'standalone')
if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error(`No standalone server in ${standalone}. Is output: 'standalone' set for BUILD_TARGET=desktop in next.config.mjs?`)
  process.exit(1)
}

console.log('\nStaging the app in desktop/next-server…')
fs.rmSync(stage, { recursive: true, force: true })
fs.cpSync(standalone, stage, { recursive: true })
// Next leaves the browser files and public/ for the host to serve; the server needs them beside it.
fs.cpSync(path.join(distDir, 'static'), path.join(stage, '.next-desktop', 'static'), { recursive: true })
fs.cpSync(path.join(root, 'public'), path.join(stage, 'public'), { recursive: true })

// Electron starts this instead of server.js. The middleware hands requests back
// to the server at "localhost", which Node would look up as ::1 (IPv6) first,
// but the server only listens on 127.0.0.1 so it isn't reachable from the network.
fs.writeFileSync(path.join(stage, 'desktop-entry.js'), "require('node:dns').setDefaultResultOrder('ipv4first')\nrequire('./server.js')\n")

// For Electron's own calls (checking a business code in setup): the API this build talks to.
fs.writeFileSync(
  path.join(stage, 'desktop-config.json'),
  JSON.stringify({ apiUrl: shown('NEXT_PUBLIC_API_URL').replace(/\/+$/, '') }, null, 2) + '\n'
)

// The web's env files and local data never ship: the server gets its settings from Electron.
for (const name of fs.readdirSync(stage)) {
  if (name.startsWith('.env')) fs.rmSync(path.join(stage, name), { force: true })
}
for (const name of ['.data', 'desktop', 'tests', 'docs']) fs.rmSync(path.join(stage, name), { recursive: true, force: true })

// Check: none of the web's secrets may appear anywhere in what ships.
const secrets = Object.entries(webEnv).filter(([k, v]) => k in BLANKED && k !== 'NEXT_PUBLIC_ROOT_DOMAIN' && v && v.length >= 6)
const leaks = new Set()
const scan = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') scan(p)
      continue
    }
    if (!/\.(js|json|html|rsc|txt|map|mjs|cjs)$/.test(entry.name)) continue
    const text = fs.readFileSync(p, 'utf8')
    for (const [key, value] of secrets) if (text.includes(value)) leaks.add(`${key} in ${path.relative(stage, p)}`)
  }
}
scan(stage)
if (leaks.size) {
  console.error('\nStopped: web secrets found in the desktop build:')
  for (const l of leaks) console.error(`  ${l}`)
  fs.rmSync(stage, { recursive: true, force: true })
  process.exit(1)
}

console.log(`Done. Checked ${secrets.length} web secrets: none are in the build.`)
console.log('Run "npm start" to open it, or "npm run dist" to make the installer.')
