// Starts the bundled Next.js server (desktop/next-server, made by `npm run build:web`)
// and reports when it answers. Runs in the Electron main process; the server
// itself runs in its own utility process so a crash there can't take the
// window down.

const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { app, utilityProcess } = require('electron')

// Fixed for good: the browser keeps each till's cached catalogue and unsent
// sales under this exact address, and the backend allows this origin (CORS).
// Changing it loses that data on every till.
const HOST = '127.0.0.1'
const PORT = 3210
const ORIGIN = `http://localhost:${PORT}`

// Packaged: <install>/resources/next-server. From source: desktop/next-server.
const appDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'next-server') : path.join(__dirname, 'next-server'))

// This install's own secret for signing sessions, made on first run and kept
// in the user's app data. Never the web app's secret.
const authSecret = () => {
  const file = path.join(app.getPath('userData'), 'auth-secret')
  try {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (existing.length >= 32) return existing
  } catch {
    // first run
  }
  const secret = crypto.randomBytes(48).toString('base64url')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

const portIsFree = () =>
  new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(PORT, HOST)
  })

const answers = () =>
  new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 2000 }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(false))
  })

const waitUntilUp = async (child, timeoutMs) => {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (child.exited) throw new Error(`The local server stopped while starting (exit code ${child.exitCode}).`)
    if (await answers()) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`The local server did not start within ${Math.round(timeoutMs / 1000)} seconds.`)
}

// Returns { url, stop }. Throws with a message fit to show staff.
async function startServer({ business }) {
  // desktop-entry.js (written by build-web.mjs) sets up DNS, then loads Next's server.js.
  const serverFile = path.join(appDir(), 'desktop-entry.js')
  if (!fs.existsSync(serverFile)) {
    throw new Error(`The app's server is missing (${serverFile}). Run "npm run build:web" in the desktop folder.`)
  }
  if (!(await portIsFree())) {
    throw new Error(
      `Port ${PORT} is already in use. Sellix may already be open, or another program is using it. Close it and try again.`
    )
  }

  const logDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const log = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' })
  log.write(`\n--- ${new Date().toISOString()} starting ${app.getVersion()} for ${business} ---\n`)

  const secret = authSecret()
  const child = utilityProcess.fork(serverFile, [], {
    cwd: appDir(),
    stdio: 'pipe',
    serviceName: 'Sellix server',
    env: {
      // Only what the server needs: nothing inherited from the till's own environment.
      NODE_ENV: 'production',
      PORT: String(PORT),
      // "localhost", not 127.0.0.1: Next only treats a middleware rewrite as its own
      // when the address matches, otherwise it proxies to itself in a loop.
      // desktop-entry.js makes "localhost" resolve to 127.0.0.1, so it still listens
      // only on this PC.
      HOSTNAME: 'localhost',
      NEXT_TELEMETRY_DISABLED: '1',
      // NextAuth: sign sessions with this install's secret and trust the local address.
      BETTER_AUTH_SECRET: secret,
      AUTH_SECRET: secret,
      AUTH_URL: ORIGIN,
      AUTH_TRUST_HOST: 'true',
      // The business this till is set up for (business.js): stands in for the subdomain.
      SELLIX_DESKTOP_BUSINESS: business,
      // Billing and super-admin are web-only; these stay unset on purpose.
      BILLING_STORE: 'api',
      SYSTEMROOT: process.env.SYSTEMROOT || '',
      TEMP: process.env.TEMP || '',
      TMP: process.env.TMP || '',
    },
  })
  child.exited = false
  child.stdout?.on('data', (d) => log.write(d))
  child.stderr?.on('data', (d) => log.write(d))
  child.on('exit', (code) => {
    child.exited = true
    child.exitCode = code
    log.write(`--- server exited with code ${code} ---\n`)
  })

  await waitUntilUp(child, 60_000)

  return {
    url: ORIGIN,
    origin: ORIGIN,
    // Resolves once the process has gone, so the port is free to start again.
    stop: () =>
      new Promise((resolve) => {
        if (child.exited) return resolve()
        child.once('exit', () => resolve())
        child.kill()
      }),
    onExit: (fn) => child.on('exit', fn),
    logFile: path.join(logDir, 'server.log'),
  }
}

module.exports = { startServer, appDir, ORIGIN, PORT }
