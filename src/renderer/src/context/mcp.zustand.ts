import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mutative } from 'zustand-mutative'
import z from 'zod'
import { DEFAULT_MCP_PORT, McpSettings, McpSettingsSchema } from '@shared'
import { McpZustand } from './mcp.zustand.types'

const McpSettingsV1Schema = McpSettingsSchema.extend({
  access: z.object({ read: z.boolean(), operate: z.boolean(), write: z.boolean() })
})

const DEFAULT_SETTINGS: McpSettings = {
  access: { enabled: false, operate: false, write: false },
  port: DEFAULT_MCP_PORT
}

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
      ...DEFAULT_SETTINGS,
      tokenHash: undefined,
      status: { listening: false },
      shownToken: undefined,
      setAccess: async (box, ticked): Promise<void> => {
        set((state) => {
          state.access[box] = ticked
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
      version: 2,
      // Version 1 had a read box where the switch is now, and listened while
      // any box was ticked; it still does. A blob that does not parse leaves
      // the defaults, as `merge` does.
      migrate: (persisted, version) => {
        const v1 = McpSettingsV1Schema.safeParse(persisted)
        if (version !== 1 || !v1.success) return DEFAULT_SETTINGS
        const { read, operate, write } = v1.data.access
        return { ...v1.data, access: { enabled: read || operate || write, operate, write } }
      },
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
