import {
  McpToolArgs,
  clientOwner,
  configuredReadGroups,
  isConnectionAddressGiven,
  isReadLengthGiven,
  unitIdOutOfRange
} from '@shared'
import {
  flushRegisterMappingToMain,
  getSelectedClient,
  holdSelection,
  useClientZustand
} from '@renderer/context/client.zustand'
import { readsNothingOf } from '@renderer/context/client.zustand.helpers'
import { showMapping, useLiveZustand } from '@renderer/context/live.zustand'
import { dataOf } from '@renderer/context/live.zustand.helpers'
import { useSerialGroupZustand } from '@renderer/components/client/SerialGroupModal/serialGroupModal.zustand'
import { McpToolError, ReadSource, readValues } from './readTools'

/**
 * Put `client` on screen, as a click on it in the list would.
 *
 * An assistant operates the client a person would see it operate, and the
 * store's setters act on the selected one.
 */
const selectClient = (client: string): void => {
  const clientZustand = useClientZustand.getState()
  if (!Object.hasOwn(clientZustand.clients, client)) {
    throw new McpToolError(`No client has the id ${client}; list_clients names them`)
  }
  clientZustand.setSelectedUuid(client)
  if (useClientZustand.getState().selectedUuid !== client) {
    throw new McpToolError('Modbux is busy with another client; try again in a moment')
  }
}

const stateOf = (client: string): ReturnType<typeof dataOf>['clientState'] =>
  dataOf(useLiveZustand.getState(), client).clientState

type ClientState = ReturnType<typeof stateOf>

/** How long past the client's own timeout a tool waits for main's closing event. */
const SETTLE_MARGIN_MS = 1000

/**
 * Run `act`, then wait for the client state that closes it.
 *
 * The renderer hears main's answer to a call before the events main sent
 * during it: a read answered with no rows, and a connect with `connecting`. So the tool listens from before the call, and answers once
 * `settled` holds for the states heard since, or once the client's timeout
 * and a margin have passed, which is where a refusal main says nothing about
 * leaves it.
 */
const actAndSettle = async (
  client: string,
  act: () => Promise<unknown>,
  settled: (heard: ClientState[]) => boolean
): Promise<void> => {
  const heard: ClientState[] = []
  let stopListening = (): void => {}
  let ceiling: ReturnType<typeof setTimeout> | undefined
  const closed = new Promise<void>((resolve) => {
    stopListening = useLiveZustand.subscribe((live) => {
      heard.push(dataOf(live, client).clientState)
      if (settled(heard)) resolve()
    })
    ceiling = setTimeout(resolve, getSelectedClient().registerConfig.timeout + SETTLE_MARGIN_MS)
  })
  try {
    await act()
    await closed
  } finally {
    stopListening()
    clearTimeout(ceiling)
  }
}

const requireConnected = (client: string): void => {
  if (stateOf(client).connectState !== 'connected') {
    throw new McpToolError('The client is not connected; connect it first')
  }
}

export const connect = async ({ client }: McpToolArgs<'connect'>): Promise<unknown> => {
  selectClient(client)
  const connectState = stateOf(client).connectState
  if (connectState !== 'disconnected') {
    throw new McpToolError(`The client is ${connectState} already`)
  }

  const clientZustand = useClientZustand.getState()
  const { connectionConfig } = clientZustand.clients[client] ?? {}
  const session = clientZustand.sessions[client]
  if (!connectionConfig || !session) throw new McpToolError('The client is still loading')
  const outOfRange = unitIdOutOfRange(connectionConfig)
  if (outOfRange) throw new McpToolError(outOfRange)
  const rtu = connectionConfig.protocol === 'ModbusRtu'
  if (rtu ? !session.valid.com : !session.valid.host) {
    throw new McpToolError(rtu ? 'The client names no COM port' : 'The client names no host')
  }
  // What the Connect button asks first: on Linux the port may need a group.
  if (rtu && (await useSerialGroupZustand.getState().check({ force: true }))) {
    throw new McpToolError('Modbux cannot open serial ports yet; the dialog on screen says why')
  }

  await actAndSettle(
    client,
    () => window.api.connect(client),
    (heard) =>
      heard.some((state) => state.connectState === 'connecting') &&
      heard.at(-1)?.connectState !== 'connecting'
  )
  return { connectState: stateOf(client).connectState }
}

export const disconnect = async ({ client }: McpToolArgs<'disconnect'>): Promise<unknown> => {
  selectClient(client)
  if (stateOf(client).connectState === 'disconnected') {
    throw new McpToolError('The client is not connected')
  }
  await actAndSettle(
    client,
    () => window.api.disconnect(client),
    (heard) => heard.at(-1)?.connectState === 'disconnected'
  )
  // What the Disconnect button does: the grid of a toolbar read empties.
  if (!useClientZustand.getState().sessions[client]?.readConfiguration) {
    useLiveZustand.getState().setRegisterData(client, [])
  }
  return { connectState: stateOf(client).connectState }
}

/** Why main would refuse a read or a poll of this client, as the buttons grey for. */
const refuseReading = (client: string, verb: string): void => {
  requireConnected(client)
  const owner = clientOwner(stateOf(client))
  if (owner) throw new McpToolError(`Cannot ${verb} during ${owner}`)
  if (readsNothingOf(useClientZustand.getState(), client)) {
    throw new McpToolError(
      'The client reads no registers: set a length, or map registers and turn readConfiguration on'
    )
  }
}

export const read = async (
  { client }: McpToolArgs<'read'>,
  source: () => ReadSource
): Promise<unknown> => {
  selectClient(client)
  refuseReading(client, 'read')
  await actAndSettle(
    client,
    () => window.api.read(client),
    (heard) => heard.some((state) => state.reading) && heard.at(-1)?.reading === false
  )
  return readValues(source(), { client })
}

export const startPolling = async ({ client }: McpToolArgs<'start_polling'>): Promise<unknown> => {
  selectClient(client)
  if (stateOf(client).polling) throw new McpToolError('The client is polling already')
  refuseReading(client, 'poll')
  await actAndSettle(
    client,
    () => window.api.startPolling(client),
    (heard) => heard.at(-1)?.polling === true
  )
  return { polling: stateOf(client).polling }
}

export const stopPolling = async ({ client }: McpToolArgs<'stop_polling'>): Promise<unknown> => {
  selectClient(client)
  if (!stateOf(client).polling) throw new McpToolError('The client is not polling')
  await actAndSettle(
    client,
    () => window.api.stopPolling(client),
    (heard) => heard.at(-1)?.polling === false
  )
  return { polling: stateOf(client).polling }
}

const selectedId = (): string => useClientZustand.getState().selectedUuid

/**
 * What the Read configuration toggle does, refused where it greys: while
 * anything but a poll owns the client, and, turning on, over a mapping with
 * nothing to read. Turning on hands main the mapping first and draws it.
 */
const setReadConfiguration = async (client: string, value: boolean): Promise<boolean> => {
  if (clientOwner(stateOf(client), { exceptPolling: true })) return false
  if (value) {
    const { registerConfig, registerMapping } = getSelectedClient()
    if (configuredReadGroups(true, registerConfig.type, registerMapping).length === 0) return false
    if (!(await flushRegisterMappingToMain(client, registerMapping))) return false
    showMapping(client)
  }
  useClientZustand.getState().setReadConfiguration(value)
  return useClientZustand.getState().sessions[client]?.readConfiguration === value
}

type ConfigField = Exclude<keyof McpToolArgs<'set_client_config'>, 'client'>

/**
 * Every field set_client_config takes, in the order it sets them, and the
 * setter the UI field calls. A value the mask would refuse never reaches the
 * setter, which stores an invalid value so a field can show it in error.
 */
const SETTERS: {
  [F in ConfigField]-?: (
    value: NonNullable<McpToolArgs<'set_client_config'>[F]>
  ) => boolean | Promise<boolean>
} = {
  protocol: (value) => useClientZustand.getState().setProtocol(value),
  host: (value) =>
    isConnectionAddressGiven(value) && useClientZustand.getState().setHost(value, true),
  port: (value) => useClientZustand.getState().setPort(String(value)),
  com: (value) =>
    isConnectionAddressGiven(value) && useClientZustand.getState().setCom(value, true),
  baudRate: (value) => useClientZustand.getState().setBaudRate(value),
  parity: (value) => useClientZustand.getState().setParity(value),
  dataBits: (value) => useClientZustand.getState().setDataBits(value),
  stopBits: (value) => useClientZustand.getState().setStopBits(value),
  unitId: (value) => useClientZustand.getState().setUnitId(String(value)),
  type: (value) => useClientZustand.getState().setType(value),
  address: (value) => useClientZustand.getState().setAddress(String(value)),
  length: (value) =>
    isReadLengthGiven(value) && useClientZustand.getState().setLength(String(value), true),
  littleEndian: (value) => useClientZustand.getState().setLittleEndian(value),
  addressBase: (value) => useClientZustand.getState().setAddressBase(value),
  readConfiguration: (value) => setReadConfiguration(selectedId(), value),
  pollRate: (value) => useClientZustand.getState().setPollRate(value),
  timeout: (value) => useClientZustand.getState().setTimeout(value)
}

export const setClientConfig = async ({
  client,
  ...fields
}: McpToolArgs<'set_client_config'>): Promise<unknown> => {
  selectClient(client)
  const changed: string[] = []
  const refused: string[] = []
  await holdSelection(async () => {
    for (const field of Object.keys(SETTERS) as ConfigField[]) {
      const value = fields[field]
      if (value === undefined) continue
      const set = SETTERS[field] as (value: unknown) => boolean | Promise<boolean>
      const taken = await set(value)
      ;(taken ? changed : refused).push(field)
    }
  })
  return { changed, refused }
}
