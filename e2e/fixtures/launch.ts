import { _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

type LaunchOptions = Parameters<typeof electron.launch>[0]

const ROOT = resolve(__dirname, '../..')

/**
 * Two ways to run the same specs:
 *
 *   dev (default)  — Electron from node_modules + the electron-vite output in
 *                    out/. Dependencies resolve from the repo's node_modules.
 *   packaged       — the binary electron-builder produced in dist/. Only what
 *                    ships in app.asar is available.
 *
 * The difference matters: `externalizeDepsPlugin()` externalizes whatever sits
 * in `dependencies`, and electron-builder packs only those into the asar. A
 * runtime dependency that drifts into devDependencies still resolves in dev
 * mode and breaks only once installed — packaged mode is what catches it.
 */
const isPackaged = process.env.E2E_TARGET === 'packaged'

/** Candidate binaries per platform, as produced by `electron-builder --dir`. */
const PACKAGED_BINARIES: Record<string, string[]> = {
  win32: ['dist/win-unpacked/Modbux.exe'],
  darwin: [
    'dist/mac-arm64/Modbux.app/Contents/MacOS/Modbux',
    'dist/mac/Modbux.app/Contents/MacOS/Modbux'
  ],
  linux: ['dist/linux-unpacked/modbux', 'dist/linux-unpacked/Modbux']
}

function packagedBinary(): string {
  const candidates = PACKAGED_BINARIES[process.platform] ?? []
  const found = candidates.map((c) => join(ROOT, c)).find(existsSync)

  if (!found) {
    throw new Error(
      `No packaged app found for platform "${process.platform}". Looked for:\n` +
        candidates.map((c) => `  ${c}`).join('\n') +
        '\n\nBuild one first with: yarn build:unpack'
    )
  }

  return found
}

/**
 * Isolated profile for packaged runs, created once per worker process and
 * reused across relaunches — the persistence specs close and reopen the app
 * and need their state to survive that.
 *
 * Without this the packaged app would write to the real userData directory
 * (%APPDATA%/Modbux, ~/Library/Application Support/Modbux), so a test run
 * would clobber the config of an actually installed Modbux — and the fixtures
 * call clearStorageData() on startup, which would wipe it.
 */
let userDataDir: string | undefined

function isolatedUserDataDir(): string {
  if (!userDataDir) userDataDir = mkdtempSync(join(tmpdir(), 'modbux-e2e-'))
  return userDataDir
}

/**
 * Launch options for every `electron.launch()` call in the suite, so dev and
 * packaged runs stay in sync.
 */
export function launchOptions(): LaunchOptions {
  // Packaged runs always get their own profile. Dev runs use the default one
  // (matching how the suite has always run) unless asked to isolate — set
  // E2E_ISOLATED_PROFILE=1 to check whether a spec depends on state left on
  // this machine by earlier runs rather than on state it sets up itself.
  const isolate = isPackaged || process.env.E2E_ISOLATED_PROFILE === '1'
  const args = isolate ? [`--user-data-dir=${isolatedUserDataDir()}`] : []

  if (!isPackaged) return { args: [join(ROOT, 'out/main/index.js'), ...args] }

  return { executablePath: packagedBinary(), args }
}
