import { accessSync, constants, readdirSync } from 'fs'
import { join, posix } from 'path'

export const DEV_DIR = '/dev'
export const SERIAL_PREFIXES = ['ttyUSB', 'ttyACM']
export const SERIAL_GROUP = 'dialout'

/**
 * Throws when an adapter is plugged in that this user cannot open.
 *
 * Split from the directory read so the decision can be tested without an
 * adapter and without leaving the group, neither of which a test can arrange.
 *
 * An empty list is the normal case twice over: no adapter at all, which is CI,
 * and an adapter that opens, which is a developer machine in the group.
 */
export function assertOpenable(unreadable: string[]): void {
  if (unreadable.length === 0) return

  // posix.join, not join: this path is quoted to the reader as a Linux device,
  // so it keeps its separators on a Windows machine running the unit tests.
  const paths = unreadable.map((p) => posix.join(DEV_DIR, p))
  const subject =
    paths.length === 1 ? `${paths[0]} exists but is` : `${paths.join(', ')} exist but are`

  throw new Error(
    `\nSerial ports on this machine will not open for ${process.env.USER ?? 'you'}.\n\n` +
      `  ${subject} refused, so selecting RTU raises the ${SERIAL_GROUP}\n` +
      `  modal and it covers the client config. Every spec that clicks through RTU\n` +
      `  then fails on a modal rather than on anything it meant to test.\n\n` +
      `Unplug the adapter and run again. The suite does not need one -- socat\n` +
      `hands out ptys you already own.\n\n` +
      `Joining the group fixes it for good, but not for this run: a session keeps\n` +
      `the groups it got at login, so it takes a logout, and that ends the run too.\n` +
      `  sudo gpasswd -a $USER ${SERIAL_GROUP}\n\n` +
      `Modbux itself offers to do this from the client view on Linux.\n`
  )
}

/** Serial devices that exist and refuse to open. Mirrors findUnreadablePorts. */
export function unreadablePorts(dir = DEV_DIR): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  return entries
    .filter((name) => SERIAL_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .filter((name) => {
      try {
        accessSync(join(dir, name), constants.R_OK | constants.W_OK)
        return false
      } catch {
        return true
      }
    })
}

/**
 * Fail the run up front when a plugged-in adapter will not open.
 *
 * Without this the suite starts, the serial group modal opens the moment a spec
 * selects RTU, and the next click times out with "subtree intercepts pointer
 * events" -- which reads as a broken selector and says nothing about the
 * machine. The cause is a group membership, so say so instead.
 *
 * Linux only: this is the only platform that gates the device on a group.
 */
export default function requireOpenablePorts(): void {
  if (process.platform !== 'linux') return

  try {
    assertOpenable(unreadablePorts())
  } catch (error) {
    // Print and exit rather than let the throw escape: Playwright decorates an
    // error from globalSetup with a stack trace and a code frame, which reads
    // as a broken harness instead of a machine that needs one command.
    console.error((error as Error).message)
    process.exit(1)
  }
}
