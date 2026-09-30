// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { ClientUnit, LogSeries, newClientUnit } from '@shared'
import { exportTree, exportTreeIds } from '../exportTree'

const meter = (): ClientUnit => {
  const unit = newClientUnit('meter', 2)
  unit.name = 'Energy meter'
  unit.addressBase = '1'
  unit.registerMapping.holding_registers = {
    3000: { dataType: 'uint16', comment: 'Current, L1', log: { mode: 'poll' } },
    // Logged for a while, then set back to Off.
    3002: { dataType: 'uint16', comment: 'Current, L2' }
  }
  return unit
}

const idle = (): ClientUnit => newClientUnit('idle', 3)

const current1: LogSeries = { unit: 'meter', type: 'holding_registers', address: 3000 }
const current2: LogSeries = { unit: 'meter', type: 'holding_registers', address: 3002 }
const gone: LogSeries = { unit: 'removed', type: 'coils', address: 7 }

describe('exportTree', () => {
  it('lists a register the log holds that no longer logs', () => {
    const tree = exportTree('Panel', [meter()], [current1, current2])

    expect(tree.children).toEqual([
      {
        id: 'unit:meter',
        label: 'ID 2 · Energy meter',
        children: [
          { id: 'meter|holding_registers|3000', label: '3001 · Current, L1' },
          { id: 'meter|holding_registers|3002', label: '3003 · Current, L2' }
        ]
      }
    ])
  })

  it('leaves out a register that logs but has no sample, and a unit with none', () => {
    const tree = exportTree('Panel', [meter(), idle()], [current2])

    expect(tree.children.map((unit) => unit.children?.map((register) => register.id))).toEqual([
      ['meter|holding_registers|3002']
    ])
  })

  it('lists a unit removed since after the others, its registers by address and type', () => {
    const tree = exportTree('Panel', [meter()], [gone, current1])

    expect(tree.children.map((unit) => unit.label)).toEqual(['ID 2 · Energy meter', 'Removed unit'])
    expect(tree.children[1]?.children).toEqual([{ id: 'removed|coils|7', label: '7 · Coils' }])
  })

  it('lists the registers of a unit by register type, then by address', () => {
    const pump: LogSeries = { unit: 'meter', type: 'coils', address: 4 }
    const tree = exportTree('Panel', [meter()], [current2, pump, current1])

    expect(tree.children[0]?.children?.map((register) => register.id)).toEqual([
      'meter|holding_registers|3000',
      'meter|holding_registers|3002',
      'meter|coils|4'
    ])
  })

  it('ticks the client, every unit the log holds and every register in it', () => {
    expect(exportTreeIds([current1, gone, current2])).toEqual([
      'client:',
      'unit:meter',
      'unit:removed',
      'meter|holding_registers|3000',
      'removed|coils|7',
      'meter|holding_registers|3002'
    ])
  })
})
