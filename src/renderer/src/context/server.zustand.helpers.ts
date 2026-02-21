import { checkHasConfig, RegisterParams, UnitIdString } from '@shared'
import { PersistedServerZustand } from './server.zustand.types'

type DefinedServerRegisters = Exclude<
  PersistedServerZustand['serverRegisters'][UnitIdString],
  undefined
>

export const extractUnitIdsWithData = (serverRegisters: DefinedServerRegisters): UnitIdString[] => {
  const unitIds = Object.keys(serverRegisters) as UnitIdString[]
  const unitIdsWithData = unitIds.filter((unitId) => {
    const reg = serverRegisters[unitId]
    return checkHasConfig(reg)
  })
  return unitIdsWithData
}

export const syncBoolsWithBackend = async (
  serverRegisters: DefinedServerRegisters,
  unitId: UnitIdString,
  syncUuid: string
): Promise<void> => {
  const coils: boolean[] = Array(65536).fill(false)
  const discreteInputs: boolean[] = Array(65536).fill(false)

  Object.values(serverRegisters[unitId]?.['coils'] ?? {}).forEach(
    (value, address) => (coils[address] = value)
  )
  Object.values(serverRegisters[unitId]?.['discrete_inputs'] ?? {}).forEach(
    (value, address) => (discreteInputs[address] = value)
  )

  await window.api.syncBools({
    uuid: syncUuid,
    unitId,
    coils,
    discrete_inputs: discreteInputs
  })
}

export const syncRegistersWithBackend = async (
  serverRegisters: DefinedServerRegisters,
  unitId: UnitIdString,
  uuid: string,
  littleEndian: boolean
): Promise<{
  inputRegisterRegisterValues: RegisterParams[]
  holdingRegisterRegisterValues: RegisterParams[]
}> => {
  const inputRegisterRegisterValues = Object.values(
    serverRegisters[unitId]?.['input_registers'] ?? []
  ).map((r) => r.params)
  const holdingRegisterRegisterValues = Object.values(
    serverRegisters[unitId]?.['holding_registers'] ?? []
  ).map((r) => r.params)

  await window.api.syncServerRegister({
    uuid: uuid,
    unitId,
    registerValues: [...inputRegisterRegisterValues, ...holdingRegisterRegisterValues],
    littleEndian
  })

  return { inputRegisterRegisterValues, holdingRegisterRegisterValues }
}
