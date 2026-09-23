import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
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

const MAC_ARM64 = 'dist/mac-arm64/Modbux.app/Contents/MacOS/Modbux'
const MAC_X64 = 'dist/mac/Modbux.app/Contents/MacOS/Modbux'

/**
 * Linux output directory for the host architecture. electron-builder names the
 * default arch `linux-unpacked` and every other one after itself, so an arm64
 * build lands in `linux-arm64-unpacked`. Only x64 and arm64 have been seen.
 */
function linuxUnpackedDir(): string {
  return process.arch === 'x64' ? 'dist/linux-unpacked' : `dist/linux-${process.arch}-unpacked`
}

/**
 * Candidate binaries per platform, as produced by `electron-builder --dir`.
 *
 * macOS needs the host architecture taken into account. `--mac` builds both
 * arches, so both directories can sit in dist/ at once, and an arm64 binary
 * cannot run on an Intel Mac at all — spawn fails with EBADARCH (errno -86),
 * which surfaces as an unexplained "Unknown system error -86". Rosetta makes
 * the reverse work, so arm64 keeps the x64 build as a fallback while Intel
 * does not list arm64 at all.
 *
 * Linux takes it into account too, but has no fallback: nothing translates
 * between the two there.
 */
function packagedCandidates(): string[] {
  if (process.platform === 'win32') return ['dist/win-unpacked/Modbux.exe']
  if (process.platform === 'linux') {
    const dir = linuxUnpackedDir()
    return [`${dir}/modbux`, `${dir}/Modbux`]
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? [MAC_ARM64, MAC_X64] : [MAC_X64]
  }
  return []
}

function packagedBinary(): string {
  const candidates = packagedCandidates()
  const found = candidates.map((c) => join(ROOT, c)).find(existsSync)

  if (!found) {
    throw new Error(
      `No packaged app found for ${process.platform}/${process.arch}. Looked for:\n` +
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
 * A profile no other launch shares, for a spec that runs two apps against each
 * other. The single instance lock is taken per profile, so two launches sharing
 * one is what makes the second lose it, and a spec that wants that has to keep
 * the worker's app out of the race.
 */
export function ownProfileDir(): string {
  return mkdtempSync(join(tmpdir(), 'modbux-e2e-own-'))
}

/**
 * Launch options for every `electron.launch()` call in the suite, so dev and
 * packaged runs stay in sync.
 *
 * `userDataDir` names the profile explicitly, for a spec that launches more
 * than one app and decides itself which of them share state and a lock.
 */
export function launchOptions(userDataDir?: string): LaunchOptions {
  // Packaged runs always get their own profile. Dev runs use the default one
  // (matching how the suite has always run) unless asked to isolate — set
  // E2E_ISOLATED_PROFILE=1 to check whether a spec depends on state left on
  // this machine by earlier runs rather than on state it sets up itself.
  const isolate = isPackaged || process.env.E2E_ISOLATED_PROFILE === '1'
  const profile = userDataDir ?? (isolate ? isolatedUserDataDir() : undefined)
  const args = profile ? [`--user-data-dir=${profile}`] : []

  // ELECTRON_ENABLE_LOGGING sends Chromium's own logging to stderr, which the
  // fixture keeps: without it the app says nothing on its way out.
  const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }

  if (!isPackaged) return { args: [join(ROOT, 'out/main/index.js'), ...args], env }

  return { executablePath: packagedBinary(), args, env }
}

/**
 * Launches the app with reduced motion emulated in every window it has and
 * every window it opens. The theme follows that setting, so MUI's transitions
 * and a click's ripple end at once rather than on timers the fixture's CSS does
 * not reach.
 */
export async function launchElectron(userDataDir?: string): Promise<ElectronApplication> {
  const app = await electron.launch(launchOptions(userDataDir))
  const reduceMotion = (page: Page): Promise<void> => page.emulateMedia({ reducedMotion: 'reduce' })
  app.on('window', (page) => {
    // A window closed before the emulation reached it has no motion left.
    reduceMotion(page).catch(() => undefined)
  })
  await Promise.all(app.windows().map(reduceMotion))
  return app
}

/**
 * Runs an `app.evaluate` call again when main's inspector drops its answer.
 *
 * Node's inspector can collect the promise Playwright awaits before it settles
 * and answers `Promise was collected`, which Playwright reports as "Execution
 * context was destroyed, most likely because of a navigation" although main is
 * running (microsoft/playwright#33737). The function may already have run,
 * so every call passed here has to be safe to run twice. The drops come in
 * runs, so a retry waits before it asks again.
 */
export async function evaluateMain<R>(evaluate: () => Promise<R>): Promise<R> {
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      return await evaluate()
    } catch (error) {
      const dropped =
        error instanceof Error && error.message.includes('Execution context was destroyed')
      if (!dropped || Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
