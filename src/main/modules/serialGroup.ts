import { execFile, ExecFileException } from 'child_process'
import { constants } from 'fs'
import { access, readdir, readFile } from 'fs/promises'
import { userInfo } from 'os'
import { join } from 'path'
import {
  GROUP_FILE_PATH,
  SERIAL_GROUP,
  SerialGroupFixResult,
  SerialGroupStatus,
  serialGroupCommandArgs
} from '@shared'
import { detectSandbox, findPkexec } from './privilegedPort'

/**
 * Linux serial group helper
 *
 * A serial device belongs to a group, and a user outside it cannot open one.
 * The app then lists no ports, which looks like missing hardware rather than
 * missing permission.
 *
 * Detection asks about the devices rather than about the group. A port that
 * opens needs nothing said about it, whatever the group file holds, and the
 * suite makes the point: socat hands out ptys the user owns, so RTU works
 * there with nobody in dialout at all.
 *
 * The group is what the message is about, not what the check is. /etc/group is
 * world-readable and is compared with the groups this process actually has.
 * Those two disagree in a way worth telling apart: `usermod` writes the file
 * immediately, while a session keeps the groups it was given at login. Listed
 * but not held means the fix has run and the answer is to log out.
 *
 * Elevation goes through pkexec for the same reason as the port floor: sudo
 * needs a TTY that an Electron app does not have.
 *
 * Nothing here throws. Failures come back as a result the caller can put in
 * front of the user.
 */

/** Give up rather than leave a prompt hanging forever. */
const PKEXEC_TIMEOUT_MS = 120_000

/** pkexec exits 126 when the dialog is dismissed, 127 when auth fails. */
const PKEXEC_DISMISSED = 126
const PKEXEC_NOT_AUTHORIZED = 127

/**
 * The desktop sessions that can log a user out, each of which asks the user
 * first. Ordered by what Modbux is most likely to meet.
 */
const LOGOUT_COMMANDS: Array<[string, string[]]> = [
  ['cinnamon-session-quit', ['--logout']],
  ['gnome-session-quit', ['--logout']],
  ['mate-session-save', ['--logout-dialog']],
  ['xfce4-session-logout', ['--logout']]
]

/** Where the kernel puts serial devices, and the prefixes they carry. */
const DEV_DIR = '/dev'
const SERIAL_PREFIXES = ['ttyUSB', 'ttyACM', 'ttyS', 'ttyAMA']

/**
 * Serial devices that exist but cannot be opened.
 *
 * A device node outside your groups is still visible: 0660 root:dialout lists
 * fine and opens not at all. That difference is the whole signal. No devices
 * means nothing to advise about, and one that opens means the group is beside
 * the point.
 */
export const findUnreadablePorts = async (): Promise<string[]> => {
  let entries: string[]
  try {
    entries = await readdir(DEV_DIR)
  } catch {
    return []
  }

  const ports = entries.filter((name) => SERIAL_PREFIXES.some((prefix) => name.startsWith(prefix)))
  const unreadable: string[] = []

  for (const port of ports) {
    try {
      await access(join(DEV_DIR, port), constants.R_OK | constants.W_OK)
    } catch {
      unreadable.push(port)
    }
  }
  return unreadable
}

interface GroupEntry {
  gid: number
  members: string[]
}

/** Reads one group out of /etc/group. Undefined when it is not there. */
export const readGroupEntry = async (group: string): Promise<GroupEntry | undefined> => {
  try {
    const file = await readFile(GROUP_FILE_PATH, 'utf8')
    for (const line of file.split('\n')) {
      const [name, , gid, members] = line.split(':')
      if (name !== group) continue
      return {
        gid: Number.parseInt(gid, 10),
        members: (members ?? '').split(',').filter(Boolean)
      }
    }
  } catch {
    // Unreadable or not Linux. The caller treats that as nothing to report.
  }
  return undefined
}

/**
 * Reports whether this user can open a serial port, and whether Modbux is in a
 * position to do anything about it.
 */
export const getSerialGroupStatus = async (): Promise<SerialGroupStatus> => {
  if (process.platform !== 'linux') {
    return {
      group: SERIAL_GROUP,
      supported: false,
      needsMembership: false,
      pendingLogin: false,
      canElevate: false
    }
  }

  const username = userInfo().username
  const entry = await readGroupEntry(SERIAL_GROUP)
  const sandbox = detectSandbox()

  // No such group: a distribution that names it something else, or a system
  // with no serial devices at all. Either way there is nothing to advise.
  if (!entry) {
    return {
      group: SERIAL_GROUP,
      supported: true,
      username,
      needsMembership: false,
      pendingLogin: false,
      canElevate: false
    }
  }

  const heldNow = process.getgroups?.().includes(entry.gid) ?? false
  const listed = entry.members.includes(username)

  // Say nothing until a device actually refuses to open. Ports the user owns,
  // a pty from socat among them, make the group irrelevant.
  const blocked = heldNow ? [] : await findUnreadablePorts()

  return {
    group: SERIAL_GROUP,
    supported: true,
    username,
    needsMembership: blocked.length > 0 && !listed,
    pendingLogin: blocked.length > 0 && listed,
    canElevate: !sandbox && findPkexec() !== undefined,
    ...(sandbox ? { sandbox } : {})
  }
}

/** Runs a command and resolves with its exit code, never rejecting. */
const run = (command: string, args: string[]): Promise<number> =>
  new Promise((resolve) => {
    execFile(command, args, { timeout: PKEXEC_TIMEOUT_MS }, (error: ExecFileException | null) => {
      if (!error) return resolve(0)
      resolve(typeof error.code === 'number' ? error.code : -1)
    })
  })

/**
 * Adds the user to the group through pkexec and reports what happened. The
 * group takes effect at the next login, which is what the caller has to say
 * next.
 */
export const applySerialGroupFix = async (): Promise<SerialGroupFixResult> => {
  if (process.platform !== 'linux') {
    return { ok: false, reason: 'unsupported', message: 'Serial groups are a Linux thing' }
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

  const exitCode = await run(pkexec, serialGroupCommandArgs(userInfo().username))

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

  // Trust the file over the exit code: read back what it now says.
  const entry = await readGroupEntry(SERIAL_GROUP)
  if (!entry?.members.includes(userInfo().username)) {
    return {
      ok: false,
      reason: 'failed',
      message: `${SERIAL_GROUP} still does not list you. Run the command in a terminal to see why.`
    }
  }

  return {
    ok: true,
    message: `You are in ${SERIAL_GROUP} now. Log out and back in for it to take effect.`
  }
}

/**
 * Asks the desktop session to log the user out. Every command here puts the
 * session's own confirmation on screen first, so this suggests rather than
 * decides. False when no session manager answered, and then the user does it
 * themselves.
 */
export const requestLogout = async (): Promise<boolean> => {
  if (process.platform !== 'linux') return false

  for (const [command, args] of LOGOUT_COMMANDS) {
    const exitCode = await run(command, args)
    // -1 is the command not being there at all; anything else means it ran.
    if (exitCode !== -1) return true
  }
  return false
}
