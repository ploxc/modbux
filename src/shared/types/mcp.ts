import z from 'zod'
import { PortSchema } from './ranges'

//
//
// Settings

/** What an assistant may do, one box each, all off until ticked. */
const McpAccessSchema = z.object({
  read: z.boolean(),
  operate: z.boolean(),
  write: z.boolean()
})
export type McpAccess = z.infer<typeof McpAccessSchema>

/** A SHA-256 digest in lowercase hex, which is how the token is kept. */
const TokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * What main needs to run the endpoint. The token itself never reaches it
 * again after it was made: main compares the digest of what a request carries.
 */
export const McpSettingsSchema = z.object({
  access: McpAccessSchema,
  port: PortSchema,
  tokenHash: TokenHashSchema.optional()
})
export type McpSettings = z.infer<typeof McpSettingsSchema>

/** Whether the endpoint listens, and why not when it does not. */
export interface McpStatus {
  listening: boolean
  error?: string
}

/** A new token, shown once, and the digest the settings keep. */
export interface McpToken {
  token: string
  tokenHash: string
}

export const DEFAULT_MCP_PORT = 7502

//
//
// Tools

export type McpLayer = keyof McpAccess

/** Which window runs a tool: the one showing the client, or the one showing the server. */
export type McpSide = 'client' | 'server'

const ClientIdSchema = z.string().min(1).describe('The id list_clients answers.')
const ServerIdSchema = z.string().min(1).describe('The id list_servers answers.')

/**
 * Every tool an assistant can be offered, with the box it sits behind and the
 * window that runs it. Main lists and validates from this; the renderer runs
 * each by name.
 */
export const MCP_TOOLS = {
  list_clients: {
    layer: 'read',
    side: 'client',
    description:
      'Every client: its id, name, protocol, host or COM port, unit id, and whether it is connected, polling or offline.',
    input: {}
  },
  get_client: {
    layer: 'read',
    side: 'client',
    description: "One client's connection config, register config and state.",
    input: { client: ClientIdSchema }
  },
  list_registers: {
    layer: 'read',
    side: 'client',
    description:
      "A client's register mapping: register type, address, name (its comment), data type, scaling and bitmap.",
    input: { client: ClientIdSchema }
  },
  read_values: {
    layer: 'read',
    side: 'client',
    description:
      "What a client's grid shows now, one row per address, with the value its data type and scaling make of it. Answers what the last read brought and when the device last answered; it sends nothing to the device.",
    input: { client: ClientIdSchema }
  },
  list_servers: {
    layer: 'read',
    side: 'server',
    description: 'Every server: its id, name, TCP or RTU, port or COM port, and its unit ids.',
    input: {}
  },
  get_unit: {
    layer: 'read',
    side: 'server',
    description:
      "One server unit's registers and bools: address, name (its comment), data type, value, and a generator where one runs.",
    input: {
      server: ServerIdSchema,
      unit: z.string().regex(/^\d+$/).describe('The unit id, as list_servers answers it.')
    }
  }
} as const satisfies Record<
  string,
  { layer: McpLayer; side: McpSide; description: string; input: z.ZodRawShape }
>

export type McpToolName = keyof typeof MCP_TOOLS

/** The arguments a tool takes, as its schema parses them. */
export type McpToolArgs<T extends McpToolName> = z.infer<
  z.ZodObject<(typeof MCP_TOOLS)[T]['input']>
>

/** A tool call main hands the window that runs it. */
export interface McpCall {
  id: string
  tool: McpToolName
  args: unknown
}

/** What the window answers, under the id of the call. */
export type McpResult =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }
