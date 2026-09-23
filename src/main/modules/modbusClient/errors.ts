/**
 * The message of an error `modbus-serial` threw, with exception 11 read the
 * way the spec reads it.
 *
 * The library adds "(retry request again later)" to exception 11. The spec
 * (V1.1b3, section 7) says no response came from the target and the device is
 * usually not present, which is also what Modbux's own server means by it: a
 * unit it does not host. Retrying is the advice for exception 6, where the
 * library's text stays. Filed as yaacov/node-modbus-serial#631.
 */
export const errorText = (error: unknown): string =>
  ((error as Error).message ?? '').replace(
    'Gateway target device failed to respond (retry request again later)',
    'Gateway target device failed to respond (device is usually not present on the network)'
  )

/**
 * An exception reply rather than silence.
 *
 * modbus-serial hangs `modbusCode` on the error it builds from an exception
 * frame, and nothing else it throws carries one: a timeout is a
 * TransactionTimedOutError, a closed port is a PortNotOpenError. So the code
 * is the whole test, and it separates a unit that refused a request from a
 * unit that was never there.
 */
export const isModbusException = (error: unknown): boolean =>
  typeof (error as { modbusCode?: unknown })?.modbusCode === 'number'
