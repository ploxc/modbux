import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AfterPackContext } from 'electron-builder'

const MH_MAGIC_64 = 0xfeedfacf
const MACH_HEADER_64_SIZE = 32
const LC_UUID = 0x1b

/**
 * Write `uuid` into the LC_UUID load command of a thin 64-bit Mach-O, in
 * place, and answer the UUID it held. A fat binary or one without the command
 * throws, because the dmg targets are built per arch and Electron's binary
 * carries one.
 */
export const replaceMachOUuid = (binary: Buffer, uuid: Buffer): Buffer => {
  if (binary.readUInt32LE(0) !== MH_MAGIC_64) throw new Error('Not a thin 64-bit Mach-O binary')
  const commandCount = binary.readUInt32LE(16)
  let offset = MACH_HEADER_64_SIZE
  for (let command = 0; command < commandCount; command++) {
    if (binary.readUInt32LE(offset) === LC_UUID) {
      const previous = Buffer.from(binary.subarray(offset + 8, offset + 24))
      uuid.copy(binary, offset + 8)
      return previous
    }
    offset += binary.readUInt32LE(offset + 4)
  }
  throw new Error('The binary has no LC_UUID load command')
}

/** A UUID of Modbux's own, one per release and per Electron build it rides. */
export const modbuxUuid = (appId: string, version: string, electronUuid: Buffer): Buffer =>
  createHash('sha256').update(`${appId} ${version} `).update(electronUuid).digest().subarray(0, 16)

/**
 * macOS keys the Local Network permission to the main executable's UUID and
 * code signature (Apple TN3179), and unsigned, the executable is Electron's
 * byte for byte, `Identifier=Electron` included. This gives it a UUID of its
 * own and signs the bundle ad hoc under the bundle's identifier. `--deep`,
 * because the frameworks inside carry only the linker's signature, which
 * `codesign` refuses as a bundle's nested code.
 */
export default async function afterPack(context: AfterPackContext): Promise<void> {
  if (context.electronPlatformName !== 'darwin') return
  const { appInfo } = context.packager
  const app = path.join(context.appOutDir, `${appInfo.productFilename}.app`)
  const executable = path.join(app, 'Contents', 'MacOS', appInfo.productFilename)
  const binary = await readFile(executable)
  const electronUuid = replaceMachOUuid(binary, Buffer.alloc(16))
  replaceMachOUuid(binary, modbuxUuid(appInfo.id, appInfo.version, electronUuid))
  await writeFile(executable, binary)
  await promisify(execFile)('codesign', ['--force', '--deep', '--sign', '-', app])
}
