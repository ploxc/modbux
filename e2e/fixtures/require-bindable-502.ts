import { readFileSync } from 'fs'

export const PROC_PATH = '/proc/sys/net/ipv4/ip_unprivileged_port_start'
export const MODBUS_PORT = 502

/**
 * Throws when `floor` puts port 502 out of reach.
 *
 * Split from the file read so the decision can be tested without a kernel that
 * actually blocks the port — changing that needs root.
 *
 * `undefined` means the file was missing or unreadable, which points at an
 * unusual kernel rather than a blocked port, so the run continues and the specs
 * speak for themselves.
 */
export function assertBindable(floor: number | undefined): void {
  if (floor === undefined || !Number.isFinite(floor) || floor <= MODBUS_PORT) return

  throw new Error(
    `\nPort ${MODBUS_PORT} is not bindable on this machine.\n\n` +
      `  ${PROC_PATH} is ${floor}, so the server falls back to ${floor} and\n` +
      `  every spec that expects the default Modbus port fails for the wrong reason.\n\n` +
      `Until reboot:\n` +
      `  sudo sysctl net.ipv4.ip_unprivileged_port_start=${MODBUS_PORT}\n\n` +
      `Permanently:\n` +
      `  echo 'net.ipv4.ip_unprivileged_port_start=${MODBUS_PORT}' | sudo tee /etc/sysctl.d/50-unprivileged-ports.conf\n` +
      `  sudo sysctl --system\n\n` +
      `Modbux itself offers to do this from the server view on Linux.\n`
  )
}

export function readFloor(path = PROC_PATH): number | undefined {
  try {
    return Number(readFileSync(path, 'utf8').trim())
  } catch {
    return undefined
  }
}

/**
 * Fail the run up front when the kernel will not let the server bind port 502.
 *
 * Without this the suite still starts, the server quietly walks up to the first
 * bindable port, and the first spec looking for `select-server-502` times out
 * with "element(s) not found" — which points at the UI and says nothing about
 * the machine. The cause is a one-line sysctl, so say so instead.
 *
 * Linux only: macOS and Windows have no such floor.
 */
export default function requireBindable502(): void {
  if (process.platform !== 'linux') return

  try {
    assertBindable(readFloor())
  } catch (error) {
    // Print and exit rather than let the throw escape: Playwright decorates an
    // error from globalSetup with a stack trace and a code frame, which reads
    // as a broken harness instead of a machine that needs one sysctl.
    console.error((error as Error).message)
    process.exit(1)
  }
}
