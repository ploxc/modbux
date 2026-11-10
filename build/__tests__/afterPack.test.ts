import { describe, expect, it } from 'vitest'
import { modbuxUuid, replaceMachOUuid } from '../afterPack'

const LC_SEGMENT_64 = 0x19
const LC_UUID = 0x1b

/** A thin 64-bit Mach-O header followed by the given load commands. */
const machO = (commands: Buffer[]): Buffer => {
  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(commands.length, 16)
  return Buffer.concat([header, ...commands])
}

const loadCommand = (command: number, body: Buffer): Buffer => {
  const head = Buffer.alloc(8)
  head.writeUInt32LE(command, 0)
  head.writeUInt32LE(8 + body.length, 4)
  return Buffer.concat([head, body])
}

const ELECTRON_UUID = Buffer.from('4c4c44db55553144a15d5c7f8c883657', 'hex')
const MODBUX_UUID = Buffer.from('00112233445566778899aabbccddeeff', 'hex')

describe('replaceMachOUuid', () => {
  it('rewrites the UUID behind a command before it, and nothing else', () => {
    const segment = loadCommand(LC_SEGMENT_64, Buffer.alloc(64, 0xab))
    const binary = machO([segment, loadCommand(LC_UUID, ELECTRON_UUID)])
    const expected = Buffer.concat([binary.subarray(0, 32 + 72 + 8), MODBUX_UUID])

    expect(replaceMachOUuid(binary, MODBUX_UUID)).toEqual(ELECTRON_UUID)
    expect(binary).toEqual(expected)
  })

  it('refuses a fat binary', () => {
    const fat = Buffer.alloc(64)
    fat.writeUInt32BE(0xcafebabe, 0)
    expect(() => replaceMachOUuid(fat, MODBUX_UUID)).toThrow('Not a thin 64-bit Mach-O binary')
  })

  it('refuses a binary without an LC_UUID', () => {
    const binary = machO([loadCommand(LC_SEGMENT_64, Buffer.alloc(64))])
    expect(() => replaceMachOUuid(binary, MODBUX_UUID)).toThrow('no LC_UUID')
  })
})

describe('modbuxUuid', () => {
  it('differs per version and per Electron build, and repeats for the same pair', () => {
    const uuid = modbuxUuid('com.ploxc.modbux', '2.3.1', ELECTRON_UUID)
    expect(uuid).toHaveLength(16)
    expect(uuid).not.toEqual(ELECTRON_UUID)
    expect(modbuxUuid('com.ploxc.modbux', '2.3.1', ELECTRON_UUID)).toEqual(uuid)
    expect(modbuxUuid('com.ploxc.modbux', '2.3.2', ELECTRON_UUID)).not.toEqual(uuid)
    expect(modbuxUuid('com.ploxc.modbux', '2.3.1', MODBUX_UUID)).not.toEqual(uuid)
  })
})
