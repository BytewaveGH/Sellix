// Sellix POS for Windows tills.
//
// Runs the web app's own screens from a server on this PC (see server.js), so
// the app opens and moves between screens with no internet. Data still goes
// to the Sellix API, and the app's offline layer keeps sales while it can't.
//
// Each install is set up for one business (business.js), which stands in for
// the subdomain the web app uses. The first start asks for it. Changing it
// later needs an owner of the new business to sign in.

const path = require('node:path')
const { app, BrowserWindow, dialog, shell, session, Menu, ipcMain } = require('electron')
const { startServer, appDir, ORIGIN } = require('./server')
const { readBusiness, saveBusiness, lookUp, ownerApproves } = require('./business')

let server = null
let win = null
let business = null
let quitting = false
let booting = true

// One copy per PC: a second would fight over the port and the stored data.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(boot)
}

const isOurs = (url) => {
  try {
    return new URL(url).origin === ORIGIN
  } catch {
    return false
  }
}

const openOutside = (url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url)
}

const appIcon = () => (app.isPackaged ? undefined : path.join(__dirname, '..', 'src', 'app', 'icon.png'))

function allowDevices() {
  // The POS scanner and the amusement gate use the camera. Grant it to our
  // own screens only; everything else is refused.
  const allowed = new Set(['media', 'clipboard-sanitized-write', 'fullscreen'])
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed.has(permission) && isOurs(details.requestingUrl || wc.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => {
    return allowed.has(permission) && isOurs(origin || wc?.getURL() || '')
  })
}

// ── Business setup ──────────────────────────────────────────────────────────

let setup = null // { win, mode, resolve }

ipcMain.handle('setup:info', (event) => {
  if (!setup || event.sender !== setup.win.webContents) return null
  return { mode: setup.mode, current: business?.name ?? null }
})

ipcMain.handle('setup:cancel', (event) => {
  if (!setup || event.sender !== setup.win.webContents || setup.mode !== 'change') return
  setup.win.close()
})

ipcMain.handle('setup:save', async (event, form) => {
  if (!setup || event.sender !== setup.win.webContents) return { ok: false, message: 'This window is out of date. Close it and try again.' }
  const found = await lookUp(appDir(), form.code)
  if (!found.ok) return found
  if (setup.mode === 'change') {
    if (found.slug === business?.slug) return { ok: false, message: `This till is already set up for ${found.name}.` }
    const approved = await ownerApproves(appDir(), found.slug, form.email, form.password)
    if (!approved.ok) return approved
  }
  const saved = saveBusiness(found)
  const done = setup
  setup = null
  done.resolve(saved)
  done.win.close()
  return { ok: true, name: saved.name }
})

// Shows the setup screen. Resolves to the saved business, or null if closed.
function runSetup(mode) {
  return new Promise((resolve) => {
    const setupWin = new BrowserWindow({
      width: 480,
      height: mode === 'change' ? 640 : 460,
      resizable: false,
      minimizable: mode !== 'change',
      maximizable: false,
      parent: mode === 'change' && win ? win : undefined,
      modal: mode === 'change' && !!win,
      show: false,
      title: mode === 'change' ? 'Change business' : 'Set up this till',
      icon: appIcon(),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'setup-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    })
    setupWin.setMenu(null)
    setupWin.once('ready-to-show', () => setupWin.show())
    setupWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    setupWin.webContents.on('will-navigate', (e) => e.preventDefault())
    setupWin.on('closed', () => {
      if (setup?.win === setupWin) {
        setup = null
        resolve(null)
      }
    })
    setup = { win: setupWin, mode, resolve }
    setupWin.loadFile(path.join(__dirname, 'setup.html'))
  })
}

// ── Main window ─────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Sellix POS',
    backgroundColor: '#ffffff',
    // The menu (Change business…, logs) shows when Alt is pressed.
    autoHideMenuBar: true,
    icon: appIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => win.show())

  // The title always says which business this till is signed in to.
  win.on('page-title-updated', (event) => event.preventDefault())

  // Links to other sites (help pages, the public storefront, payment
  // providers) open in the normal browser, never inside the till.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOurs(url)) return { action: 'allow' }
    openOutside(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isOurs(url) || url.startsWith('file:')) return
    event.preventDefault()
    openOutside(url)
  })

  win.on('closed', () => {
    win = null
  })
  return win
}

// The web app's sign-in pages: /<locale>/staff for staff, /<locale> for owners.
// The till has no address bar, so the menu is how staff reach theirs.
function openSignIn(kind) {
  if (!win || !server) return
  let locale = 'en'
  try {
    if (new URL(win.webContents.getURL()).pathname.startsWith('/fr')) locale = 'fr'
  } catch {
    // keep English
  }
  win.loadURL(`${server.url}/${locale}${kind === 'staff' ? '/staff' : ''}`)
}

function setMenu() {
  const logDir = path.join(app.getPath('userData'), 'logs')
  const menu = Menu.buildFromTemplate([
    {
      label: 'Sellix',
      submenu: [
        { label: `Business: ${business.name} (${business.slug})`, enabled: false },
        { type: 'separator' },
        { label: 'Staff sign-in', accelerator: 'CmdOrCtrl+Shift+S', click: () => openSignIn('staff') },
        { label: 'Owner sign-in', accelerator: 'CmdOrCtrl+Shift+O', click: () => openSignIn('owner') },
        { type: 'separator' },
        { label: 'Change business…', click: () => changeBusiness() },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'F5', click: () => win?.webContents.reload() },
        { label: 'Open log folder', click: () => shell.openPath(logDir) },
        { type: 'separator' },
        { label: 'Quit Sellix POS', role: 'quit' },
      ],
    },
  ])
  win?.setMenu(menu)
}

async function launch() {
  if (!win) createWindow()
  booting = false
  win.setTitle(`Sellix POS · ${business.name}`)
  setMenu()
  await win.loadFile(path.join(__dirname, 'loading.html'))

  let started
  try {
    started = await startServer({ business: business.slug })
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Sellix POS could not start',
      message: 'Sellix POS could not start',
      detail: String(err?.message || err),
    })
    app.quit()
    return
  }
  server = started

  started.onExit((code) => {
    // Expected when quitting or changing business; anything else is a crash.
    if (quitting || server !== started) return
    dialog
      .showMessageBox({
        type: 'error',
        title: 'Sellix POS stopped',
        message: 'The app stopped unexpectedly',
        detail: `Sales already taken are kept on this PC. Open Sellix POS again to continue.\n\nDetails are in ${started.logFile} (code ${code}).`,
      })
      .finally(() => app.quit())
  })

  await win.loadURL(`${started.url}/`)
}

async function changeBusiness() {
  if (setup) return setup.win.focus()
  const next = await runSetup('change')
  if (!next || !win) return

  const old = server
  server = null
  business = next
  await win.loadFile(path.join(__dirname, 'loading.html'))
  await old?.stop()
  // Sign everyone out: a session belongs to the old business. Cached data and
  // unsent sales stay, kept per business, and go up when that business signs in again.
  await session.defaultSession.clearStorageData({ origin: ORIGIN, storages: ['cookies'] })
  await launch()
}

async function boot() {
  Menu.setApplicationMenu(null)
  allowDevices()

  business = readBusiness()
  if (!business) {
    business = await runSetup('first')
    if (!business) return app.quit()
  }
  await launch()
}

app.on('before-quit', () => {
  quitting = true
  server?.stop()
})

app.on('window-all-closed', () => {
  // On first run the setup window closes before the main one opens: boot()
  // decides then (it quits if setup was closed without saving).
  if (booting) return
  app.quit()
})
