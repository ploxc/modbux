import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ModbusTcpClient } from './modules/modbusClient'

export const client = new ModbusTcpClient({ host: '192.168.1.190' })

//
// Custom APIs for renderer
const api: Api = {
  read: async (address, length) => {
    const result = await client.read(address, length)
    if (!result) return []

    const newRowData: RowData[] = []

    const registers = result.buffer.byteLength / 2
    console.log(registers)
    for (let i = 0; i < registers; i++) {
      const offset = i * 2 // Register (16 bits) = 2 bytes

      newRowData.push({
        id: address + i,
        hex: result.buffer.subarray(offset, offset + 2).toString('hex'),
        bigEndian: {
          int16: result.buffer.readInt16BE(offset),
          uint16: result.buffer.readUInt16BE(offset),

          // Only read int32, uint32, and float if we have 2 or more registers left
          int32: i < registers - 1 ? result.buffer.readInt32BE(offset) : 0,
          uint32: i < registers - 1 ? result.buffer.readUInt32BE(offset) : 0,
          float: i < registers - 1 ? result.buffer.readFloatBE(offset) : 0,

          // Only read BigInt64 and Double if we have 4 or more registers left
          int64: i < registers - 3 ? result.buffer.readBigInt64BE(offset) : BigInt(0),
          uint64: i < registers - 3 ? result.buffer.readBigUInt64BE(offset) : BigInt(0),
          double: i < registers - 3 ? result.buffer.readDoubleBE(offset) : 0
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
      })
    }

    return newRowData
  }
}

//
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
