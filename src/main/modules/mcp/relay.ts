import { randomUUID } from 'node:crypto'
import { McpResult, McpSide, McpToolName } from '@shared'
import { Windows } from '../../windows'
import { ToolAnswer } from './connector'

interface McpRelayParams {
  windows: Windows
  /** How long a window gets to answer, in milliseconds. */
  timeout: number
}

/**
 * Hands a tool call to the window that runs it and waits for its answer.
 *
 * The renderer's stores own the config, so a tool runs there, as the store
 * action a button runs. A client tool goes to the main window and a server
 * tool to the window showing the server. `windows.send` says nothing when no
 * window is there, so the timeout is what answers then.
 */
export class McpRelay {
  private _windows: Windows
  private _timeout: number
  private _pending = new Map<string, (answer: ToolAnswer) => void>()

  constructor({ windows, timeout }: McpRelayParams) {
    this._windows = windows
    this._timeout = timeout
  }

  public run = (side: McpSide, tool: McpToolName, args: unknown): Promise<ToolAnswer> =>
    new Promise((resolve) => {
      const id = randomUUID()
      // One way out for both, so neither a timer nor a waiting call outlives it.
      const settle = (answer: ToolAnswer): void => {
        clearTimeout(timer)
        this._pending.delete(id)
        resolve(answer)
      }
      const timer = setTimeout(
        () =>
          settle({
            ok: false,
            error: `No Modbux window answered ${tool} within ${this._timeout / 1000} s. Is a window open?`
          }),
        this._timeout
      )
      this._pending.set(id, settle)
      this._windows.send('mcp_call', { id, tool, args }, side === 'client' ? 'main' : 'serverView')
    })

  /** Settle the call `result` answers. An answer for no call waiting is dropped. */
  public answer = (result: McpResult): void => {
    const settle = this._pending.get(result.id)
    if (!settle) return
    settle(result.ok ? { ok: true, result: result.result } : { ok: false, error: result.error })
  }
}
