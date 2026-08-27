import { existsSync } from 'fs'
import { delimiter, join } from 'path'

/**
 * Where to find socat, which the RTU specs spawn for a virtual serial pair.
 *
 * Homebrew installs into /usr/local on Intel and /opt/homebrew on Apple
 * Silicon. A fixed pair of paths therefore found socat on one Mac and not on
 * the other: the arm runner skipped every serial spec while the Intel one ran
 * them, from the same commit, and both reported green.
 *
 * PATH is searched as well. A machine that keeps socat elsewhere then counts
 * too, and `command -v socat` answers the same question these specs ask —
 * which is what a CI step needs before it can claim the serial specs ran.
 */
const KNOWN_DIRS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin']

const resolved = [...KNOWN_DIRS, ...(process.env.PATH ?? '').split(delimiter).filter(Boolean)]
  .map((dir) => join(dir, 'socat'))
  .find(existsSync)

export const hasSocat = resolved !== undefined

/** Falls back to the bare name, which only matters when hasSocat is false. */
export const SOCAT_PATH = resolved ?? 'socat'
