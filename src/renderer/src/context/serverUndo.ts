import { UnitIdString } from '@shared'
import { deepEqual } from 'fast-equals'
import { enqueueSnackbar } from 'notistack'
import { useServerZustand } from './server.zustand'
import { PersistedServer } from './server.zustand.types'
import { replayTop, useUndoZustand } from './undo.zustand'
import { pushStep, serverStepKey, unitStructure } from './undo.zustand.helpers'
import {
  ServerBoolStep,
  ServerLittleEndianStep,
  ServerNameStep,
  ServerPortStep,
  ServerRecordStep,
  ServerUndoStep,
  ServerUnitStep,
  UndoOutcome,
  UndoRefusal,
  UndoStack
} from './undo.zustand.types'

/**
 * Shows the server a step belongs to, and the unit where it names one, so what
 * the replay changes is on screen when it changes.
 */
const show = (uuid: string, unitId?: UnitIdString): void => {
  const server = useServerZustand.getState()
  if (server.servers[uuid] && server.selectedUuid !== uuid) server.setSelectedUuid(uuid)
  if (unitId !== undefined && server.getUnitId(uuid) !== unitId) {
    useServerZustand.getState().setUnitId(unitId)
  }
}

const replayName = async (step: ServerNameStep): Promise<ServerNameStep | UndoRefusal> => {
  const server = useServerZustand.getState().servers[step.uuid]
  if (!server) return 'refused-gone'
  show(step.uuid)
  const replaced: ServerNameStep = { ...step, value: server.name ?? '' }
  useServerZustand.getState().setName(step.value)
  return replaced
}

/** Refused when main binds another port, which is the port the server kept. */
const replayPort = async (
  step: ServerPortStep
): Promise<ServerPortStep | UndoRefusal | undefined> => {
  const server = useServerZustand.getState().servers[step.uuid]
  if (!server) return 'refused-gone'
  show(step.uuid)
  const replaced: ServerPortStep = { ...step, value: server.port }
  return (await useServerZustand.getState().setPort(step.value)) ? replaced : undefined
}

const replayLittleEndian = async (
  step: ServerLittleEndianStep
): Promise<ServerLittleEndianStep | UndoRefusal | undefined> => {
  const server = useServerZustand.getState().servers[step.uuid]
  if (!server) return 'refused-gone'
  show(step.uuid)
  const replaced: ServerLittleEndianStep = { ...step, value: server.littleEndian }
  return (await useServerZustand.getState().setLittleEndian(step.value)) ? replaced : undefined
}

/** Refused for a coil that is gone since, which switching would bring back. */
const replayBool = async (step: ServerBoolStep): Promise<ServerBoolStep | UndoRefusal> => {
  const entry =
    useServerZustand.getState().servers[step.uuid]?.registers[step.unitId]?.[step.registerType][
      step.address
    ]
  if (!entry) return 'refused-gone'
  show(step.uuid, step.unitId)
  const replaced: ServerBoolStep = { ...step, value: entry.value }
  useServerZustand.getState().setBool({
    registerType: step.registerType,
    address: step.address,
    boolState: step.value,
    optionalUuid: step.uuid,
    optionalUnitId: step.unitId
  })
  return replaced
}

const replayUnit = async (step: ServerUnitStep): Promise<ServerUnitStep | UndoRefusal> => {
  const server = useServerZustand.getState().servers[step.uuid]
  if (!server) return 'refused-gone'
  show(step.uuid, step.unitId)
  const replaced: ServerUnitStep = { ...step, value: server.registers[step.unitId] }
  await useServerZustand.getState().restoreUnit(step.uuid, step.unitId, step.value)
  return replaced
}

/**
 * Makes the uuid hold the record again, or deletes it for a step that says it
 * did not exist.
 *
 * A server that exists is reset first, so main holds nothing for it and
 * `restoreServer` hands it everything. One that does not is created on the
 * port it had, and refused if main binds none.
 */
const replayServer = async (step: ServerRecordStep): Promise<ServerRecordStep | undefined> => {
  const server = useServerZustand.getState()
  const current = server.servers[step.uuid]
  const replaced: ServerRecordStep = { ...step, value: current }

  if (step.value === undefined) {
    if (current) await server.deleteServer(step.uuid)
    return replaced
  }

  if (current) {
    show(step.uuid)
    await server.resetServer(step.uuid)
  } else if (!(await server.createServer({ uuid: step.uuid, port: Number(step.value.port) }))) {
    return undefined
  }
  await useServerZustand.getState().restoreServer(step.uuid, step.value)

  // A port something else took meanwhile is walked past, and the server
  // listens on another one than it had. Said, because a master still aims at
  // the old one.
  const port = useServerZustand.getState().servers[step.uuid]?.port
  if (port !== undefined && port !== step.value.port) {
    enqueueSnackbar({
      message: `Port ${step.value.port} is taken, so the server is back on port ${port}`,
      variant: 'warning'
    })
  }
  return replaced
}

const replay = (step: ServerUndoStep): Promise<ServerUndoStep | UndoRefusal | undefined> => {
  switch (step.kind) {
    case 'name':
      return replayName(step)
    case 'port':
      return replayPort(step)
    case 'littleEndian':
      return replayLittleEndian(step)
    case 'bool':
      return replayBool(step)
    case 'unit':
      return replayUnit(step)
    case 'server':
      return replayServer(step)
  }
}

const serverStack = {
  read: (): UndoStack<ServerUndoStep> => useUndoZustand.getState().server,
  write: (stack: UndoStack<ServerUndoStep>): void => useUndoZustand.getState().setServer(stack)
}

export const undoServer = (): Promise<UndoOutcome> => replayTop(serverStack, 'undo', replay)
export const redoServer = (): Promise<UndoOutcome> => replayTop(serverStack, 'redo', replay)

/** What a server is apart from the values in its registers. */
const serverStructure = (server: PersistedServer | undefined): unknown =>
  server && {
    name: server.name ?? '',
    port: server.port,
    littleEndian: server.littleEndian,
    units: Object.fromEntries(
      Object.entries(server.registers)
        .map(([unitId, registers]) => [unitId, unitStructure(registers)] as const)
        .filter(([, structure]) => Object.keys(structure).length > 0)
    )
  }

/**
 * Runs the action quiet and records one step for it, in a `finally` so an
 * action that threw after it changed something still has one.
 */
const asOneStep = async (
  action: () => Promise<void>,
  changedStep: () => ServerUndoStep | undefined
): Promise<void> => {
  const undo = useUndoZustand.getState()
  undo.beginQuiet()
  try {
    await action()
  } finally {
    undo.endQuiet()
    const step = changedStep()
    if (step) undo.setServer(pushStep(useUndoZustand.getState().server, step, serverStepKey(step)))
  }
}

/** Clear and Open replace what a server holds: one step for the whole record. */
export const asOneServerStep = (uuid: string, action: () => Promise<void>): Promise<void> => {
  const before = useServerZustand.getState().servers[uuid]
  return asOneStep(action, () =>
    deepEqual(serverStructure(before), serverStructure(useServerZustand.getState().servers[uuid]))
      ? undefined
      : { kind: 'server', uuid, value: before }
  )
}

/** Moving a register is a remove and an add: one step for the unit. */
export const asOneServerUnitStep = (
  uuid: string,
  unitId: UnitIdString,
  action: () => Promise<void>
): Promise<void> => {
  const before = useServerZustand.getState().servers[uuid]?.registers[unitId]
  return asOneStep(action, () =>
    deepEqual(
      unitStructure(before),
      unitStructure(useServerZustand.getState().servers[uuid]?.registers[unitId])
    )
      ? undefined
      : { kind: 'unit', uuid, unitId, value: before }
  )
}
