import {
  MAX_REGISTER_ADDRESS,
  RegisterType,
  ServerDataValue,
  UnitIdString,
  UnitIdStringSchema
} from '@shared'
import type { FCallback, FCallbackVal, IServiceVector } from 'modbus-serial'
import { ServerRegistry } from './registry'

/**
 * The three Modbus exception codes this server sends.
 *
 * The other seven of the protocol's table are not here: an exported constant
 * nothing names costs a lint disable, which is a worse comment than none.
 * `modbusServer.test.ts` asserts on all three of these.
 */
export const ILLEGAL_DATA_ADDRESS = 2
export const SERVER_DEVICE_FAILURE = 4
export const GATEWAY_TARGET_FAILED = 11

/**
 * The transport a vector answers on. RS-485 is shared and a socket is not, so a
 * request for a unit id this server does not host cannot get the same answer on
 * both.
 */
export type ServerTransport = 'tcp' | 'rtu'

/** Unit 0 is the broadcast address on RTU. */
export const BROADCAST_UNIT_ID: UnitIdString = '0'

/**
 * One accessor shape per direction, because `IServiceVector`'s four getters and
 * two setters differ only in the value they carry.
 *
 * These are written out rather than derived from `IServiceVector`, so what
 * checks them is the assignment in `createVector`. That catches a signature
 * modbus-serial changes incompatibly and not one it widens, because a version
 * that adds an optional parameter stays assignable to these.
 */
type IServiceVectorGet<T> = (addr: number, unitID: number, cb: FCallbackVal<T>) => void
type IServiceVectorSet<T> = (addr: number, value: T, unitID: number, cb: FCallback) => void

/**
 * Helper for returning a Modbus error via callback.
 */
const mbError = <T>(code: number, cb: FCallbackVal<T>, value: T): void => {
  const err = new Error()
  err['modbusErrorCode'] = code
  cb(err, value)
}

/**
 * Unit 0 is broadcast on RTU. On TCP there is no broadcast at all and the
 * unit identifier routes through a gateway, so 0 is an address like any other.
 */
const isBroadcast = (transport: ServerTransport, unitId: UnitIdString): boolean =>
  transport === 'rtu' && unitId === BROADCAST_UNIT_ID

/**
 * Answers a request for a unit id this server does not host.
 *
 * modbus-serial writes a frame when the vector calls `cb` and writes nothing
 * when it does not, so returning without calling it is silence on the wire.
 * On RS-485 silence is the only safe answer: the id belongs to a real device
 * answering at that moment, and a second frame collides with it. A socket
 * carries one device, so silence there is a client timeout instead, and the
 * gateway code says what happened.
 */
const refuseUnit = <T>(transport: ServerTransport, cb: FCallbackVal<T>, value: T): void => {
  if (transport === 'rtu') return
  mbError(GATEWAY_TARGET_FAILED, cb, value)
}

/**
 * Returns the value of a register type for a given address and unitId.
 * Calls the callback with the value or a Modbus error.
 *
 * Synchronous, like `set`: `servertcp_handler.js` calls a three-argument
 * accessor inside try/catch and discards what it returns, so a throw from
 * here is answered exception 4. An `async` accessor throws into a rejection
 * nothing holds, and the client waits out its timeout instead.
 */
const get =
  <K extends RegisterType>(
    registry: ServerRegistry,
    registerType: K,
    uuid: string,
    transport: ServerTransport,
    fallback: ServerDataValue<K>
  ): IServiceVectorGet<ServerDataValue<K>> =>
  (address, unitIdNumber, cb) => {
    const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
    if (!unitId.success) return mbError(SERVER_DEVICE_FAILURE, cb, fallback)
    // A broadcast is never acknowledged, so there is nothing to read from one.
    if (isBroadcast(transport, unitId.data)) return
    if (!registry.hostsUnit(uuid, unitId.data)) return refuseUnit(transport, cb, fallback)

    // A multi-word read at the top of the range asks for addresses the
    // protocol cannot express. The arrays answered `undefined` past their
    // last index and a map answers it for every address it has no entry for,
    // so the range is asked here and the entry only after.
    if (address > MAX_REGISTER_ADDRESS) return mbError(ILLEGAL_DATA_ADDRESS, cb, fallback)

    const value = registry.read(uuid, unitId.data, registerType, address)

    // An address inside the range with no entry is a register nobody
    // configured, and the arrays answered 0 or false for it.
    cb(null, value ?? fallback)
  }

/**
 * Sets the value of a coil or holding register for a given address and unitId.
 * Updates the server data and emits a value change event.
 */
const set =
  <K extends RegisterType>(
    registry: ServerRegistry,
    registerType: K,
    uuid: string,
    transport: ServerTransport
  ): IServiceVectorSet<ServerDataValue<K>> =>
  (address, value, unitIdNumber, cb) => {
    const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
    if (!unitIdSafe.success) return mbError(SERVER_DEVICE_FAILURE, cb, 0)
    const unitId = unitIdSafe.data

    // A broadcast write reaches every unit on the bus and is never answered.
    if (isBroadcast(transport, unitId)) {
      for (const hostedUnitId of registry.hostedUnitIds(uuid))
        registry.write(registerType, uuid, hostedUnitId, address, value)
      return
    }

    if (!registry.hostsUnit(uuid, unitId)) return refuseUnit(transport, cb, 0)

    registry.write(registerType, uuid, unitId, address, value)
    cb(null)
  }

/**
 * The six accessors modbus-serial calls when a frame arrives.
 *
 * Built once per listener and bound to a uuid, and each accessor reads the
 * registry at the moment it is called. That is why a register added after a
 * server is up needs no rebind.
 */
export const createVector = (
  registry: ServerRegistry,
  uuid: string,
  transport: ServerTransport
): IServiceVector => ({
  getCoil: get(registry, 'coils', uuid, transport, false),
  getDiscreteInput: get(registry, 'discrete_inputs', uuid, transport, false),
  getInputRegister: get(registry, 'input_registers', uuid, transport, 0),
  getHoldingRegister: get(registry, 'holding_registers', uuid, transport, 0),
  setCoil: set(registry, 'coils', uuid, transport),
  setRegister: set(registry, 'holding_registers', uuid, transport)
})
