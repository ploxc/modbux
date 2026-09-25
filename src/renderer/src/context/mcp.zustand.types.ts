import { McpAccess, McpLayer, McpStatus } from '@shared'

export interface McpZustand {
  access: McpAccess
  port: number
  /** The digest of the token an assistant has to send, or none before one is made. */
  tokenHash: string | undefined
  /** What main said the last time it was handed the settings. */
  status: McpStatus
  /** The token just made, shown until the page is left. It is never persisted. */
  shownToken: string | undefined
  setAccess: (layer: McpLayer, ticked: boolean) => Promise<void>
  setPort: (port: number) => Promise<void>
  createToken: () => Promise<void>
  forgetShownToken: () => void
}
