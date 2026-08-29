/**
 * Linux serial group types
 *
 * A serial port on Linux belongs to a group, `dialout` on Debian and its
 * descendants, and a user outside that group opens nothing. The port is still
 * listed -- udev enumerates it without touching the device -- so nothing looks
 * wrong until the connection is refused.
 *
 * Which group is not assumed. It is read off the device that refuses, because
 * a distribution is free to name it something else and a hardcoded `dialout`
 * would then say nothing at all on the machines that need it most.
 *
 * The command that fixes it lives here rather than in the main process, so the
 * modal can show the exact string that will run. What is displayed is what is
 * executed.
 *
 * Mint and Ubuntu put the first user in the group at install time, so most
 * people never meet any of this. Debian, Arch and Fedora do not, and neither
 * does a second account on any of them.
 */

/**
 * The group a serial device belongs to on Debian and its descendants. Used as
 * the fallback for what to say when no device is there to ask.
 */
export const SERIAL_GROUP = 'dialout'

/** Where the group file lives. World-readable, so looking costs nothing. */
export const GROUP_FILE_PATH = '/etc/group'

export interface SerialGroupStatus {
  /** The group the refusing device belongs to, or the fallback when none does. */
  group: string
  /** False on macOS and Windows, where this restriction does not apply. */
  supported: boolean
  /** The user the check ran for. */
  username?: string
  /** True when the group exists and the user is not in it. */
  needsMembership: boolean
  /**
   * True when the group file lists the user but this session does not have it
   * yet. Membership arrives at the next login, so the answer is to log out
   * rather than to run anything.
   */
  pendingLogin: boolean
  /** True when pkexec is present, so the modal can offer a button. */
  canElevate: boolean
  /** Set when running inside a sandbox pkexec cannot escape. */
  sandbox?: 'flatpak' | 'snap'
}

/** Why an attempt did not go through. */
export type SerialGroupFixFailure = 'cancelled' | 'unavailable' | 'failed' | 'unsupported'

export interface SerialGroupFixResult {
  ok: boolean
  /** Absent when `ok` is true. */
  reason?: SerialGroupFixFailure
  /** Human-readable outcome, safe to drop straight into a snackbar. */
  message: string
}

/**
 * The argv passed to pkexec. An array, so the main process never builds a
 * shell string out of a username.
 */
export const serialGroupCommandArgs = (username: string, group = SERIAL_GROUP): string[] => [
  'usermod',
  '-aG',
  group,
  username
]

/** The same command rendered for display, and for copying into a terminal. */
export const serialGroupCommandDisplay = (username: string, group = SERIAL_GROUP): string =>
  ['pkexec', ...serialGroupCommandArgs(username, group)].join(' ')
