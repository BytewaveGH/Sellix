# Sellix POS for Windows

A separate desktop build of the web app. It runs the same screens from a server on the
till itself, so the app opens and moves between screens with no internet. Data still
goes to the Sellix API, and the app's offline layer keeps sales until it can send them.

The web app is unaffected: only a build with `BUILD_TARGET=desktop` changes anything
(see `next.config.mjs`), and it writes to `.next-desktop`, never `.next`.

## Build

From this folder:

```sh
npm install --include=dev   # once; --include=dev because NODE_ENV=production skips Electron
npm run build:web           # builds the web app for the desktop into next-server/
npm start                   # opens it from source
npm run dist                # build:web + the installer in dist/
```

`npm run dist` copies the finished installer, `Sellix POS Setup <version>.exe`, to your
Windows Desktop, ready to share. electron-builder's working files stay in `dist/`. The
version comes from `package.json`.

## Settings

`npm run build:web` uses the web app's `.env` files, except:

- `desktop.env` (copy `desktop.env.example`) overrides them, for example a different
  `NEXT_PUBLIC_API_URL`.
- Secrets and web-only settings are always blanked: `PLATFORM_KEY`, `SUPER_ADMIN_*`,
  auth secrets, `NEXT_PUBLIC_ROOT_DOMAIN`. The build then scans what it produced for the
  web's secret values and stops if it finds any.

Each install makes its own auth secret on first run, in `%APPDATA%\Sellix POS\auth-secret`.

## One business per till

On the web, the subdomain says which business you sign in to (`belkis.…`). The desktop
runs on `localhost`, so each install is set up for one business instead:

- **First start** asks for the business code (the first part of the web address). It is
  checked with the API's public tenant lookup, so this needs internet once.
- The code is kept in `%APPDATA%\Sellix POS\business.json`. Electron passes it to the
  local server as `SELLIX_DESKTOP_BUSINESS`, and every owner and staff login goes to that
  business, exactly as on its subdomain (`hostTenantSlug` in `src/lib/tenant.ts`).
- The window title shows it: "Sellix POS · Belkis".
- **To change it**, press Alt, then Sellix → Change business…. An owner of the new
  business signs in to approve (the API checks the password and nothing is kept).
  Everyone is signed out and the app restarts. Cached data and unsent sales stay on the
  PC, kept per business, and go up when that business signs in again.
- To start over on a test PC, delete `business.json` and reopen the app.

## Signing in

The till has no address bar, and the app opens on the owner sign-in page. Staff use the
menu: press **Alt → Sellix → Staff sign-in**, or **Ctrl+Shift+S**. **Owner sign-in**
(Ctrl+Shift+O) goes back. Both sign in to the till's business.

## How it runs

- `main.js` opens the window and keeps it to our own screens. Other links open in the
  normal browser, and the camera is allowed for our screens only.
- `server.js` starts Next's server in a separate process at `http://localhost:3210`,
  listening on 127.0.0.1 only, and logs to `%APPDATA%\Sellix POS\logs\server.log`.
- **Never change port 3210.** The browser keeps each till's catalogue and unsent sales
  under that exact address, and the backend allows that origin (CORS).

## Known gaps

- The installer is not code-signed yet, so Windows shows an "unknown publisher" warning.
- No auto-update yet. A new version is installed by running the new installer.
- Receipts print through the print dialog; silent printing is not built yet.
- The camera scanner's on-device text recognition (Tesseract) downloads its files online
  unless `NEXT_PUBLIC_SCANNER_ON_DEVICE_OCR_ASSETS_URL` points at bundled copies. USB
  barcode scanners type like a keyboard and work offline.

## Troubleshooting

- **No window, "Cannot read properties of undefined (reading 'requestSingleInstanceLock')":**
  `ELECTRON_RUN_AS_NODE` is set (VS Code's terminals set it). Use `npm start`, which clears it.
- **`npm run dist` fails with "Cannot create symbolic link":** electron-builder's signing tools
  include macOS links that Windows only creates with Developer Mode on. Turn on Developer Mode
  (Settings → System → For developers), or unpack the tools by hand once:
  `node_modules/7zip-bin/win/x64/7za.exe x <cache>/winCodeSign/<n>.7z -o<cache>/winCodeSign/winCodeSign-2.6.0`,
  where `<cache>` is `%LOCALAPPDATA%\electron-builder\Cache`.
- **"Port 3210 is already in use":** Sellix POS is already open, or another program took the port.
