import {
  checkHasConfig,
  DEFAULT_MODBUS_PORT,
  defaultSerialPortOptions,
  EncodableDataType,
  findAvailablePort,
  getUsedAddresses,
  holdsExact64Bits,
  MAIN_SERVER_UUID,
  PortSchema,
  RegisterParams,
  registerWidth,
  SerialPortOptions,
  ServerRegisters,
  ServerRegistersPerUnit,
  ServerRegisterValue,
  ServerSerialConfig,
  toExact64Bits,
  UnitIdString
} from '@shared'
import { round } from 'lodash'
import { PersistedServer, ServerSet, ServerZustand, UsedAddresses } from './server.zustand.types'

export const extractUnitIdsWithData = (serverRegisters: ServerRegistersPerUnit): UnitIdString[] => {
  const unitIds = Object.keys(serverRegisters) as UnitIdString[]
  const unitIdsWithData = unitIds.filter((unitId) => {
    const registers = serverRegisters[unitId]
    return checkHasConfig(registers)
  })
  return unitIdsWithData
}

/**
 * The two bool arrays main takes, built from what a unit holds.
 *
 * `syncBools` replaces what the unit holds rather than adding to it:
 * `setBoolsFromArray` clears the map first, so an array shorter than 65536
 * erases every address past its end. Both callers build the pair the same way;
 * `resetBools` then blanks the one it is clearing.
 */
export const boolArraysOf = (
  serverRegisters: ServerRegistersPerUnit,
  unitId: UnitIdString
): { coils: boolean[]; discrete_inputs: boolean[] } => {
  const coils: boolean[] = Array(65536).fill(false)
  const discreteInputs: boolean[] = Array(65536).fill(false)

  Object.entries(serverRegisters[unitId]?.['coils'] ?? {}).forEach(
    ([address, entry]) => (coils[Number(address)] = entry.value)
  )
  Object.entries(serverRegisters[unitId]?.['discrete_inputs'] ?? {}).forEach(
    ([address, entry]) => (discreteInputs[Number(address)] = entry.value)
  )

  return { coils, discrete_inputs: discreteInputs }
}

const syncBoolsWithBackend = async (
  serverRegisters: ServerRegistersPerUnit,
  unitId: UnitIdString,
  syncUuid: string
): Promise<void> => {
  await window.api.syncBools({
    uuid: syncUuid,
    unitId,
    ...boolArraysOf(serverRegisters, unitId)
  })
}

export const syncRegistersWithBackend = async (
  serverRegisters: ServerRegistersPerUnit,
  unitId: UnitIdString,
  uuid: string
): Promise<{
  inputRegisterRegisterValues: RegisterParams[]
  holdingRegisterRegisterValues: RegisterParams[]
}> => {
  const inputRegisterRegisterValues = Object.values(
    serverRegisters[unitId]?.['input_registers'] ?? []
  ).map((register) => register.params)
  const holdingRegisterRegisterValues = Object.values(
    serverRegisters[unitId]?.['holding_registers'] ?? []
  ).map((register) => register.params)

  await window.api.syncServerRegister({
    uuid: uuid,
    unitId,
    registerValues: [...inputRegisterRegisterValues, ...holdingRegisterRegisterValues]
  })

  return { inputRegisterRegisterValues, holdingRegisterRegisterValues }
}

const getDefaultServerRegisters = (): ServerRegisters => ({
  coils: {},
  discrete_inputs: {},
  input_registers: {},
  holding_registers: {}
})

const getDefaultUsedAddresses = (): UsedAddresses => ({
  input_registers: [],
  holding_registers: []
})

/**
 * An empty server on the registered port.
 *
 * Two callers with one question between them: `createServer` starts a server
 * here, and `repairServers` falls back to a field of this one for a field it
 * could not read. A repaired port of 502 that the main server already holds
 * costs nothing: `TcpServers.create` probes the socket, walks up from there
 * and answers the port it bound, which is what the store writes.
 */
export const getDefaultServer = (): PersistedServer => ({
  port: String(DEFAULT_MODBUS_PORT),
  unitId: '0',
  name: undefined,
  littleEndian: false,
  registers: {},
  usedAddresses: {}
})

/**
 * The used addresses of one unit, made on the first write into it.
 *
 * Nothing where the uuid names no server, for the reason `unitRegisters`
 * gives.
 */
export const unitUsedAddresses = (
  state: ServerZustand,
  uuid: string,
  unitId: UnitIdString
): UsedAddresses | undefined => {
  const server = state.servers[uuid]
  if (!server) return undefined
  return (server.usedAddresses[unitId] ??= getDefaultUsedAddresses())
}

/**
 * The register map of one unit, made on the first write into it.
 *
 * `clean` gives a server an empty map rather than an entry for each of the 256
 * unit ids, so a unit gets its entry the first time something is written into
 * it. A read takes the optional chain instead: a unit nobody has written to
 * holds nothing, and asking what is in it should not create it.
 *
 * Nothing where the uuid names no server. `setBool` takes a uuid off a
 * `register_value` event, and main sends those from inside the call the store
 * is waiting on, so one can arrive for a server `deleteServer` has just taken
 * out. Creating the entry would put that server back with no port, no name and
 * no listener.
 */
export const unitRegisters = (
  state: ServerZustand,
  uuid: string,
  unitId: UnitIdString
): ServerRegisters | undefined => {
  const server = state.servers[uuid]
  if (!server) return undefined
  return (server.registers[unitId] ??= getDefaultServerRegisters())
}

/**
 * Hands main everything a uuid holds, then marks it ready.
 *
 * The byte order goes first, because main encodes each register with the order
 * it holds at that moment. Both modes send the same thing afterwards: RTU and
 * TCP differ in what they do to open the transport, not in what they put on it.
 */
export const syncUuidToBackend = async (
  set: ServerSet,
  get: () => ServerZustand,
  syncUuid: string
): Promise<void> => {
  const server = get().servers[syncUuid]
  if (!server) return

  await window.api.setServerEndianness({
    uuid: syncUuid,
    littleEndian: server.littleEndian
  })

  for (const unitId of extractUnitIdsWithData(server.registers)) {
    await syncBoolsWithBackend(server.registers, unitId, syncUuid)
    const { inputRegisterRegisterValues, holdingRegisterRegisterValues } =
      await syncRegistersWithBackend(server.registers, unitId, syncUuid)

    set((state) => {
      const addresses = unitUsedAddresses(state, syncUuid, unitId)
      if (!addresses) return
      addresses['input_registers'] = getUsedAddresses(inputRegisterRegisterValues)
      addresses['holding_registers'] = getUsedAddresses(holdingRegisterRegisterValues)
    })
  }

  set((state) => {
    state.ready[syncUuid] = true
  })
}

/**
 * The port `init` asks main to open a uuid on.
 *
 * A port is stored as the string the field holds, so a hand-edited key can
 * carry `''` or `'http'`, and `Number` of either is refused by `PortSchema`.
 * Opened on that, the server would stand in the toggle group with an empty
 * label, no listener and `ready` false.
 *
 * The walk is over what the store has handed out rather than from 502, because
 * the uuids after this one have no listener yet: main probes sockets, so it
 * would hand this server the port the next one is about to ask for, and that
 * one would then be moved on. Nothing free between 502 and 10502 leaves the
 * registered port and main's own walk, which is a key naming ten thousand
 * servers.
 */
export const portToOpen = (uuid: string, servers: Record<string, PersistedServer>): number => {
  const storedPort = Number(servers[uuid]?.port)
  if (PortSchema.safeParse(storedPort).success) return storedPort

  const taken = Object.values(servers)
    .map((server) => Number(server.port))
    .filter((port) => PortSchema.safeParse(port).success)

  return findAvailablePort(taken) ?? DEFAULT_MODBUS_PORT
}

export const getDefaultSerialConfig = (): ServerSerialConfig => ({
  com: '',
  options: { ...defaultSerialPortOptions }
})

/**
 * Puts the RTU server back on the serial settings the store now holds.
 *
 * The stop is unconditional: `stopRtuServer` returns at once when nothing is
 * running, and an empty COM field is a server that has to come down rather
 * than one to leave alone. The start is what the field gates.
 *
 * Every caller is a setter that cannot wait, so the failure is swallowed here.
 * Main reports it through the `backend_message` event.
 */
export const restartRtuServer = async (get: () => ServerZustand): Promise<void> => {
  const { serverMode, serialConfig = getDefaultSerialConfig() } = get()
  if (serverMode !== 'rtu') return

  try {
    await window.api.stopRtuServer()
    if (!serialConfig.com.trim()) return
    await window.api.startRtuServer({ uuid: MAIN_SERVER_UUID, serialConfig })
  } catch {
    // Reported through backend_message.
  }
}

/** One serial option, then the restart that makes the server speak it. */
export const setSerialOption = <Key extends keyof SerialPortOptions>(
  set: ServerSet,
  get: () => ServerZustand,
  key: Key,
  value: SerialPortOptions[Key]
): void => {
  set((state) => {
    state.serialConfig ??= getDefaultSerialConfig()
    state.serialConfig.options[key] = value
  })
  void restartRtuServer(get)
}

interface ServerDelayedSetterParams<P> {
  maxCount?: number
  set: (params: P | Array<P>) => void
}

/**
 * Accumulates server values and updates the state in batches
 */
export class ServerDelayedSetter<T, P> {
  private _pending = new Map<string, T>()
  private _parameterMap = new Map<string, P>()

  private _updateCount = 0
  private _updateTimeout: NodeJS.Timeout | undefined

  private _maxCount: number
  private _set: (params: P | Array<P>) => void

  constructor({ maxCount, set }: ServerDelayedSetterParams<P>) {
    this._maxCount = maxCount ?? 250
    this._set = set
  }

  public trigger(): void {
    clearTimeout(this._updateTimeout)

    const update = (): void => {
      this._set(Array.from(this._parameterMap.values()))
      this._parameterMap.clear()
      this._pending.clear()
      this._updateCount = 0
    }

    // Counted on the test, because a burst with no 50 ms gap in it clears the
    // pending timeout every time and nothing ever reaches the grid. The
    // ceiling is what makes this a debounce that still delivers.
    if (this._updateCount++ > this._maxCount) {
      update()
      return
    }

    this._updateTimeout = setTimeout(update, 50)
  }

  public setParameter(cacheKey: string, parameters: P): void {
    this._parameterMap.set(cacheKey, parameters)
  }

  public setValue(cacheKey: string, value: T): void {
    this._pending.set(cacheKey, value)
  }

  public getValue(cacheKey: string): T | undefined {
    return this._pending.get(cacheKey)
  }
}

/**
 * One word written over a stored composite, and the value that leaves.
 *
 * The inverse of `createRegisters`: that one lays a value out over its
 * registers, this one reads a value back out after one of those registers has
 * been overwritten. It knows nothing about uuids, units or batching, which is
 * `applyRegisterValue`'s half.
 *
 * `undefined` is "the entry holds no composite", which aborts rather than
 * merging the word into a composite of zero: the other three registers are
 * what zero would cost.
 */
export const foldWordIntoComposite = ({
  currentValue,
  dataType,
  littleEndian,
  offsetRegisters,
  word
}: {
  currentValue: ServerRegisterValue | bigint
  dataType: EncodableDataType
  littleEndian: boolean
  offsetRegisters: number
  word: number
}): { composite: number | bigint; value: ServerRegisterValue } | undefined => {
  const byteLength = registerWidth(dataType) * 2
  const view = new DataView(new ArrayBuffer(byteLength))

  // Neither switch is wrapped in a `try`: nothing below throws for any value an
  // entry can hold. Measured over nineteen stored values, among them 1.5, NaN,
  // both infinities, `'abc'`, a 32 digit decimal string and `2n ** 70n`, all
  // eight setters, the eight getters over a buffer of 0xFF, and seven
  // `word`s through the one word overwrite: zero throws. A `DataView`
  // converts what it is handed, and `setBigUint64` takes its argument modulo
  // 2 ** 64 rather than refusing it.
  //
  // Both switches case all eleven types that reach here, so neither carries a
  // `default`. `newComposite` is declared without a value, which is what makes
  // a twelfth `EncodableDataType` a type error rather than a silent zero:
  // adding `probe14` to `BaseDataTypeSchema` answered TS2454 three times.
  switch (dataType) {
    case 'int16':
      view.setInt16(0, Number(currentValue) || 0, littleEndian)
      break
    case 'uint16':
    case 'bitmap':
      view.setUint16(0, Number(currentValue) || 0, littleEndian)
      break
    case 'int32':
      view.setInt32(0, Number(currentValue) || 0, littleEndian)
      break
    case 'uint32':
    case 'unix':
      view.setUint32(0, Number(currentValue) || 0, littleEndian)
      break
    case 'float':
      view.setFloat32(0, Number(currentValue) || 0, littleEndian)
      break
    // `undefined` is a stored value no composite can be read out of, which a
    // hand-edited config reaches because `ServerRegisterEntrySchema` takes a
    // fractional number for these types.
    case 'int64': {
      const composite = toExact64Bits(currentValue)
      if (composite === undefined) return undefined
      view.setBigInt64(0, composite, littleEndian)
      break
    }
    case 'uint64':
    case 'datetime': {
      const composite = toExact64Bits(currentValue)
      if (composite === undefined) return undefined
      view.setBigUint64(0, composite, littleEndian)
      break
    }
    case 'double':
      view.setFloat64(0, Number(currentValue) || 0, littleEndian)
      break
  }

  // Overwrite just the one 16-bit register that the client wrote
  view.setUint16(offsetRegisters * 2, word, littleEndian)

  let newComposite: number | bigint
  switch (dataType) {
    case 'int16':
      newComposite = view.getInt16(0, littleEndian)
      break
    case 'uint16':
    case 'bitmap':
      newComposite = view.getUint16(0, littleEndian)
      break
    case 'int32':
      newComposite = view.getInt32(0, littleEndian)
      break
    case 'uint32':
    case 'unix':
      newComposite = view.getUint32(0, littleEndian)
      break
    case 'float':
      newComposite = view.getFloat32(0, littleEndian)
      break
    case 'int64':
      newComposite = view.getBigInt64(0, littleEndian)
      break
    case 'uint64':
    case 'datetime':
      newComposite = view.getBigUint64(0, littleEndian)
      break
    case 'double':
      newComposite = view.getFloat64(0, littleEndian)
      break
  }

  // A decimal string where the composite fills 64 bits as an integer, because
  // `Number` carries 53 of them: four words of 0xFFFF came out
  // 18446744073709552000 rather than 18446744073709551615, and the next single
  // word write read that back through `BigInt`, which `setBigUint64` took
  // modulo 2 ** 64, leaving the entry holding the low word alone.
  //
  // The cache above the caller held the exact composite already, so the loss
  // only showed after a flush cleared it and the fallback was the entry.
  const value: ServerRegisterValue = holdsExact64Bits(dataType)
    ? newComposite.toString()
    : round(Number(newComposite), ['float', 'double'].includes(dataType) ? 3 : 0)

  return { composite: newComposite, value }
}
