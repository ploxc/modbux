import { ServerRegisters } from '@shared'
import { ClientZustand } from './client.zustand.types'
import {
  ClientField,
  ClientFieldStepMap,
  ClientFieldValues,
  ClientUndoStep,
  ServerUndoStep,
  UndoStack
} from './undo.zustand.types'

/** What the store holds for each field, as a step records it. */
export const clientFieldReaders: {
  [Field in ClientField]: (state: ClientZustand) => ClientFieldValues[Field]
} = {
  name: (state) => state.name,
  protocol: (state) => state.connectionConfig.protocol,
  unitId: (state) => state.connectionConfig.unitId,
  host: (state) => state.connectionConfig.tcp.host,
  port: (state) => state.connectionConfig.tcp.options.port,
  com: (state) => state.connectionConfig.rtu.com,
  baudRate: (state) => state.connectionConfig.rtu.options.baudRate,
  parity: (state) => state.connectionConfig.rtu.options.parity ?? 'none',
  dataBits: (state) => state.connectionConfig.rtu.options.dataBits,
  stopBits: (state) => state.connectionConfig.rtu.options.stopBits,
  address: (state) => state.registerConfig.address,
  length: (state) => state.registerConfig.length,
  type: (state) => state.registerConfig.type,
  pollRate: (state) => state.registerConfig.pollRate,
  timeout: (state) => state.registerConfig.timeout,
  littleEndian: (state) => state.registerConfig.littleEndian,
  advancedMode: (state) => state.registerConfig.advancedMode,
  show64BitValues: (state) => state.registerConfig.show64BitValues,
  addressBase: (state) => state.registerConfig.addressBase
}

/** Makes the step for a field, typed to the value that field's setter takes. */
export const clientFieldSteps: {
  [Field in ClientField]: (value: ClientFieldStepMap[Field]['value']) => ClientFieldStepMap[Field]
} = {
  name: (value) => ({ kind: 'field', field: 'name', value }),
  protocol: (value) => ({ kind: 'field', field: 'protocol', value }),
  unitId: (value) => ({ kind: 'field', field: 'unitId', value }),
  host: (value) => ({ kind: 'field', field: 'host', value }),
  port: (value) => ({ kind: 'field', field: 'port', value }),
  com: (value) => ({ kind: 'field', field: 'com', value }),
  baudRate: (value) => ({ kind: 'field', field: 'baudRate', value }),
  parity: (value) => ({ kind: 'field', field: 'parity', value }),
  dataBits: (value) => ({ kind: 'field', field: 'dataBits', value }),
  stopBits: (value) => ({ kind: 'field', field: 'stopBits', value }),
  address: (value) => ({ kind: 'field', field: 'address', value }),
  length: (value) => ({ kind: 'field', field: 'length', value }),
  type: (value) => ({ kind: 'field', field: 'type', value }),
  pollRate: (value) => ({ kind: 'field', field: 'pollRate', value }),
  timeout: (value) => ({ kind: 'field', field: 'timeout', value }),
  littleEndian: (value) => ({ kind: 'field', field: 'littleEndian', value }),
  advancedMode: (value) => ({ kind: 'field', field: 'advancedMode', value }),
  show64BitValues: (value) => ({ kind: 'field', field: 'show64BitValues', value }),
  addressBase: (value) => ({ kind: 'field', field: 'addressBase', value })
}

/** How many steps a stack keeps; the oldest goes first. */
export const UNDO_LIMIT = 100

export const emptyStack = <Step>(): UndoStack<Step> => ({
  past: [],
  future: [],
  openKey: undefined
})

/**
 * The run a client step merges into, or undefined for a step that never merges.
 *
 * A mapping step is keyed by its column, so typing into one scaling factor is
 * one step while the entry it carries is the whole register. Load and Clear
 * Config never merge: two loads in a row are two things to undo.
 */
export const clientStepKey = (step: ClientUndoStep): string | undefined => {
  switch (step.kind) {
    case 'field':
      return `field.${step.field}`
    case 'mapping':
      return `mapping.${step.type}.${step.register}.${step.column}`
    case 'configuration':
      return undefined
  }
}

/**
 * The run a server step merges into: the name, typed a key at a time, and the
 * port. The rest are a click each.
 */
export const serverStepKey = (step: ServerUndoStep): string | undefined => {
  switch (step.kind) {
    case 'name':
    case 'port':
      return `${step.kind}.${step.uuid}`
    case 'server':
    case 'unit':
    case 'bool':
    case 'littleEndian':
      return undefined
  }
}

/**
 * What a unit holds apart from the values in it: the addresses, what each
 * register is, and the comments. Compared to tell a change to a unit from a
 * value a master or a generator wrote into it.
 *
 * A register type with nothing in it is left out, so a unit made as four empty
 * maps on its first write reads the same as one that was never made.
 */
export const unitStructure = (
  registers: ServerRegisters | undefined
): Record<string, Record<string, unknown>> => {
  const structure: Record<string, Record<string, unknown>> = {}
  for (const [registerType, entries] of Object.entries(registers ?? {})) {
    const addresses: Record<string, unknown> = {}
    for (const [address, entry] of Object.entries(entries)) {
      addresses[address] = 'params' in entry ? entry.params : { comment: entry.comment }
    }
    if (Object.keys(addresses).length > 0) structure[registerType] = addresses
  }
  return structure
}

/**
 * The stack with a new step on it, and nothing left to redo.
 *
 * A step whose key is the open run's is not added: the run already holds the
 * value from before its first write, which is what an undo puts back.
 */
export const pushStep = <Step>(
  stack: UndoStack<Step>,
  step: Step,
  key: string | undefined
): UndoStack<Step> => {
  if (key !== undefined && key === stack.openKey) return { ...stack, future: [] }
  return { past: [...stack.past, step].slice(-UNDO_LIMIT), future: [], openKey: key }
}

/**
 * Moves a replayed step off `from` onto `to`, carrying the value it replaced.
 *
 * Undo moves from `past` to `future` and redo the other way. The value a step
 * carries is the one its replay writes, so the step that goes across carries
 * the one that was there before the replay: that is what the opposite move
 * writes back. Either move closes the open run.
 *
 * The step is found by identity rather than taken off the top, because a Load
 * that finished while the replay waited on main has put its own step there.
 */
export const moveStep = <Step>(
  stack: UndoStack<Step>,
  direction: 'undo' | 'redo',
  replayed: Step,
  replaced: Step
): UndoStack<Step> => {
  const from = direction === 'undo' ? stack.past : stack.future
  const to = direction === 'undo' ? stack.future : stack.past
  const moved = {
    from: from.filter((step) => step !== replayed),
    to: [...to, replaced].slice(-UNDO_LIMIT)
  }
  return direction === 'undo'
    ? { past: moved.from, future: moved.to, openKey: undefined }
    : { past: moved.to, future: moved.from, openKey: undefined }
}
