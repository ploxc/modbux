/**
 * The server store's helpers that reach a store when they are called: this
 * one, its batchers or the undo store. `server.zustand.helpers.ts` holds the
 * ones that reach none.
 *
 * These imports close cycles, because the server store imports this module.
 * Every name taken from them is reached from inside a function body, which runs
 * after the modules have evaluated; none is read at this module's scope.
 */
import { NumberRegisters, ServerRegisters, UnitIdString } from '@shared'
import { deepEqual } from 'fast-equals'
import { ServerZustand } from './server.zustand.types'
import { batchKey } from './server.zustand.helpers'
import { delayedRegister } from './server.zustand'
import { useUndoZustand } from './undo.zustand'
import { unitStructure } from './undo.zustand.helpers'

/**
 * Records what a unit held, when an action changed which addresses it has or
 * what they are. A value a master or a generator wrote is no step, so the
 * comparison leaves the values out.
 */
export const recordUnit = (
  get: () => ServerZustand,
  uuid: string,
  unitId: UnitIdString,
  before: ServerRegisters | undefined
): void => {
  const after = get().servers[uuid]?.registers[unitId]
  if (deepEqual(unitStructure(before), unitStructure(after))) return
  useUndoZustand
    .getState()
    .recordServer({ kind: 'unit', uuid, unitId, value: withPendingValues(uuid, unitId, before) })
}

/**
 * A unit's registers with the values the batchers still hold for it.
 *
 * Main's words reach an entry after 50 ms of quiet, so a unit read off the
 * store inside that window is a word behind, and a step recorded from it would
 * put back the word before the one that had already arrived.
 */
export const withPendingValues = (
  uuid: string,
  unitId: UnitIdString,
  registers: ServerRegisters | undefined
): ServerRegisters | undefined => {
  if (registers === undefined) return undefined
  // The parameters rather than the pending composite: they hold the value in
  // the store's own form, where a 64 bit composite is a bigint and the store
  // keeps its decimal string.
  // Bools need none of it: `keepLiveValues` puts a bool back at the value the
  // store holds when the step replays, and a bool still pending then reaches
  // the store and main on its own flush after.
  const numbers = (type: NumberRegisters): ServerRegisters[NumberRegisters] =>
    Object.fromEntries(
      Object.entries(registers[type]).map(([address, entry]) => {
        const pending = delayedRegister.getParameter(batchKey(uuid, unitId, type, Number(address)))
        return [address, pending === undefined ? entry : { ...entry, value: pending.value }]
      })
    )
  return {
    ...registers,
    input_registers: numbers('input_registers'),
    holding_registers: numbers('holding_registers')
  }
}
