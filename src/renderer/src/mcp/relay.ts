import z from 'zod'
import { MCP_TOOLS, McpCall, McpResult, McpToolArgs, McpToolName } from '@shared'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { useServerZustand } from '@renderer/context/server.zustand'
import { onEvent, sendEvent } from '@renderer/events'
import {
  McpToolError,
  ReadSource,
  getClient,
  getUnit,
  listClients,
  listRegisters,
  listServers,
  readValues
} from './readTools'
import {
  connect,
  disconnect,
  read,
  setClientConfig,
  startPolling,
  stopPolling
} from './operateTools'

/** What the stores hold now, as the read tools look at it. */
const readSource = (): ReadSource => {
  const server = useServerZustand.getState()
  return {
    clients: useClientZustand.getState().clients,
    live: useLiveZustand.getState().clients,
    servers: server.servers,
    serverMode: server.serverMode ?? 'tcp',
    serialCom: server.serialConfig?.com
  }
}

/** Every tool main can hand this window, by name. A tool added to `MCP_TOOLS` has to be here. */
const TOOLS: { [T in McpToolName]: (args: McpToolArgs<T>) => unknown } = {
  list_clients: () => listClients(readSource()),
  get_client: (args) => getClient(readSource(), args),
  list_registers: (args) => listRegisters(readSource(), args),
  read_values: (args) => readValues(readSource(), args),
  list_servers: () => listServers(readSource()),
  get_unit: (args) => getUnit(readSource(), args),
  set_client_config: setClientConfig,
  connect,
  disconnect,
  read: (args) => read(args, readSource),
  start_polling: startPolling,
  stop_polling: stopPolling
}

const run = <T extends McpToolName>(tool: T, args: unknown): unknown =>
  TOOLS[tool](z.object(MCP_TOOLS[tool].input).parse(args) as McpToolArgs<T>)

/**
 * Run the tool a call names and say how it went.
 *
 * Main parsed the arguments already; they are parsed again here because they
 * crossed IPC as `unknown`. A mistake in what was asked answers its own
 * message; anything else says which tool failed, so the assistant can report
 * it rather than guess.
 */
export const answerCall = async ({ id, tool, args }: McpCall): Promise<McpResult> => {
  try {
    return { id, ok: true, result: await run(tool, args) }
  } catch (error) {
    if (error instanceof McpToolError) return { id, ok: false, error: error.message }
    const reason = error instanceof Error ? error.message : String(error)
    return { id, ok: false, error: `${tool} failed in Modbux: ${reason}` }
  }
}

/** Answer every tool call main sends this window. */
export const installMcpRelay = (): (() => void) =>
  onEvent('mcp_call', (call) => {
    void answerCall(call).then((result) => sendEvent('mcp_result', result))
  })
