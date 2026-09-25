import { createHash, timingSafeEqual } from 'node:crypto'
import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http'
import { Server as ProtocolServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js'
import z from 'zod'
import {
  MCP_TOOLS,
  McpSettings,
  McpSide,
  McpStatus,
  McpToolName,
  formatZodError,
  offersLayer
} from '@shared'

/** What running a tool in a window answered. */
export type ToolAnswer = { ok: true; result: unknown } | { ok: false; error: string }

/** Runs a tool in the window showing `side`, with arguments its schema parsed. */
export type RunTool = (side: McpSide, tool: McpToolName, args: unknown) => Promise<ToolAnswer>

interface McpConnectorParams {
  run: RunTool
}

const failure = (text: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text }]
})

const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

/**
 * The MCP endpoint: Streamable HTTP on loopback, behind one bearer token.
 *
 * It listens while it is switched on and a token is set, and not otherwise. Each
 * request gets a server of its own built from the settings as they are then,
 * so a box turned off takes its tools away from the next request, including a
 * call to a tool that was listed before.
 */
export class McpConnector {
  private _run: RunTool
  private _settings: McpSettings | undefined
  private _server: Server | undefined
  private _port: number | undefined
  /** The apply in progress, which the next one waits for. */
  private _applying: Promise<unknown> = Promise.resolve()

  constructor({ run }: McpConnectorParams) {
    this._run = run
  }

  /**
   * Take new settings, and start, move or stop the listener to match.
   *
   * One at a time, in the order they came: a listener is only set once its
   * `listen` answers, so a second apply running beside the first found no
   * listener to stop and left it bound.
   */
  public apply = (settings: McpSettings): Promise<McpStatus> => {
    const applied = this._applying.then(() => this._apply(settings))
    this._applying = applied
    return applied
  }

  private _apply = async (settings: McpSettings): Promise<McpStatus> => {
    this._settings = settings
    const wanted = settings.tokenHash !== undefined && settings.access.enabled
    if (!wanted) {
      await this.stop()
      return { listening: false }
    }
    if (this._server && this._port === settings.port) return { listening: true }
    await this.stop()
    return this._listen(settings.port)
  }

  /** Close the listener and every connection it holds. */
  public stop = async (): Promise<void> => {
    const server = this._server
    this._server = undefined
    this._port = undefined
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private _listen = (port: number): Promise<McpStatus> =>
    new Promise((resolve) => {
      const server = createServer((request, response) => void this._handle(request, response))
      server.once('error', (error: NodeJS.ErrnoException) => {
        resolve({
          listening: false,
          error: `Port ${port} cannot be used: ${error.code ?? error.message}`
        })
      })
      server.listen(port, '127.0.0.1', () => {
        this._server = server
        this._port = port
        resolve({ listening: true })
      })
    })

  /**
   * Whether the request names this endpoint as its host.
   *
   * A page in a browser can reach loopback through a DNS name it controls, and
   * the Host it sends is then that name, so the token is not the only thing
   * that has to match.
   */
  private _hostAllowed = (request: IncomingMessage): boolean => {
    const host = request.headers.host
    return host === `127.0.0.1:${this._port}` || host === `localhost:${this._port}`
  }

  /** Whether the request carries the token whose digest the settings hold. */
  private _authorized = (request: IncomingMessage): boolean => {
    const tokenHash = this._settings?.tokenHash
    const header = request.headers.authorization
    // The scheme is case-insensitive.
    const token = /^bearer (.+)$/i.exec(header ?? '')?.[1]
    if (!tokenHash || token === undefined) return false
    return timingSafeEqual(digest(token), Buffer.from(tokenHash, 'hex'))
  }

  private _handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.url !== '/mcp') return void response.writeHead(404).end()
    if (!this._hostAllowed(request)) return void response.writeHead(403).end()
    if (!this._authorized(request)) return void response.writeHead(401).end()

    const server = this._buildServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    })
    response.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(request, response)
  }

  /**
   * A server offering the tools behind the boxes ticked now.
   *
   * The protocol-level server rather than `McpServer`, which installs no
   * `tools/list` handler until a tool is registered and so answers "Method not
   * found" to an assistant whose boxes offer none.
   */
  private _buildServer = (): ProtocolServer => {
    const server = new ProtocolServer(
      { name: 'modbux', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )
    const access = this._settings?.access
    const offered = Object.entries(MCP_TOOLS).filter(
      ([, tool]) => access && offersLayer(access, tool.layer)
    )

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: offered.map(
        ([name, tool]): Tool => ({
          name,
          description: tool.description,
          inputSchema: toJsonSchemaCompat(z.object(tool.input)) as Tool['inputSchema']
        })
      )
    }))

    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const entry = offered.find(([name]) => name === params.name)
      if (!entry)
        return failure(`${params.name} is not offered: its box is off, or it does not exist`)
      const [name, tool] = entry
      const parsed = z
        .object(tool.input)
        .strict()
        .safeParse(params.arguments ?? {})
      if (!parsed.success) return failure(formatZodError(parsed.error))

      const answer = await this._run(tool.side, name as McpToolName, parsed.data)
      if (!answer.ok) return failure(answer.error)
      // A 64 bit integer goes as its digits, which JSON has no other way to carry.
      const text = JSON.stringify(answer.result, (_, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value
      )
      return { content: [{ type: 'text', text }] }
    })
    return server
  }
}
