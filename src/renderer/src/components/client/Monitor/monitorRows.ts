import {
  AddressGroup,
  ClientUnit,
  RegisterType,
  configuredReadGroups,
  isConfiguredAddress
} from '@shared'

/** The order Monitor lists a unit's register types in. */
const MONITOR_TYPES: readonly RegisterType[] = [
  'holding_registers',
  'input_registers',
  'coils',
  'discrete_inputs'
]

/** A group's head: the unit, the type and the range one request reads. */
export interface MonitorHeadRow {
  kind: 'head'
  id: string
  unit: string
  type: RegisterType
  group: AddressGroup
}

/** One configured address under its group's head. */
export interface MonitorRegisterRow {
  kind: 'register'
  id: string
  unit: string
  type: RegisterType
  address: number
  group: AddressGroup
}

export type MonitorRow = MonitorHeadRow | MonitorRegisterRow

/** The key a group is folded under, unique across the client's units. */
export const groupKey = (unit: string, type: RegisterType, [start, length]: AddressGroup): string =>
  `${unit}|${type}|${start}|${length}`

/**
 * Every group of every unit, each head followed by its configured addresses,
 * unless the group is folded. The groups are the ones read configuration
 * reads, so a head is one request.
 */
export const monitorRows = (
  units: readonly ClientUnit[],
  folded: Readonly<Record<string, true>>
): MonitorRow[] => {
  const rows: MonitorRow[] = []
  for (const unit of units) {
    for (const type of MONITOR_TYPES) {
      const mapping = unit.registerMapping[type]
      for (const group of configuredReadGroups(true, type, unit.registerMapping)) {
        const key = groupKey(unit.uuid, type, group)
        rows.push({ kind: 'head', id: key, unit: unit.uuid, type, group })
        if (folded[key]) continue
        const [start, length] = group
        const addresses = Object.keys(mapping)
          .map(Number)
          .filter((address) => address >= start && address < start + length)
          .filter((address) => isConfiguredAddress(type, mapping[address]))
          .sort((a, b) => a - b)
        for (const address of addresses) {
          rows.push({
            kind: 'register',
            id: `${unit.uuid}|${type}|${address}`,
            unit: unit.uuid,
            type,
            address,
            group
          })
        }
      }
    }
  }
  return rows
}

/** The keys of every group, which Collapse all folds. */
export const allGroupKeys = (units: readonly ClientUnit[]): string[] =>
  units.flatMap((unit) =>
    MONITOR_TYPES.flatMap((type) =>
      configuredReadGroups(true, type, unit.registerMapping).map((group) =>
        groupKey(unit.uuid, type, group)
      )
    )
  )
