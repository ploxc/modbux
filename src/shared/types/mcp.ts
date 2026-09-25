import z from 'zod'
import { BitMapConfigSchema } from './bitmap'
import { ProtocolSchema, RegisterLinearInterpolationSchema } from './client'
import { DataTypeSchema } from './datatype'
import { PortSchema, RegisterAddressSchema } from './ranges'
import { RegisterTypeSchema } from './register'
import { DataBitsSchema, ModbusBaudRateSchema, ParitySchema, StopBitsSchema } from './serial'

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
      "What a client's grid shows now, one row per address: its raw word as hex, and for a mapped register every word it spans, its scaling and the value its data type and scaling make of them. A word that was not read is an empty string, and the value is then left out. littleEndian is the order the words of a multi-word number are composed in; the bytes in each hex word are never swapped, and a string ignores it. The answer also says when the device last answered. It answers what the last read brought and sends nothing to the device.",
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
  },
  set_client_config: {
    layer: 'operate',
    side: 'client',
    description:
      "Change a client's settings, as its fields in the UI do. Each field given is set on its own, in the order listed here, and the answer names the ones Modbux refused. Connection fields (protocol, host, port, com and the serial settings) are refused while the client is connected. The client is selected on screen first. address is the protocol address, 0-based, whatever addressBase shows.",
    input: {
      client: ClientIdSchema,
      protocol: ProtocolSchema.optional(),
      host: z.string().optional(),
      port: z.number().int().optional(),
      com: z.string().optional().describe('A serial port path, as get_client shows it.'),
      baudRate: ModbusBaudRateSchema.optional(),
      parity: ParitySchema.optional(),
      dataBits: DataBitsSchema.optional(),
      stopBits: StopBitsSchema.optional(),
      unitId: z.number().int().optional(),
      type: RegisterTypeSchema.optional(),
      address: z.number().int().optional(),
      length: z.number().int().optional(),
      littleEndian: z.boolean().optional(),
      addressBase: z.enum(['0', '1']).optional(),
      readConfiguration: z
        .boolean()
        .optional()
        .describe('Read the mapped registers rather than address and length.'),
      pollRate: z
        .number()
        .int()
        .optional()
        .describe('Milliseconds, 1000 to 10000 in steps of 1000.'),
      timeout: z.number().int().optional().describe('Milliseconds, 1000 to 10000 in steps of 1000.')
    }
  },
  connect: {
    layer: 'operate',
    side: 'client',
    description: 'Connect a client, as its Connect button does, and answer its state after.',
    input: { client: ClientIdSchema }
  },
  disconnect: {
    layer: 'operate',
    side: 'client',
    description: 'Disconnect a client, as its Disconnect button does, and answer its state after.',
    input: { client: ClientIdSchema }
  },
  read: {
    layer: 'operate',
    side: 'client',
    description:
      'Read a connected client once, as its Read button does, and answer what read_values would. Refused while it polls, scans or writes, as the button is. To read other registers, change type, address and length, or readConfiguration, with set_client_config first.',
    input: { client: ClientIdSchema }
  },
  start_polling: {
    layer: 'operate',
    side: 'client',
    description: 'Start polling a connected client, as its Poll button does.',
    input: { client: ClientIdSchema }
  },
  stop_polling: {
    layer: 'operate',
    side: 'client',
    description: 'Stop polling a client.',
    input: { client: ClientIdSchema }
  },
  add_client: {
    layer: 'operate',
    side: 'client',
    description: 'Add a client with the default config, put it on screen, and answer its id.',
    input: { name: z.string().optional() }
  },
  delete_client: {
    layer: 'operate',
    side: 'client',
    description: 'Remove a client, letting go of its connection first. The last client is refused.',
    input: { client: ClientIdSchema }
  },
  set_mapping_entry: {
    layer: 'operate',
    side: 'client',
    description:
      "Edit one register of a client's mapping, as its row in the grid does. The client's register type switches to type first, as picking it in the UI does. Each field given is set on its own, and the answer names the ones Modbux refused. A coil or discrete input takes a comment only. dataType none removes the register from the mapping, and then takes no other field.",
    input: {
      client: ClientIdSchema,
      type: RegisterTypeSchema,
      address: RegisterAddressSchema.describe('The protocol address, 0-based.'),
      dataType: DataTypeSchema.optional(),
      scalingFactor: z.number().optional(),
      comment: z.string().optional().describe('The name the register goes by.'),
      groupEnd: z
        .boolean()
        .optional()
        .describe('Start a new read group after this register, under read configuration.'),
      interpolate: RegisterLinearInterpolationSchema.optional().describe(
        'Linear interpolation from x1..x2 to y1..y2, each a number written as a string.'
      ),
      bitMap: BitMapConfigSchema.optional().describe(
        'Per bit, keyed "0" to "15": a comment, a color and whether it is inverted.'
      )
    }
  },
  replace_mapping: {
    layer: 'operate',
    side: 'client',
    description:
      "Open a client config, as the Load button does with a file: its name, byte order and register mapping replace the client's, as one step to undo, and an older version is migrated. Read configuration is turned off first. config is the JSON a Save writes.",
    input: {
      client: ClientIdSchema,
      config: z.record(z.string(), z.unknown())
    }
  },
  clear_mapping: {
    layer: 'operate',
    side: 'client',
    description:
      "Clear a client's name and register mapping, as the Clear button does, as one step to undo.",
    input: { client: ClientIdSchema }
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
