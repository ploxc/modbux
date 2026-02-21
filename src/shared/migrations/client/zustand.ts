export const CURRENT_ROOT_ZUSTAND_VERSION = 2

/**
 * Migrate root Zustand state to current version.
 * Used by Zustand persist middleware.
 */
export function migrateRootState(
  persistedState: unknown,
  version: number
): Record<string, unknown> {
  const state = persistedState as Record<string, unknown>

  if (version < 2) {
    // v1→v2: (reserved for future migrations)
  }

  return state
}
