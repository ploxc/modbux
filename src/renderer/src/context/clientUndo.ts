import { isConnectionAddressGiven } from '@shared'
import { deepEqual } from 'fast-equals'
import {
  getSelectedUnit,
  getShownType,
  holdSelection,
  selectedClientUuid,
  selectedClient,
  selectedUnit,
  shownSection,
  useClientZustand
} from './client.zustand'
import { dataOf, showMapping, useLiveZustand } from './live.zustand'
import { replayTop, useUndoZustand } from './undo.zustand'
import {
  ClientView,
  clientFieldReaders,
  clientFieldSteps,
  clientStepKey,
  pushStep
} from './undo.zustand.helpers'
import {
  ClientConfiguration,
  ClientConfigurationStep,
  ClientField,
  ClientFieldStep,
  ClientFieldStepOf,
  ClientFieldValues,
  ClientMappingStep,
  ClientStepView,
  ClientUndoStep,
  UndoOutcome,
  UndoRefusal,
  UndoStack
} from './undo.zustand.types'

/**
 * Shows the client, the unit and the register type a step is about, and
 * answers whether they are there.
 *
 * Every setter a replay goes through acts on what the view shows, and the
 * stack holds the steps of every client, unit and type it has shown. It runs
 * before the replay, because the replay holds the selection where it is.
 */
const show = ({ uuid, unit, type }: ClientStepView): boolean => {
  const clientZustand = useClientZustand.getState()
  const client = clientZustand.clients[uuid]
  if (!client?.units.some((candidate) => candidate.uuid === unit)) return false
  if (clientZustand.selectedUuid !== uuid) clientZustand.setSelectedUuid(uuid)
  clientZustand.selectUnit(unit)
  clientZustand.showType(type)
  return true
}

/** What the view shows now, as `clientFieldReaders` reads it. */
const viewed = (): ClientView => {
  const state = useClientZustand.getState()
  return { client: selectedClient(state), unit: selectedUnit(state), section: shownSection(state) }
}

/**
 * Each field through the setter a user's edit goes through, so a replay passes
 * the same guards and reaches main the same way. The validity a masked field
 * reports is read off the value, as the field itself reads it.
 */
const clientFieldWriters: {
  [Field in ClientField]: (value: ClientFieldValues[Field]) => Promise<boolean>
} = {
  name: (value) => {
    useClientZustand.getState().setName(value)
    return Promise.resolve(true)
  },
  protocol: (value) => useClientZustand.getState().setProtocol(value),
  unitId: (value) => useClientZustand.getState().setUnitId(String(value)),
  host: (value) => useClientZustand.getState().setHost(value, isConnectionAddressGiven(value)),
  port: (value) => useClientZustand.getState().setPort(String(value)),
  com: (value) => useClientZustand.getState().setCom(value, isConnectionAddressGiven(value)),
  baudRate: (value) => useClientZustand.getState().setBaudRate(value),
  parity: (value) => useClientZustand.getState().setParity(value),
  dataBits: (value) => useClientZustand.getState().setDataBits(value),
  stopBits: (value) => useClientZustand.getState().setStopBits(value),
  address: (value) => useClientZustand.getState().setAddress(String(value)),
  length: (value) => useClientZustand.getState().setLength(String(value)),
  polled: (value) => useClientZustand.getState().setPolled(getShownType(), value),
  pollRate: (value) => useClientZustand.getState().setPollRate(value),
  timeout: (value) => useClientZustand.getState().setTimeout(value),
  offlineAfterTimeouts: (value) => useClientZustand.getState().setOfflineAfterTimeouts(value),
  maxPollInterval: (value) => useClientZustand.getState().setMaxPollInterval(value),
  littleEndian: (value) => useClientZustand.getState().setLittleEndian(value),
  advancedMode: (value) => useClientZustand.getState().setAdvancedMode(value),
  show64BitValues: (value) => useClientZustand.getState().setShow64BitValues(value),
  addressBase: (value) => useClientZustand.getState().setAddressBase(value)
}

/**
 * The fields a connect opens with, which their setters refuse while a
 * connection stands. Named here so the refusal can say so.
 */
const CONNECTION_FIELDS: ReadonlySet<ClientField> = new Set<ClientField>([
  'protocol',
  'host',
  'port',
  'com',
  'baudRate',
  'parity',
  'dataBits',
  'stopBits'
])

const isDisconnected = (uuid: string): boolean =>
  dataOf(useLiveZustand.getState(), uuid).clientState.connectState === 'disconnected'

/**
 * Writes a step's value, and answers the step that would write back what was
 * there, or undefined when the store does not hold the value afterwards.
 *
 * The store is what is asked, not the setter's answer: an invalid host, COM
 * port or length is kept in the store and never sent, and its setter answers
 * `false` for that, but the step it came from is put back all the same.
 */
const replayField = async <Field extends ClientField>(
  step: ClientFieldStepOf<Field>
): Promise<ClientFieldStep | UndoRefusal | undefined> => {
  if (CONNECTION_FIELDS.has(step.field) && !isDisconnected(step.uuid)) return 'refused-connected'
  const read = clientFieldReaders[step.field]
  const replaced = clientFieldSteps[step.field](read(viewed()), step)
  await clientFieldWriters[step.field](step.value)
  return read(viewed()) === step.value ? replaced : undefined
}

/** `show` has put the unit and the type on screen, so the change is where it is seen. */
const replayMapping = (step: ClientMappingStep): Promise<ClientMappingStep | undefined> => {
  const replaced: ClientMappingStep = {
    ...step,
    value: getSelectedUnit().registerMapping[step.type][step.register]
  }
  useClientZustand.getState().setMappingEntry(step.type, step.register, step.value)
  return Promise.resolve(replaced)
}

const currentConfiguration = (): ClientConfiguration => {
  const { name, littleEndian, registerMapping } = getSelectedUnit()
  return { name, littleEndian, registerMapping }
}

/**
 * Puts back what Load or Clear Config replaced, as a whole or not at all.
 *
 * The byte order goes first and is put back if main then refuses the mapping,
 * so a refused step leaves both where they were. The refusal still costs read
 * configuration, which `replaceRegisterMapping` turns off before it asks.
 */
const replayConfiguration = async (
  step: ClientConfigurationStep
): Promise<ClientConfigurationStep | undefined> => {
  const replaced: ClientConfigurationStep = { ...step, value: currentConfiguration() }
  const client = useClientZustand.getState()

  if (!(await client.setLittleEndian(step.value.littleEndian))) return undefined
  if (!(await client.replaceRegisterMapping(step.value.registerMapping))) {
    await client.setLittleEndian(replaced.value.littleEndian)
    return undefined
  }
  client.setUnitName(step.value.name)
  showMapping(step.uuid, step.unit, step.type)
  return replaced
}

const replay = (step: ClientUndoStep): Promise<ClientUndoStep | UndoRefusal | undefined> => {
  switch (step.kind) {
    case 'field':
      return replayField(step)
    case 'mapping':
      return replayMapping(step)
    case 'configuration':
      return replayConfiguration(step)
  }
}

const clientStack = {
  read: (): UndoStack<ClientUndoStep> => useUndoZustand.getState().client,
  write: (stack: UndoStack<ClientUndoStep>): void => useUndoZustand.getState().setClient(stack)
}

const move = (direction: 'undo' | 'redo'): Promise<UndoOutcome> =>
  replayTop(
    clientStack,
    direction,
    (step) => holdSelection(() => replay(step)),
    (step) => show(step)
  )

export const undoClient = (): Promise<UndoOutcome> => move('undo')
export const redoClient = (): Promise<UndoOutcome> => move('redo')

/**
 * Runs an action that replaces the configuration, and records it as one step.
 *
 * Load writes the name, the byte order and the mapping, and Clear Config the
 * name and the mapping. Each setter would record its own step; quiet while the
 * action runs, they record none, and the step recorded after carries all three
 * as they were. That step goes on the stack directly rather than through
 * `recordClient`, which would drop it while an undo that started first is
 * still quiet.
 */
export const asOneClientStep = async (action: () => Promise<void>): Promise<void> => {
  const view: ClientStepView = {
    uuid: selectedClientUuid(),
    unit: getSelectedUnit().uuid,
    type: getShownType()
  }
  const before = currentConfiguration()
  const undo = useUndoZustand.getState()
  undo.beginQuiet()
  try {
    await holdSelection(action)
  } finally {
    // In the `finally`, because a Load that throws after the name and the byte
    // order went in has still changed them.
    undo.endQuiet()
    // By content, because Clear Config hands over a new empty mapping every
    // time, and one that was empty already is no step.
    if (!deepEqual(currentConfiguration(), before)) {
      const step: ClientConfigurationStep = { ...view, kind: 'configuration', value: before }
      undo.setClient(pushStep(useUndoZustand.getState().client, step, clientStepKey(step)))
    }
  }
}
