import {
  AddRegisterParams,
  NumberRegisters,
  RegisterParams,
  RegisterType,
  RegisterValue,
  RemoveRegisterParams,
  ResetBoolsParams,
  ResetRegistersParams,
  ServerData,
  ServerDataValue,
  ServerEndianness,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  UnitIdString,
  ValueGenerators,
  registerWidth
} from '@shared'
import { Windows } from '../../windows'
import { emitServerMessage } from './messages'
import { encodeRegisters, writeRegisters } from './registers'
import { ValueGenerator } from './valueGenerator'

const getDefaultGenerators = (): ValueGenerators => ({
  input_registers: new Map(),
  holding_registers: new Map()
})

const getDefaultServerData = (): ServerData => ({
  coils: new Map(),
  discrete_inputs: new Map(),
  input_registers: new Map(),
  holding_registers: new Map()
})

/**
 * Keeps the addresses the array holds true and drops the rest.
 *
 * `syncBools` is the caller, and it replaces what the unit held rather than
 * adding to it.
 */
const setBoolsFromArray = (bools: Map<number, boolean>, states: boolean[]): void => {
  bools.clear()
  for (const [address, state] of states.entries()) if (state) bools.set(address, state)
}

type ServerDataUnitMap = Map<UnitIdString, ServerData>
type ValueGeneratorsUnitMap = Map<UnitIdString, ValueGenerators>

type RegisterParamsUnitMap = Map<UnitIdString, Record<NumberRegisters, Map<number, RegisterParams>>>

type ServerDataMap = Map<string, ServerDataUnitMap>
type ValueGeneratorsMap = Map<string, ValueGeneratorsUnitMap>

interface ServerRegistryParams {
  windows: Windows
  /**
   * Called with the uuid whose data was just written.
   *
   * `ModbusServer` owns what that means, because the answer reads the RTU
   * server's state as well as this one's.
   */
  onUnitData: (uuid: string) => void
}

/**
 * What every server holds, keyed by uuid and then by unit id.
 *
 * The maps are the server's state and nothing else here is. A transport
 * decides who may ask; the vector decides what an address answers; this decides
 * what is there. `ModbusServer` is what holds all four.
 */
export class ServerRegistry {
  private _windows: Windows
  private _onUnitData: (uuid: string) => void

  /**
   * The byte order each server encodes its registers in, big-endian until told.
   *
   * It is set once here and read where a register is encoded, rather than
   * riding along on every add and every sync, which is the same field of the
   * same server read again each time.
   */
  private _littleEndian: Map<string, boolean> = new Map()
  private _serverData: ServerDataMap = new Map()
  private _generatorMap: ValueGeneratorsMap = new Map()
  /** What each register was added with, by address: its data type, its comment, its generator. */
  private _paramsMap: Map<string, RegisterParamsUnitMap> = new Map()

  constructor({ windows, onUnitData }: ServerRegistryParams) {
    this._windows = windows
    this._onUnitData = onUnitData
  }

  /**
   * Ensures an inner map exists for a given UUID in the outer map, creating it if necessary.
   */
  private _ensureInnerMap<K extends UnitIdString, V>(
    outerMap: Map<string, Map<K, V>>,
    uuid: string
  ): Map<K, V> {
    let inner = outerMap.get(uuid)
    if (!inner) {
      inner = new Map()
      outerMap.set(uuid, inner)
    }
    return inner
  }

  /**
   * Helper to set server data for a unitId in the server data map.
   */
  private _setServerData(uuid: string, unitId: UnitIdString, serverData: ServerData): void {
    const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
    perUnitMap.set(unitId, serverData)
    this._onUnitData(uuid)
  }

  /**
   * Helper to dispose all value generators in a ValueGeneratorsUnitMap.
   * This stops all intervals and clears the generator maps.
   */
  private _disposeAllGenerators(unitMap: ValueGeneratorsUnitMap): void {
    for (const registerTypeGenerators of unitMap.values()) {
      registerTypeGenerators.holding_registers.forEach((g) => g.dispose())
      registerTypeGenerators.input_registers.forEach((g) => g.dispose())
    }
  }

  /**
   * The words a fixed register holds, or nothing at all when it cannot be
   * encoded.
   *
   * `RegisterParamsSchema` bounds the pair of `dataType` and `value` at the IPC
   * boundary, and `getValueRangeError` there reads the same table this asks
   * about. This is the class answering for its own input: `addRegister` is
   * public, and a caller inside main reaches it without crossing that boundary.
   */
  private _encode = (params: Parameters<typeof encodeRegisters>[0]): number[] | undefined => {
    try {
      return encodeRegisters(params)
    } catch {
      return undefined
    }
  }

  private _unitParams = (
    uuid: string,
    unitId: UnitIdString
  ): Record<NumberRegisters, Map<number, RegisterParams>> => {
    const perUnitMap = this._ensureInnerMap(this._paramsMap, uuid)
    const unitParams = perUnitMap.get(unitId) ?? {
      input_registers: new Map(),
      holding_registers: new Map()
    }
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, unitParams)
    return unitParams
  }

  /** What every register of a unit was added with, input registers first, by address. */
  public registerParams(uuid: string, unitId: UnitIdString): RegisterParams[] {
    const unitParams = this._paramsMap.get(uuid)?.get(unitId)
    if (!unitParams) return []
    return [unitParams.input_registers, unitParams.holding_registers].flatMap((byAddress) =>
      [...byAddress.entries()].sort(([a], [b]) => a - b).map(([, params]) => params)
    )
  }

  private _unitData = (uuid: string, unitId: UnitIdString): ServerData => {
    const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    return serverData
  }

  /**
   * A unit id is one of ours when it has data under this uuid. The Select
   * offers all 256, and nothing but a register makes one of them exist.
   */
  public hostsUnit(uuid: string, unitId: UnitIdString): boolean {
    return this._serverData.get(uuid)?.has(unitId) ?? false
  }

  /** The unit ids this uuid hosts, which is what a broadcast write reaches. */
  public hostedUnitIds(uuid: string): Iterable<UnitIdString> {
    return this._serverData.get(uuid)?.keys() ?? []
  }

  /** What an address holds, or `undefined` where nothing was written to it. */
  public read<K extends RegisterType>(
    uuid: string,
    unitId: UnitIdString,
    registerType: K,
    address: number
  ): ServerDataValue<K> | undefined {
    return this._serverData.get(uuid)?.get(unitId)?.[registerType].get(address)
  }

  /**
   * Writes a coil or holding register into a unit this server hosts and tells the view.
   */
  public write<K extends RegisterType>(
    registerType: K,
    uuid: string,
    unitId: UnitIdString,
    address: number,
    value: ServerDataValue<K>
  ): void {
    const serverData = this._serverData.get(uuid)?.get(unitId)
    if (!serverData) return
    serverData[registerType].set(address, value)

    this._windows.send(
      'register_value',
      {
        uuid,
        unitId,
        registerType,
        address,
        value
      } as RegisterValue,
      'serverView'
    )
  }

  /** Frees everything a uuid holds, which is what deleting a server does. */
  public deleteUuid(uuid: string): void {
    this.clearData(uuid)
    this._littleEndian.delete(uuid)
  }

  /**
   * Frees the registers, their params and the generators a uuid holds, and keeps its byte
   * order, which is a setting of the server rather than of its data.
   */
  public clearData(uuid: string): void {
    const unitIdGenerators = this._generatorMap.get(uuid)
    if (unitIdGenerators) {
      this._disposeAllGenerators(unitIdGenerators)
    }
    this._generatorMap.delete(uuid)
    this._serverData.delete(uuid)
    this._paramsMap.delete(uuid)
  }

  /** Sets the byte order this server encodes its registers in. */
  public setEndianness = ({ uuid, littleEndian }: ServerEndianness): void => {
    this._littleEndian.set(uuid, littleEndian)
  }

  /**
   * Adds a register or value generator for a given server and unitId.
   * If a generator already exists at the address, it is disposed and replaced.
   * If a fixed value is provided, sets the register directly.
   *
   * Answers the words now held from `address` on, which is an empty list for
   * `none` because that writes none. The renderer's store waits for this answer
   * before it writes, and every `register_value` below goes out before the
   * answer does, so those words would otherwise reach a store with no entry to
   * put them in and be dropped. The store folds what comes back through the same
   * merge the event feeds, which is where a word becomes a value.
   *
   * `undefined` is the refusal, which is what the store already reads as
   * nothing changed. An encoder that cannot take the register answers that
   * rather than throwing: `createIpcHandle` puts no try around a listener, so
   * a throw would reject the invoke rather than answer it, and
   * `syncServerRegisters` adds in a bare loop, so it would take every register
   * after it in that unit with it. One register is refused and the rest of the
   * unit stands.
   *
   * The generator branch throws the same way and gets no guard.
   * `ValueGenerator` writes its first value from its own constructor, and since
   * `_updateValue` stopped being `async` that throw leaves this method rather
   * than becoming a rejection. `RegisterParamsSchema` holds `min` and `max` to
   * their own data type, so no payload reaches it, and a branch here would be
   * one no input turns red.
   */
  public addRegister = ({ uuid, unitId, params }: AddRegisterParams): number[] | undefined => {
    const littleEndian = this._littleEndian.get(uuid) ?? false
    const {
      address,
      registerType,
      dataType,
      min,
      max,
      interval,
      value,
      comment,
      stringValue,
      length
    } = params

    // Ensure generator map for this server and unitId
    const perUnitGeneratorMap = this._ensureInnerMap<UnitIdString, ValueGenerators>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId) ?? getDefaultGenerators()

    if (!perUnitGeneratorMap.has(unitId)) {
      perUnitGeneratorMap.set(unitId, serverGenerators)
    }

    const generators = serverGenerators[registerType]

    /** Frees the register this call is replacing, and answers its data map. */
    const takeTheAddress = (): ServerData => {
      generators.get(address)?.dispose()
      generators.delete(address)
      const serverData = this._unitData(uuid, unitId)
      this._setServerData(uuid, unitId, serverData)
      this._unitParams(uuid, unitId)[registerType].set(address, params)
      return serverData
    }

    // `none` is an address held open with nothing in it, so there is nothing to
    // write and nothing to generate. The generator is disposed either way,
    // which is what editing a register to `none` has to do.
    if (dataType === 'none') {
      takeTheAddress()
      return []
    }

    // If a fixed value is provided, set the register directly
    const fixedValue = !interval && value !== undefined
    if (fixedValue) {
      // Encoded before the address is taken, because a refusal answers
      // `undefined` and the store reads that as nothing changed. Disposing
      // first would zero the words of the generator being replaced and drop it,
      // leaving the grid drawing a generator that does not run.
      const registers = this._encode({ dataType, value, littleEndian, stringValue, length })
      if (!registers) {
        emitServerMessage(this._windows, {
          message: `The ${dataType} register at ${address} was not added: main cannot encode that value`,
          variant: 'error'
        })
        return undefined
      }

      const serverData = takeTheAddress()
      writeRegisters({
        windows: this._windows,
        serverData,
        uuid,
        unitId,
        registerType,
        address,
        registers
      })
      this._setServerData(uuid, unitId, serverData)
      return registers
    }

    // Otherwise, add a value generator for this register
    const serverData = takeTheAddress()
    generators.set(
      address,
      new ValueGenerator({
        uuid,
        unitId,
        windows: this._windows,
        serverData,
        address,
        dataType,
        min,
        max,
        interval,
        littleEndian,
        registerType,
        comment,
        stringValue,
        length
      })
    )

    // `ValueGenerator` writes its first value from its own constructor, so this
    // reads what it just put there rather than answering nothing for a minute.
    const width = registerWidth(dataType, length)
    return Array.from({ length: width }, (_, i) => serverData[registerType].get(address + i) ?? 0)
  }

  /**
   * Removes a register or value generator for a given server and unitId.
   * Disposes the generator if it exists and resets the register value.
   */
  public removeRegister = ({
    uuid,
    unitId,
    registerType,
    address,
    dataType,
    length
  }: RemoveRegisterParams): void => {
    const serverData = this._unitData(uuid, unitId)

    // Reset all registers occupied by this data type
    // The words go rather than turn zero. A read answers 0 for an address with
    // no entry, so the two are the same answer and only one of them is paid for.
    const registerCount = registerWidth(dataType, length)
    for (let i = 0; i < registerCount; i++) {
      serverData[registerType].delete(address + i)
    }
    this._paramsMap.get(uuid)?.get(unitId)?.[registerType].delete(address)

    const perUnitGeneratorMap = this._ensureInnerMap<UnitIdString, ValueGenerators>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId)
    if (!serverGenerators) return
    const generator = serverGenerators[registerType].get(address)
    if (!generator) return
    generator.dispose()
    serverGenerators[registerType].delete(address)
  }

  /**
   * Synchronizes all register values for a given server and unitId.
   * Resets all holding and input registers, then adds all provided registers.
   *
   * `resetRegisters` disposes the generators of one register type and clears
   * their map before it replaces the data array, so the two calls below reach
   * every generator this unit has. This opened by doing that dispose and clear
   * for both types first, which left the calls below nothing to dispose.
   */
  public syncServerRegisters = ({
    uuid,
    unitId,
    registerValues
  }: SyncRegisterValueParams): void => {
    this.resetRegisters({ uuid, unitId, registerType: 'holding_registers' })
    this.resetRegisters({ uuid, unitId, registerType: 'input_registers' })
    for (const params of registerValues) this.addRegister({ uuid, unitId, params })
  }

  /**
   * Resets all registers of a given type for a server and unitId.
   * Disposes all generators for that register type and clears the register data.
   */
  public resetRegisters = ({ uuid, unitId, registerType }: ResetRegistersParams): void => {
    // Dispose and clear only generators for this unitId and registerType
    const perUnitGeneratorMap = this._ensureInnerMap<UnitIdString, ValueGenerators>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId)
    if (serverGenerators) {
      const generators = serverGenerators[registerType]
      generators.forEach((generator) => generator.dispose())
      generators.clear()
    }

    this._paramsMap.get(uuid)?.get(unitId)?.[registerType].clear()

    const serverData = this._unitData(uuid, unitId)
    serverData[registerType].clear()
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Sets a boolean value (coil or discrete input) for a given server and unitId.
   * Updates the server data and emits a value change event.
   */
  public setBool = ({ uuid, unitId, registerType, address, state }: SetBooleanParameters): void => {
    const serverData = this._unitData(uuid, unitId)
    serverData[registerType].set(address, state)
    this._setServerData(uuid, unitId, serverData)
    this._windows.send(
      'register_value',
      { uuid, unitId, registerType, address, value: state },
      'serverView'
    )
  }

  /**
   * Resets all boolean values (coils or discrete inputs) for a given server and unitId.
   */
  public resetBools = ({ uuid, unitId, registerType }: ResetBoolsParams): void => {
    const serverData = this._unitData(uuid, unitId)
    serverData[registerType].clear()
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Synchronizes all boolean values (coils and discrete inputs) for a given server and unitId.
   */
  public syncBools = (params: SyncBoolsParameters): void => {
    const { uuid, unitId } = params
    const serverData = this._unitData(uuid, unitId)
    // The renderer sends both arrays whole, 65536 entries of which the ones it
    // holds are true. Only those are kept: a false is what an address with no
    // entry already reads as.
    setBoolsFromArray(serverData['coils'], params['coils'])
    setBoolsFromArray(serverData['discrete_inputs'], params['discrete_inputs'])
    this._setServerData(uuid, unitId, serverData)
  }
}
