/**
 * The once-per-session rule the reminder hooks share.
 *
 * A hook that says the same thing on every tool call becomes wallpaper, so each
 * states its rule on the first firing and asks a short question after that. The
 * marker is an empty file in the temp directory, named after the session.
 */

import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A day is too short: a session left open over a weekend would lose its marker
 * and fire twice. A week is longer than any session and still cleans up.
 */
const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Where one hook's claim for one session is recorded.
 *
 * Path-safe: a session id is a UUID today, and a `/` in one would otherwise
 * write the marker somewhere else or fail silently.
 */
function markerPath(hook, sessionId) {
  const session = String(sessionId ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '_')
  return join(tmpdir(), `modbux-${hook}-${session}`)
}

export function firstThisSession(hook, sessionId) {
  const marker = markerPath(hook, sessionId)

  // `wx` fails when the file exists, which makes the check and the claim one
  // step. Two tool calls arriving together would both pass a separate `exists`
  // test and both take the full text.
  try {
    writeFileSync(marker, '', { flag: 'wx' })
  } catch {
    return false
  }

  // Only on the first firing — after that the marker is this session's own.
  try {
    const prefix = `modbux-${hook}-`
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(prefix)) continue
      const stale = join(tmpdir(), name)
      if (existsSync(stale) && Date.now() - statSync(stale).mtimeMs > WEEK) {
        rmSync(stale, { force: true })
      }
    }
  } catch {
    // Tidying is not worth a failure.
  }

  return true
}
