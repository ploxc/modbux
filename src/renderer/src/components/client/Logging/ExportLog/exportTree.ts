import { REGISTER_TYPE_LABELS } from '@renderer/components/client/RegisterConfig/RegisterConfig'
import { ClientUnit, LogSeries, RegisterTypeSchema } from '@shared'

export interface TreeItem {
  id: string
  label: string
  children?: TreeItem[]
}

const CLIENT_ITEM_ID = 'client:'

export const seriesId = ({ unit, type, address }: LogSeries): string => `${unit}|${type}|${address}`

const unitItemId = (uuid: string): string => `unit:${uuid}`

/** Register types in the order `RegisterTypeSchema` lists them, then addresses in order. */
const inGridOrder = (a: LogSeries, b: LogSeries): number =>
  RegisterTypeSchema.options.indexOf(a.type) - RegisterTypeSchema.options.indexOf(b.type) ||
  a.address - b.address

/**
 * The series of `held` by unit, each unit in the order its first series comes
 * and its series in grid order.
 */
const byUnit = (held: readonly LogSeries[]): Map<string, LogSeries[]> => {
  const units = new Map<string, LogSeries[]>()
  for (const series of held) units.set(series.unit, [...(units.get(series.unit) ?? []), series])
  for (const series of units.values()) series.sort(inGridOrder)
  return units
}

/**
 * The client, the units its log holds samples of, and those registers of
 * each, whether they log now or not. A unit removed since comes after the
 * others, its registers named by address and type alone, because its mapping
 * went with it. A register's id is its series; a unit's and the client's carry
 * a prefix no series starts with.
 */
export const exportTree = (
  clientName: string,
  units: readonly ClientUnit[],
  held: readonly LogSeries[]
): Required<TreeItem> => {
  const heldByUnit = byUnit(held)
  const known = units.flatMap((unit) => {
    const registers = heldByUnit.get(unit.uuid)
    if (!registers) return []
    return [
      {
        id: unitItemId(unit.uuid),
        label: `ID ${unit.unitId} · ${unit.name || 'Unnamed'}`,
        children: registers.map((register) => ({
          id: seriesId(register),
          label: `${register.address + Number(unit.addressBase)} · ${unit.registerMapping[register.type][register.address]?.comment || REGISTER_TYPE_LABELS[register.type]}`
        }))
      }
    ]
  })
  const knownUuids = new Set(units.map((unit) => unit.uuid))
  const removed = [...heldByUnit]
    .filter(([uuid]) => !knownUuids.has(uuid))
    .map(([uuid, registers]) => ({
      id: unitItemId(uuid),
      label: 'Removed unit',
      children: registers.map((register) => ({
        id: seriesId(register),
        label: `${register.address} · ${REGISTER_TYPE_LABELS[register.type]}`
      }))
    }))
  return {
    id: CLIENT_ITEM_ID,
    label: clientName || 'Unnamed client',
    children: [...known, ...removed]
  }
}

/** The ids of the client, of every unit `held` names, and of every series in it. */
export const exportTreeIds = (held: readonly LogSeries[]): string[] => [
  CLIENT_ITEM_ID,
  ...[...byUnit(held).keys()].map(unitItemId),
  ...held.map(seriesId)
]
