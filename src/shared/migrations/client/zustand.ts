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
    // v1→v2: added readLocalTime to registerConfig
    const registerConfig = state.registerConfig as Record<string, unknown> | undefined
    if (registerConfig && !('readLocalTime' in registerConfig)) {
      registerConfig.readLocalTime = false
    }
  }

  return state
}
