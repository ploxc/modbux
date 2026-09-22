import type { ServerRegisters } from './types/server'

/**
 * Whether the mask has taken anything a number could be made of.
 *
 * A lone `'-'` is a sign with no digits behind it. `.replace('-', '')` takes the
 * first one only, so `'--'` passed as a value.
 */
export const notEmpty = (value: number | string): boolean =>
  String(value).replace(/-/g, '').length > 0

/** What to show for a serial error, named by the port it came from. */
export const humanizeSerialError = (error: Error, port?: string): string => {
  const prefix = port ? `${port}: ` : ''
  const msg = (error.message || '').toLowerCase()
  if (msg.includes('file not found')) return `${prefix}Port not found or not available`
  if (msg.includes('access denied') || msg.includes('permission denied'))
    return `${prefix}Port access denied (already in use?)`
  return `${prefix}${error.message || `Connection failed${error['code'] ? ` (${error['code']})` : ''}`}`
}

/**
 * Whether a unit carries anything the user put there.
 *
 * A bool counts because it exists, not because it is on. `addBool` writes
 * `{ value: false }`, so the coil you add and leave off is an entry like any
 * other, and reading the value instead dropped exactly that unit from a saved
 * config.
 *
 * One expression, so the first type holding something is where it stops.
 * `UnitIdMenuItem` asks it inside a selector, which answers again for every
 * unit id the menu has drawn on every flush of the server store.
 */
export const checkHasConfig = (reg: ServerRegisters | undefined): boolean =>
  Object.keys(reg?.coils ?? {}).length > 0 ||
  Object.keys(reg?.discrete_inputs ?? {}).length > 0 ||
  Object.keys(reg?.input_registers ?? {}).length > 0 ||
  Object.keys(reg?.holding_registers ?? {}).length > 0

export const findAvailablePort = (usedPorts: number[]): number | undefined => {
  const MIN_PORT = 502
  const MAX_PORT = 10502

  const usedSet = new Set(usedPorts)

  const startPort = Math.max(MIN_PORT, Math.min(MAX_PORT, Math.max(...usedPorts, MIN_PORT - 1) + 1))

  for (let port = startPort; port <= MAX_PORT; port++) {
    if (!usedSet.has(port)) return port
  }

  for (let port = MIN_PORT; port < startPort; port++) {
    if (!usedSet.has(port)) return port
  }

  return undefined
}
