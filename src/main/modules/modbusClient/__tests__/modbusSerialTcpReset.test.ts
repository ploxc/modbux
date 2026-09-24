import { describe, it, expect } from 'vitest'
import { createServer, type AddressInfo, type Socket } from 'net'
import { EventEmitter } from 'events'
import ModbusRTU from 'modbus-serial'

/**
 * What the real modbus-serial does at a TCP reset, which `Transport`'s
 * `_hearTheSocketClose` is built on. A bump of modbus-serial that turns this
 * red changes what the transport has to listen to: a `close` on `ModbusRTU`
 * means their issue #591 is fixed, and a missing `_client` means the private
 * socket moved.
 */
describe('modbus-serial at a TCP reset', () => {
  it('closes the socket under `_port._client` and emits nothing on ModbusRTU', async () => {
    let accept: (socket: Socket) => void = () => {}
    const accepted = new Promise<Socket>((resolve) => (accept = resolve))
    const server = createServer((socket) => accept(socket))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    const modbus = new ModbusRTU()
    const heard: string[] = []
    ;(modbus as unknown as EventEmitter).on('close', () => heard.push('ModbusRTU close'))
    ;(modbus as unknown as EventEmitter).on('error', () => heard.push('ModbusRTU error'))
    await modbus.connectTCP('127.0.0.1', { port })

    const socket = (modbus as unknown as { _port?: { _client?: EventEmitter } })._port?._client
    expect(socket).toBeInstanceOf(EventEmitter)
    const socketClosed = new Promise<void>((resolve) => socket?.once('close', () => resolve()))

    ;(await accepted).resetAndDestroy()
    await socketClosed
    // A turn for anything ModbusRTU would relay after the socket's close.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(modbus.isOpen).toBe(false)
    expect(heard).toEqual([])
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})
