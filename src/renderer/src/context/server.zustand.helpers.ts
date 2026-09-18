import {
  checkHasConfig,
  defaultSerialPortOptions,
  getUsedAddresses,
  MAIN_SERVER_UUID,
  RegisterParams,
  SerialPortOptions,
  ServerRegisters,
  ServerSerialConfig,
  UnitIdString
} from '@shared'
import {
  DefinedServerRegisters,
  ServerSet,
  ServerZustand,
  UsedAddresses
} from './server.zustand.types'

export const extractUnitIdsWithData = (serverRegisters: DefinedServerRegisters): UnitIdString[] => {
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
 * Main keeps a coil and a discrete input for every one of the 65536 addresses,
 * so a sync sends both arrays whole and the store's sparse map decides which
 * entries are true. Both callers build the pair the same way; `resetBools`
 * then blanks the one it is clearing.
 */
export const boolArraysOf = (
  serverRegisters: DefinedServerRegisters,
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
  serverRegisters: DefinedServerRegisters,
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
  serverRegisters: DefinedServerRegisters,
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

/** The used-address map for a uuid, made on the first write into it. */
const usedAddressesOf = (
  state: ServerZustand,
  uuid: string
): Partial<Record<string, UsedAddresses>> => (state.usedAddresses[uuid] ??= {})

export const unitUsedAddresses = (
  state: ServerZustand,
  uuid: string,
  unitId: UnitIdString
): UsedAddresses => (usedAddressesOf(state, uuid)[unitId] ??= getDefaultUsedAddresses())

/**
 * Where an empty unit is made, and the only place that makes one.
 *
 * `clean` gives a uuid two empty maps rather than an entry for each of the 256
 * unit ids, so a unit gets its entry the first time something is written into
 * it. A read takes the optional chain instead: a unit nobody has written to
 * holds nothing, and asking what is in it should not create it.
 */
export const serverRegistersOf = (
  state: ServerZustand,
  uuid: string
): Partial<Record<string, ServerRegisters>> => (state.serverRegisters[uuid] ??= {})

export const unitRegisters = (
  state: ServerZustand,
  uuid: string,
  unitId: UnitIdString
): ServerRegisters => (serverRegistersOf(state, uuid)[unitId] ??= getDefaultServerRegisters())

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
  const serverRegisters = get().serverRegisters[syncUuid] ?? {}
  set((state) => {
    state.serverRegisters[syncUuid] ??= {}
  })

  await window.api.setServerEndianness({
    uuid: syncUuid,
    littleEndian: !!get().littleEndian[syncUuid]
  })

  for (const unitId of extractUnitIdsWithData(serverRegisters)) {
    await syncBoolsWithBackend(serverRegisters, unitId, syncUuid)
    const { inputRegisterRegisterValues, holdingRegisterRegisterValues } =
      await syncRegistersWithBackend(serverRegisters, unitId, syncUuid)

    set((state) => {
      const addresses = unitUsedAddresses(state, syncUuid, unitId)
      addresses['input_registers'] = getUsedAddresses(inputRegisterRegisterValues)
      addresses['holding_registers'] = getUsedAddresses(holdingRegisterRegisterValues)
    })
  }

  set((state) => {
    state.ready[syncUuid] = true
  })
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
