/**
 * Returns the first available port within the range 502–1000 that is not in the provided list.
 * @param usedPorts Array of ports that are already in use.
 * @returns A free port number or undefined if none available.
 */
export const findAvailablePort = (usedPorts: number[]): number | undefined => {
  const MIN_PORT = 502
  const MAX_PORT = 1000

  // Create a Set for fast lookup
  const usedSet = new Set(usedPorts)

  // Start looking from one higher than the max used port (if in range)
  const startPort = Math.max(MIN_PORT, Math.min(MAX_PORT, Math.max(...usedPorts, MIN_PORT - 1) + 1))

  // Search from startPort to MAX_PORT
  for (let port = startPort; port <= MAX_PORT; port++) {
    if (!usedSet.has(port)) return port
  }

  // If nothing found, wrap around and check from MIN_PORT up to startPort - 1
  for (let port = MIN_PORT; port < startPort; port++) {
    if (!usedSet.has(port)) return port
  }

  // All ports taken
  return undefined
}
