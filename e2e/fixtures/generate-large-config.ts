/**
 * Generates a large server config JSON for performance testing.
 * 20 unit IDs, each with 50 holding registers, 20 input registers, 30 coils, 30 discrete inputs.
 */

type ServerBoolEntry = { value: boolean; comment?: string }
type ServerRegisterEntry = {
  value: number
  params: {
    address: number
    registerType: 'holding_registers' | 'input_registers'
    dataType: string
    comment: string
    value?: number
    min?: number
    max?: number
    interval?: number
  }
}

type ServerRegisters = {
  coils?: Record<string, ServerBoolEntry>
  discrete_inputs?: Record<string, ServerBoolEntry>
  holding_registers?: Record<string, ServerRegisterEntry>
  input_registers?: Record<string, ServerRegisterEntry>
}

type ServerConfig = {
  version: number
  modbuxVersion: string
  name: string
  littleEndian: boolean
  serverRegistersPerUnit: Record<string, ServerRegisters>
}

function generateConfig(): ServerConfig {
  const serverRegistersPerUnit: Record<string, ServerRegisters> = {}

  for (let unit = 0; unit < 20; unit++) {
    const coils: Record<string, ServerBoolEntry> = {}
    for (let i = 0; i < 30; i++) {
      coils[String(i)] = { value: i % 3 === 0, comment: `Unit ${unit} Coil ${i}` }
    }

    const discrete_inputs: Record<string, ServerBoolEntry> = {}
    for (let i = 0; i < 30; i++) {
      discrete_inputs[String(i)] = { value: i % 2 === 0, comment: `Unit ${unit} DI ${i}` }
    }

    const holding_registers: Record<string, ServerRegisterEntry> = {}
    for (let i = 0; i < 50; i++) {
      const addr = i * 2 // space for 32-bit types
      const isGenerator = i % 5 === 0
      holding_registers[String(addr)] = {
        value: isGenerator ? 0 : 1000 + i,
        params: {
          address: addr,
          registerType: 'holding_registers',
          dataType: i % 10 === 0 ? 'float' : 'uint16',
          comment: `Unit ${unit} HR ${addr}`,
          ...(isGenerator ? { min: 0, max: 10000, interval: 2000 } : { value: 1000 + i })
        }
      }
    }

    const input_registers: Record<string, ServerRegisterEntry> = {}
    for (let i = 0; i < 20; i++) {
      const addr = i * 2
      input_registers[String(addr)] = {
        value: 500 + i,
        params: {
          address: addr,
          registerType: 'input_registers',
          dataType: 'uint16',
          comment: `Unit ${unit} IR ${addr}`,
          value: 500 + i
        }
      }
    }

    serverRegistersPerUnit[String(unit)] = {
      coils,
      discrete_inputs,
      holding_registers,
      input_registers
    }
  }

  return {
    version: 2,
    modbuxVersion: '2.0.0',
    name: 'Large Performance Test',
    littleEndian: false,
    serverRegistersPerUnit
  }
}

// Write to file when run directly
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const outPath = resolve(__dirname, 'config-files/server-large-perf.json')
const config = generateConfig()
writeFileSync(outPath, JSON.stringify(config, null, 2))

const units = Object.keys(config.serverRegistersPerUnit).length
const totalRegisters = Object.values(config.serverRegistersPerUnit).reduce((sum, u) => {
  return (
    sum +
    Object.keys(u.coils ?? {}).length +
    Object.keys(u.discrete_inputs ?? {}).length +
    Object.keys(u.holding_registers ?? {}).length +
    Object.keys(u.input_registers ?? {}).length
  )
}, 0)

console.log(`Generated: ${outPath}`)
console.log(`Units: ${units}, Total entries: ${totalRegisters}`)
