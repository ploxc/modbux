import { execFile, ExecFileException } from 'child_process'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import {
  PrivilegedPortFixMode,
  PrivilegedPortFixResult,
  PrivilegedPortSandbox,
  PrivilegedPortStatus,
  privilegedPortCommandArgs
} from '@shared'

/**
 * Linux privileged port helper
 *
 * Reads the kernel's lowest bindable port and, when the user asks for it, runs
 * the sysctl that lowers it. Detection is proactive: the value lives in /proc
 * and is world-readable, so we know a bind will fail before it does. Waiting
 * for EACCES would mean the user has already seen the server land on the wrong
 * port, which is the confusing part we are trying to avoid.
 *
 * Elevation goes through pkexec, not sudo. sudo needs a TTY that an Electron
 * app does not have; pkexec hands the request to PolicyKit, which puts a
 * graphical password prompt on screen.
 *
 * Nothing here throws. Failures come back as a result object so the caller can
 * put the reason in front of the user.
 */

/** World-readable, so no elevation is needed just to look. */
export const UNPRIVILEGED_PORT_START_PATH = '/proc/sys/net/ipv4/ip_unprivileged_port_start'

const PKEXEC_PATHS = ['/usr/bin/pkexec', '/usr/local/bin/pkexec']

/** pkexec exits 126 when the dialog is dismissed, 127 when auth fails. */
const PKEXEC_DISMISSED = 126
const PKEXEC_NOT_AUTHORIZED = 127

/** Give up rather than leave a prompt hanging forever. */
const PKEXEC_TIMEOUT_MS = 120_000

/**
 * Reads the lowest port a non-root process may bind. Undefined when the file
 * is missing or unparseable — an older kernel, or simply not Linux.
 */
export const readUnprivilegedPortStart = async (): Promise<number | undefined> => {
  if (process.platform !== 'linux') return undefined
  try {
    const raw = await readFile(UNPRIVILEGED_PORT_START_PATH, 'utf8')
    const value = Number.parseInt(raw.trim(), 10)
    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Flatpak and Snap confine the app away from the host's PolicyKit, so pkexec
 * would fail no matter what. Better to say so than to offer a dead button.
 */
export const detectSandbox = (): PrivilegedPortSandbox | undefined => {
  if (process.env.FLATPAK_ID) return 'flatpak'
  if (process.env.SNAP) return 'snap'
  return undefined
}

/** The pkexec binary, if one is installed. */
export const findPkexec = (): string | undefined => PKEXEC_PATHS.find((path) => existsSync(path))

/**
 * Reports whether the given port can be bound, and whether Modbux is in a
 * position to do anything about it.
 */
export const getPrivilegedPortStatus = async (port: number): Promise<PrivilegedPortStatus> => {
  if (process.platform !== 'linux') {
    return { port, supported: false, needsElevation: false, canElevate: false }
  }

  const unprivilegedPortStart = await readUnprivilegedPortStart()
  const sandbox = detectSandbox()

  // Unknown kernel value: assume the port is fine rather than nag on a guess.
  const needsElevation =
    unprivilegedPortStart !== undefined && port > 0 && port < unprivilegedPortStart

  return {
    port,
    supported: true,
    unprivilegedPortStart,
    needsElevation,
    canElevate: !sandbox && findPkexec() !== undefined,
    ...(sandbox ? { sandbox } : {})
  }
}

/**
 * Runs the pkexec command for the given mode and reports what happened.
 * Resolves rather than rejects on every path.
 */
export const applyPrivilegedPortFix = async (
  mode: PrivilegedPortFixMode
): Promise<PrivilegedPortFixResult> => {
  if (process.platform !== 'linux') {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Privileged ports only need this on Linux'
    }
  }

  const sandbox = detectSandbox()
  if (sandbox) {
    return {
      ok: false,
      reason: 'unavailable',
      message: `Modbux runs inside ${sandbox === 'flatpak' ? 'Flatpak' : 'Snap'}, which blocks it from changing system settings. Run the command in a terminal instead.`
    }
  }

  const pkexec = findPkexec()
  if (!pkexec) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'pkexec was not found. Run the command in a terminal instead.'
    }
  }

  const exitCode = await new Promise<number>((resolve) => {
    execFile(
      pkexec,
      privilegedPortCommandArgs(mode),
      { timeout: PKEXEC_TIMEOUT_MS },
      (error: ExecFileException | null) => {
        if (!error) return resolve(0)
        resolve(typeof error.code === 'number' ? error.code : -1)
      }
    )
  })

  if (exitCode === PKEXEC_DISMISSED || exitCode === PKEXEC_NOT_AUTHORIZED) {
    return {
      ok: false,
      reason: 'cancelled',
      message: 'Authorization was cancelled. Nothing has changed.'
    }
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      reason: 'failed',
      message: `The command exited with code ${exitCode}. Run it in a terminal to see why.`
    }
  }

  // Trust the kernel over the exit code: re-read what is actually in effect.
  const unprivilegedPortStart = await readUnprivilegedPortStart()

  return {
    ok: true,
    message:
      mode === 'persist'
        ? 'Port 502 is available now and will stay available after a reboot.'
        : 'Port 502 is available now, until the next reboot.',
    unprivilegedPortStart
  }
}
