// After `electron-builder`, copies the finished installer to this PC's Desktop,
// ready to share. electron-builder's working files stay in desktop/dist.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
const name = `${pkg.build.productName} Setup ${pkg.version}.exe`
const built = path.join(desktopDir, 'dist', name)

if (!fs.existsSync(built)) {
  console.error(`No installer at ${built}. Did electron-builder finish?`)
  process.exit(1)
}

// Ask Windows: the Desktop moves when OneDrive backs it up.
const desktopFolder = () => {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], {
      encoding: 'utf8',
    }).trim()
    if (out && fs.existsSync(out)) return out
  } catch {
    // fall back below
  }
  return path.join(os.homedir(), 'Desktop')
}

const target = path.join(desktopFolder(), name)
fs.copyFileSync(built, target)
console.log(`\nInstaller ready to share: ${target}`)
