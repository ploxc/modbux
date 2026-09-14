import z from 'zod'

export const ModbusBaudRateSchema = z.enum([
  '1200',
  '2400',
  '4800',
  '9600',
  '14400',
  '19200',
  '38400',
  '57600',
  '115200'
])
export type ModbusBaudRate = z.infer<typeof ModbusBaudRateSchema>

/**
 * What the serial binding accepts on every platform.
 *
 * `modbus-serial` also types `mark` and `space`, and `serialport_win.cpp` has a
 * case for both. `serialport_unix.cpp` has three cases and a default that
 * returns -1, so on macOS and Linux either one fails the open with
 * "Invalid parity setting".
 */
export const ParitySchema = z.enum(['none', 'even', 'odd'])
export type Parity = z.infer<typeof ParitySchema>

/**
 * The frame widths the selects offer and the binding is handed.
 *
 * `ModbusServer.startRtuServer` casts both to exactly these literals on the way
 * into `ServerSerialPortOptions`, and `bindings-cpp` merges its options into
 * defaults and hands them to the native binding with no check of its own on
 * either. Spelling the literals here is what lets those casts go.
 */
export const DataBitsSchema = z.union([z.literal(8), z.literal(7), z.literal(6), z.literal(5)])
export type DataBits = z.infer<typeof DataBitsSchema>

export const StopBitsSchema = z.union([z.literal(1), z.literal(2)])
export type StopBits = z.infer<typeof StopBitsSchema>

export const SerialPortOptionsSchema = z.object({
  baudRate: ModbusBaudRateSchema,
  dataBits: DataBitsSchema,
  stopBits: StopBitsSchema,
  parity: ParitySchema.optional()
})
export type SerialPortOptions = z.infer<typeof SerialPortOptionsSchema>
