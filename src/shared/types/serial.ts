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

export const SerialPortOptionsSchema = z.object({
  baudRate: ModbusBaudRateSchema,
  dataBits: z.number(),
  stopBits: z.number(),
  parity: ParitySchema.optional()
})
export type SerialPortOptions = z.infer<typeof SerialPortOptionsSchema>
