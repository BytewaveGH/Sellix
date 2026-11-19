// Opens the desktop app from source (after `npm run build:web`).
//
// VS Code's terminals set ELECTRON_RUN_AS_NODE, which makes Electron run as
// plain Node with no window. A NODE_ENV left over from the web setup doesn't
// belong here either. Both are cleared before starting.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron') // the path to electron.exe
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_ENV

const child = spawn(electron, [desktopDir], { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
