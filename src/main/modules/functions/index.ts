import { RegisterData } from '@shared'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { round } from 'lodash'

//
//
// Utils
const swap32 = (buffer: Buffer, offset: number) => {
  return Buffer.concat([
    buffer.subarray(offset + 2, offset + 4),
    buffer.subarray(offset, offset + 2)
  ])
}
const swap64 = (buffer: Buffer, offset: number) => {
  return Buffer.concat([
    buffer.subarray(offset + 6, offset + 8),
    buffer.subarray(offset + 4, offset + 6),
    buffer.subarray(offset + 2, offset + 4),
    buffer.subarray(offset, offset + 2)
  ])
}

// Convert register data to human-readable format
export const convertHoldingRegisterData = (address: number, result: ReadRegisterResult) => {
  if (!result) return []

  const { buffer } = result
  const registerData: RegisterData[] = []

  // A register contains 16 bits, so we handle 2 bytes at a time
  const registers = result.buffer.byteLength / 2

  for (let i = 0; i < registers; i++) {
    const offset = i * 2 // Register (16 bits) = 2 bytes
    const rowData: RegisterData = {
      id: address + i,
      buffer: buffer.subarray(offset, offset + 2),
      hex: buffer.subarray(offset, offset + 2).toString('hex'),
      bigEndian: {
        int16: buffer.readInt16BE(offset),
        uint16: buffer.readUInt16BE(offset),
        // Only read int32, uint32, and float if we have 2 or more registers left
        int32: i < registers - 1 ? swap32(buffer, offset).readInt32BE(0) : 0,
        uint32: i < registers - 1 ? swap32(buffer, offset).readUInt32BE(0) : 0,
        float: i < registers - 1 ? round(swap32(buffer, offset).readFloatBE(0), 7) : 0,
        // Only read BigInt64 and Double if we have 4 or more registers left
        int64: i < registers - 3 ? swap64(buffer, offset).readBigInt64BE(0) : BigInt(0),
        uint64: i < registers - 3 ? swap64(buffer, offset).readBigUInt64BE(0) : BigInt(0),
        double: i < registers - 3 ? round(swap64(buffer, offset).readDoubleBE(0), 15) : 0
      },
      littleEndian: {
        int16: result.buffer.readInt16LE(offset),
        uint16: result.buffer.readUInt16LE(offset),
        // Only read int32, uint32, and float if we have 2 or more registers left
        int32: i < registers - 1 ? result.buffer.readInt32LE(offset) : 0,
        uint32: i < registers - 1 ? result.buffer.readUInt32LE(offset) : 0,
        float: i < registers - 1 ? result.buffer.readFloatLE(offset) : 0,
        // Only read BigInt64 and Double if we have 4 or more registers left
        int64: i < registers - 3 ? result.buffer.readBigInt64LE(offset) : BigInt(0),
        uint64: i < registers - 3 ? result.buffer.readBigUInt64LE(offset) : BigInt(0),
        double: i < registers - 3 ? result.buffer.readDoubleLE(offset) : 0
      }
    }

    registerData.push(rowData)
  }

  return registerData
}
