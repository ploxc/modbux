import { z } from 'zod'
/**
 * Linux privileged port types
 *
 * Modbus defaults to port 502, which sits below the kernel's
 * `net.ipv4.ip_unprivileged_port_start` (1024 out of the box). A non-root
 * process cannot bind it, so the server silently lands on 503 instead — the
 * kind of surprise that turns into a bug report.
 *
 * The command that fixes it lives here rather than in the main process so the
 * modal can show the user the exact string that will run. What is displayed is
 * what is executed.
 */

/** The value the fix writes: the lowest port Modbus needs. */
export const UNPRIVILEGED_PORT_START_TARGET = 502

/** The sysctl key that governs the lowest bindable port. */
export const UNPRIVILEGED_PORT_START_KEY = 'net.ipv4.ip_unprivileged_port_start'

/** Where the persistent variant writes its drop-in. Matches the README. */
export const UNPRIVILEGED_PORT_CONF_PATH = '/etc/sysctl.d/50-unprivileged-ports.conf'

/**
 * `session` lasts until reboot, `persist` also writes a sysctl.d drop-in.
 */
export const PrivilegedPortFixModeSchema = z.enum(['session', 'persist'])
export type PrivilegedPortFixMode = z.infer<typeof PrivilegedPortFixModeSchema>

/** Sandboxes that cut pkexec off from the host system. */
export type PrivilegedPortSandbox = 'flatpak' | 'snap'

export interface PrivilegedPortStatus {
  /** The port that was checked. */
  port: number
  /** False on macOS and Windows, where this restriction does not apply. */
  supported: boolean
  /** Lowest port a non-root process may bind. Undefined when unreadable. */
  unprivilegedPortStart?: number
  /** True when `port` sits below `unprivilegedPortStart` and cannot be bound. */
  needsElevation: boolean
  /** True when pkexec is present and reachable, so the modal can offer a button. */
  canElevate: boolean
  /** Set when running inside a sandbox pkexec cannot escape. */
  sandbox?: PrivilegedPortSandbox
}

/** Why a fix attempt did not go through. */
export type PrivilegedPortFixFailure = 'cancelled' | 'unavailable' | 'failed' | 'unsupported'

export interface PrivilegedPortFixResult {
  ok: boolean
  /** Absent when `ok` is true. */
  reason?: PrivilegedPortFixFailure
  /** Human-readable outcome, safe to drop straight into a snackbar. */
  message: string
  /** The value in effect after the command ran, re-read from the kernel. */
  unprivilegedPortStart?: number
}

/**
 * The argv passed to pkexec for a given mode. Kept as an array so the main
 * process never builds a shell string out of user-influenced input.
 */
export const privilegedPortCommandArgs = (mode: PrivilegedPortFixMode): string[] =>
  mode === 'persist'
    ? [
        'sh',
        '-c',
        `echo ${UNPRIVILEGED_PORT_START_KEY}=${UNPRIVILEGED_PORT_START_TARGET} > ${UNPRIVILEGED_PORT_CONF_PATH} && sysctl --system`
      ]
    : ['sysctl', `${UNPRIVILEGED_PORT_START_KEY}=${UNPRIVILEGED_PORT_START_TARGET}`]

/**
 * The same command rendered for display. Shown verbatim in the modal so the
 * user can read — or copy and run by hand — exactly what Modbux would do.
 */
export const privilegedPortCommandDisplay = (mode: PrivilegedPortFixMode): string =>
  [
    'pkexec',
    ...privilegedPortCommandArgs(mode).map((arg) => (arg.includes(' ') ? `'${arg}'` : arg))
  ].join(' ')
