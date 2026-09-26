import { randomUUID } from 'node:crypto'
import { McpResult, McpSide, McpToolName } from '@shared'
import { Windows } from '../../windows'
import { ToolAnswer } from './connector'

interface McpRelayParams {
  windows: Windows
  /** How long a window gets to take a call, in milliseconds. */
  ackTimeout: number
  /** How long a window that took a call gets to answer it, in milliseconds. */
  answerTimeout: number
}

/** A call waiting for its window: how to settle it, and how to start its answer timer. */
interface PendingCall {
  settle: (answer: ToolAnswer) => void
  acknowledged: () => void
}

/**
 * Hands a tool call to the window that runs it and waits for its answer.
 *
 * The renderer's stores own the config, so a tool runs there, as the store
 * action a button runs. A client tool goes to the main window and a server
 * tool to the window showing the server. `windows.send` says nothing when no
 * window is there, so the window acknowledges a call before it runs it, and
 * the short timeout is what answers when no acknowledgement comes. A tool that
 * waits on a device, as `read` waits for the client's timeout, runs under the
 * longer one.
 */
export class McpRelay {
  private _windows: Windows
  private _ackTimeout: number
  private _answerTimeout: number
  private _pending = new Map<string, PendingCall>()

  constructor({ windows, ackTimeout, answerTimeout }: McpRelayParams) {
    this._windows = windows
    this._ackTimeout = ackTimeout
    this._answerTimeout = answerTimeout
  }

  public run = (side: McpSide, tool: McpToolName, args: unknown): Promise<ToolAnswer> =>
    new Promise((resolve) => {
      const id = randomUUID()
      // One way out for every path, so neither a timer nor a waiting call outlives it.
      const settle = (answer: ToolAnswer): void => {
        clearTimeout(timer)
        this._pending.delete(id)
        resolve(answer)
      }
      let timer = setTimeout(
        () =>
          settle({
            ok: false,
            error: `No Modbux window answered ${tool} within ${this._ackTimeout / 1000} s. Is a window open?`
          }),
        this._ackTimeout
      )
      const acknowledged = (): void => {
        clearTimeout(timer)
        timer = setTimeout(
          () =>
            settle({
              ok: false,
              error: `${tool} gave no answer within ${this._answerTimeout / 1000} s; it may still be running in Modbux`
            }),
          this._answerTimeout
        )
      }
      this._pending.set(id, { settle, acknowledged })
      this._windows.send('mcp_call', { id, tool, args }, side === 'client' ? 'main' : 'serverView')
    })

  /** Start the answer timer of the call `id` names. An id for no call waiting is dropped. */
  public acknowledge = (id: string): void => {
    this._pending.get(id)?.acknowledged()
  }

  /** Settle the call `result` answers. An answer for no call waiting is dropped. */
  public answer = (result: McpResult): void => {
    const call = this._pending.get(result.id)
    if (!call) return
    call.settle(
      result.ok ? { ok: true, result: result.result } : { ok: false, error: result.error }
    )
  }
}
