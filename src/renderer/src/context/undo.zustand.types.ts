import {
  ConnectionConfig,
  Parity,
  RegisterConfig,
  RegisterMapping,
  RegisterMapValue,
  RegisterType,
  SerialPortOptions
} from '@shared'

/**
 * Every client field an undo can put back, keyed by the name a step carries.
 *
 * `parity` is optional in the store, because a config from before it existed
 * carries none, and it is read here as the `none` a missing one means. A step
 * holding `undefined` would be put back as `none` and never compare equal.
 */
export type ClientFieldValues = RegisterConfig &
  Omit<SerialPortOptions, 'parity'> & {
    parity: Parity
    name: string
    protocol: ConnectionConfig['protocol']
    unitId: ConnectionConfig['unitId']
    host: string
    port: number
    com: string
  }

export type ClientField = keyof ClientFieldValues

/** One field, the value it had before the run of writes this step stands for. */
export type ClientFieldStepMap = {
  [Field in ClientField]: {
    kind: 'field'
    field: Field
    value: ClientFieldValues[Field]
  }
}

/**
 * A field step, generic over the field so a step and its replay are checked as
 * one pair. TypeScript correlates `step.field` with `step.value` only through a
 * table indexed by the field, which is why the steps are made and replayed
 * through tables rather than built as literals.
 */
export type ClientFieldStepOf<Fields extends ClientField = ClientField> = {
  [Field in Fields]: ClientFieldStepMap[Field]
}[Fields]

export type ClientFieldStep = ClientFieldStepOf

/**
 * One register's mapping entry, whole, as it was before a column of it changed.
 *
 * The entry rather than the column, because setting a data type of `none`
 * deletes the entry and every other column in it goes with it.
 */
export interface ClientMappingStep {
  kind: 'mapping'
  type: RegisterType
  register: number
  column: keyof RegisterMapValue
  value: RegisterMapValue | undefined
}

/** What Load and Clear Config replace together, so one undo puts all of it back. */
export interface ClientConfiguration {
  name: string
  littleEndian: boolean
  registerMapping: RegisterMapping
}

export interface ClientConfigurationStep {
  kind: 'configuration'
  value: ClientConfiguration
}

export type ClientUndoStep = ClientFieldStep | ClientMappingStep | ClientConfigurationStep

/**
 * The steps of one store, oldest first.
 *
 * `openKey` names the run the next write may merge into. A write to the same
 * field merges while nothing else has happened in between, and an undo or a
 * redo closes the run, so typing after an undo starts a step of its own.
 */
export interface UndoStack<Step> {
  past: Step[]
  future: Step[]
  openKey: string | undefined
}

export type UndoOutcome = 'done' | 'refused' | 'empty' | 'busy'

export interface UndoZustand {
  client: UndoStack<ClientUndoStep>
  /**
   * How many replays and actions that write several fields are running. A
   * setter records nothing while it is above zero: the replay is the step, and
   * the action records itself once. A count, because a Load can start while an
   * undo waits on main, and the first to finish must not end the other's.
   */
  quiet: number
  recordClient: (step: ClientUndoStep) => void
  setClient: (stack: UndoStack<ClientUndoStep>) => void
  beginQuiet: () => void
  endQuiet: () => void
}
