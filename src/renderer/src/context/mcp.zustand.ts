import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mutative } from 'zustand-mutative'
import { DEFAULT_MCP_PORT, McpSettings, McpSettingsSchema } from '@shared'
import { McpZustand } from './mcp.zustand.types'

const isServerWindow = window.api.isServerWindow

/**
 * Hand main the settings as the store holds them, and keep what it answers.
 *
 * Only the main window does: both windows evaluate this module, and the
 * settings page is drawn in the main window.
 */
const push = async (): Promise<void> => {
  if (isServerWindow) return
  const { access, port, tokenHash } = useMcpZustand.getState()
  const status = await window.api.setMcpSettings({ access, port, tokenHash })
  if (!status) return
  useMcpZustand.setState((state) => {
    state.status = status
  })
}

export const useMcpZustand = create<
  McpZustand,
  [['zustand/persist', McpSettings], ['zustand/mutative', never]]
>(
  persist(
    mutative((set) => ({
      access: { read: false, operate: false, write: false },
      port: DEFAULT_MCP_PORT,
      tokenHash: undefined,
      status: { listening: false },
      shownToken: undefined,
      setAccess: async (layer, ticked): Promise<void> => {
        set((state) => {
          state.access[layer] = ticked
        })
        await push()
      },
      setPort: async (port): Promise<void> => {
        set((state) => {
          state.port = port
        })
        await push()
      },
      createToken: async (): Promise<void> => {
        const { token, tokenHash } = await window.api.createMcpToken()
        set((state) => {
          state.tokenHash = tokenHash
          state.shownToken = token
        })
        await push()
      },
      forgetShownToken: (): void => {
        set((state) => {
          state.shownToken = undefined
        })
      }
    })),
    {
      name: 'mcp.zustand',
      version: 1,
      // A stored blob that does not parse leaves the defaults, which is every
      // box off: an endpoint that stays shut is the safe answer to a broken file.
      merge: (persisted, current) => {
        const parsed = McpSettingsSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
      partialize: (state) => ({
        access: state.access,
        port: state.port,
        tokenHash: state.tokenHash
      })
    }
  )
)

// Main starts with no settings, so this window hands it the stored ones.
push().catch((error) => console.error('The MCP settings did not reach main:', error))
