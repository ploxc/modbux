import z from 'zod'
import { isNumberRegister, RegisterType } from './register'

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
export const MAX_REGISTER_ADDRESS = 65535
export const MAX_UNIT_ID = 255

export const RegisterAddressSchema = z.number().int().min(0).max(MAX_REGISTER_ADDRESS)
export const UnitIdSchema = z.number().int().min(0).max(MAX_UNIT_ID)
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
 * carries the data as well as the address and the quantity. `WriteModal` sends
 * one FC15 over the window the toolbar read, and that window is now 2000 wide,
 * so the bit half has a reader. The register half has none: a register write is
 * one value of one data type, four registers at the widest.
 */
export const MAX_READ_BITS = 2000
export const MAX_READ_REGISTERS = 125
export const MAX_WRITE_BITS = 1968

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
  registerTypes.some(isNumberRegister) ? MAX_READ_REGISTERS : MAX_READ_BITS

/**
 * How many registers there are from an address to the end of the range.
 *
 * The other half of what a read asks for. `maxReadQuantity` says how much one
 * response can carry; this says how much is there, and a read takes the
 * smaller. `_read` had neither, so a mapping with an int64 at 65534 asked a
 * device for 65534 through 65537, and a length of 65535 at address 65535 asked
 * for twice the range that exists.
 */
export const registersFrom = (address: number): number => MAX_REGISTER_ADDRESS - address + 1

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
  .refine((key) => Number(key) <= MAX_REGISTER_ADDRESS, {
    message: `Number must be less than or equal to ${MAX_REGISTER_ADDRESS}`
  })
