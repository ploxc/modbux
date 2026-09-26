import { ClientSection, ClientUnit, ServerRegisters } from '@shared'
import { PersistedClient } from './client.zustand.types'
import {
  ClientField,
  ClientFieldStepMap,
  ClientFieldValues,
  ClientStepView,
  ClientUndoStep,
  ServerUndoStep,
  UndoStack
} from './undo.zustand.types'

/** What the view shows: a client, the unit it shows and that unit's shown section. */
export interface ClientView {
  client: PersistedClient
  unit: ClientUnit
  section: ClientSection
}

/** What the store holds for each field, as a step records it. */
export const clientFieldReaders: {
  [Field in ClientField]: (view: ClientView) => ClientFieldValues[Field]
} = {
  name: ({ client }) => client.name,
  protocol: ({ client }) => client.connectionConfig.protocol,
  host: ({ client }) => client.connectionConfig.tcp.host,
  port: ({ client }) => client.connectionConfig.tcp.options.port,
  com: ({ client }) => client.connectionConfig.rtu.com,
  baudRate: ({ client }) => client.connectionConfig.rtu.options.baudRate,
  parity: ({ client }) => client.connectionConfig.rtu.options.parity ?? 'none',
  dataBits: ({ client }) => client.connectionConfig.rtu.options.dataBits,
  stopBits: ({ client }) => client.connectionConfig.rtu.options.stopBits,
  pollRate: ({ client }) => client.registerConfig.pollRate,
  timeout: ({ client }) => client.registerConfig.timeout,
  offlineAfterTimeouts: ({ client }) => client.registerConfig.offlineAfterTimeouts,
  maxPollInterval: ({ client }) => client.registerConfig.maxPollInterval,
  advancedMode: ({ client }) => client.registerConfig.advancedMode,
  show64BitValues: ({ client }) => client.registerConfig.show64BitValues,
  unitId: ({ unit }) => unit.unitId,
  littleEndian: ({ unit }) => unit.littleEndian,
  addressBase: ({ unit }) => unit.addressBase,
  address: ({ section }) => section.address,
  length: ({ section }) => section.length,
  polled: ({ section }) => section.polled
}

/** Makes the step for a field, typed to the value that field's setter takes. */
export const clientFieldSteps: {
  [Field in ClientField]: (
    value: ClientFieldStepMap[Field]['value'],
    view: ClientStepView
  ) => ClientFieldStepMap[Field]
} = {
  name: (value, view) => ({ ...view, kind: 'field', field: 'name', value }),
  protocol: (value, view) => ({ ...view, kind: 'field', field: 'protocol', value }),
  host: (value, view) => ({ ...view, kind: 'field', field: 'host', value }),
  port: (value, view) => ({ ...view, kind: 'field', field: 'port', value }),
  com: (value, view) => ({ ...view, kind: 'field', field: 'com', value }),
  baudRate: (value, view) => ({ ...view, kind: 'field', field: 'baudRate', value }),
  parity: (value, view) => ({ ...view, kind: 'field', field: 'parity', value }),
  dataBits: (value, view) => ({ ...view, kind: 'field', field: 'dataBits', value }),
  stopBits: (value, view) => ({ ...view, kind: 'field', field: 'stopBits', value }),
  pollRate: (value, view) => ({ ...view, kind: 'field', field: 'pollRate', value }),
  timeout: (value, view) => ({ ...view, kind: 'field', field: 'timeout', value }),
  offlineAfterTimeouts: (value, view) => ({
    ...view,
    kind: 'field',
    field: 'offlineAfterTimeouts',
    value
  }),
  maxPollInterval: (value, view) => ({ ...view, kind: 'field', field: 'maxPollInterval', value }),
  advancedMode: (value, view) => ({ ...view, kind: 'field', field: 'advancedMode', value }),
  show64BitValues: (value, view) => ({ ...view, kind: 'field', field: 'show64BitValues', value }),
  unitId: (value, view) => ({ ...view, kind: 'field', field: 'unitId', value }),
  littleEndian: (value, view) => ({ ...view, kind: 'field', field: 'littleEndian', value }),
  addressBase: (value, view) => ({ ...view, kind: 'field', field: 'addressBase', value }),
  address: (value, view) => ({ ...view, kind: 'field', field: 'address', value }),
  length: (value, view) => ({ ...view, kind: 'field', field: 'length', value }),
  polled: (value, view) => ({ ...view, kind: 'field', field: 'polled', value })
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
 * A run is one client's, unit's and shown type's, so a host typed into another
 * client, or an address typed on another unit, is its own step.
 *
 * A mapping step is keyed by its column, so typing into one scaling factor is
 * one step while the entry it carries is the whole register. Load and Clear
 * Config never merge: two loads in a row are two things to undo.
 */
export const clientStepKey = (step: ClientUndoStep): string | undefined => {
  switch (step.kind) {
    case 'field':
      return `field.${step.field}.${step.uuid}.${step.unit}.${step.type}`
    case 'mapping':
      return `mapping.${step.type}.${step.register}.${step.column}.${step.uuid}.${step.unit}`
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
