import z from 'zod'
import { NumberRegistersSchema, RegisterType } from './register'

/**
 * Ranges the protocol and the socket fix, so a schema states them once.
 *
 * A register address is 16 bit, so 0 to 65535. A unit id is one byte: 0 is the
 * broadcast address and 248 through 255 are reserved, but a field device answers
 * on whatever its vendor put there, so the byte is the range and the reserved
 * part is not refused here. A TCP port is 16 bit too, and shares no meaning
 * with a register address beyond the width.
 *
 * `PortSchema` takes 0 while `modbusServer.isPort` refuses it, and that is two
 * questions rather than one rule written twice. 0 is the width's floor and the
 * value a store from before `createServer` checked still carries, which
 * `createServer` answers by starting on 502. `setPort` answers it with "A
 * server needs a port between 1 and 65535", which is worth more than the
 * boundary's "Invalid request, nothing was changed".
 */
export const RegisterAddressSchema = z.number().int().min(0).max(65535)
export const UnitIdSchema = z.number().int().min(0).max(255)
export const PortSchema = z.number().int().min(0).max(65535)

/**
 * The most a single read can ask for, by what it is reading.
 *
 * MODBUS Application Protocol Specification V1.1b3, section 6: FC01 and FC02
 * answer at most 2000 bits, FC03 and FC04 at most 125 registers. The PDU is 253
 * bytes, and a read response is the function code, a byte count and the data,
 * so 251 bytes are left: 125 registers of two bytes, and 250 bytes of bits.
 *
 * A write is a different pair, 1968 bits and 123 registers, because the request
 * carries the data as well as the address and the quantity. Nothing reads that
 * here, because every field these bound builds a read.
 */
export const MAX_READ_BITS = 2000
export const MAX_READ_REGISTERS = 125

/**
 * The ceiling one read of these register types has.
 *
 * A unit id scan asks for several types with one length, so the strictest of
 * them is the one the request has to fit. `ScanRegisters.tsx ChunkSizeField`
 * computed this pair by hand; the scan's own Length field computed nothing, so
 * `UintInput`'s default of 65535 was typeable and `modbus-serial` wrote it
 * into the quantity field unchecked. A device answers illegal-data-value or
 * says nothing, and the answer the user reads is about the request rather than
 * about the bus.
 */
export const maxReadQuantity = (registerTypes: readonly RegisterType[]): number =>
  registerTypes.some((registerType) => NumberRegistersSchema.safeParse(registerType).success)
    ? MAX_READ_REGISTERS
    : MAX_READ_BITS

/**
 * The same range for a register map keyed by address.
 *
 * A JSON object key is a string, so the range has to be checked after the
 * conversion. Digits only already gives an integer at or above zero, which
 * leaves the ceiling.
 */
export const RegisterAddressKeySchema = z
  .string()
  .regex(/^\d+$/)
  .refine((key) => Number(key) <= 65535, { message: 'Number must be less than or equal to 65535' })
