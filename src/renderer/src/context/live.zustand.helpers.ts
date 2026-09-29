import {
  AddressGroup,
  AddressGroupResult,
  RegisterData,
  RegisterMapping,
  RegisterType,
  configuredReadGroups,
  defaultClientState,
  groupPoll
} from '@shared'
import { ClientData, LiveZustand, SectionData } from './live.zustand.types'

/** A client the live store has heard nothing about yet. */
export const emptyClientData = (): ClientData => ({
  sections: {},
  clientState: { ...defaultClientState },
  transactions: [],
  lastSuccessfulTransactionMillis: null,
  scanUnitIdResults: [],
  scanProgress: 0,
  shownSections: [],
  monitorShown: false,
  staleSections: []
})

/**
 * What a selector reads for a uuid the store holds nothing under. One object
 * for the life of the module, so a selector reading through it answers the
 * same reference on every read, which is what zustand compares.
 */
const NO_DATA: ClientData = emptyClientData()

/** The same, for a section nothing was read into yet. */
const NO_SECTION: SectionData = { registerData: [], addressGroups: [], groupResults: [] }

/** The data of the client under `uuid`. */
export const dataOf = (state: Pick<LiveZustand, 'clients'>, uuid: string): ClientData =>
  state.clients[uuid] ?? NO_DATA

/**
 * The key a unit's register type is held under in `ClientData.sections`.
 * Monitor's reads are held under a key of their own, so switching back to
 * Debug shows Debug's rows rather than the groups Monitor read.
 */
export const sectionKey = (unit: string, type: RegisterType, monitor = false): string =>
  monitor ? `monitor:${unit}:${type}` : `${unit}:${type}`

/** The rows and groups of one unit's register type on the client under `uuid`. */
export const sectionOf = (
  state: Pick<LiveZustand, 'clients'>,
  uuid: string,
  unit: string,
  type: RegisterType,
  monitor = false
): SectionData => dataOf(state, uuid).sections[sectionKey(unit, type, monitor)] ?? NO_SECTION

/**
 * Each row list by address, built the first time a list is asked and kept
 * while that list lives. A list is replaced rather than changed, so the index
 * cannot go stale.
 */
const rowIndexes = new WeakMap<RegisterData[], Map<number, RegisterData>>()

/** The row read at `address` in one unit's register type, if there is one. */
export const rowAt = (
  state: Pick<LiveZustand, 'clients'>,
  uuid: string,
  unit: string,
  type: RegisterType,
  address: number,
  monitor = false
): RegisterData | undefined => {
  const { registerData } = sectionOf(state, uuid, unit, type, monitor)
  let index = rowIndexes.get(registerData)
  if (index === undefined) {
    index = new Map(registerData.map((row) => [row.id, row]))
    rowIndexes.set(registerData, index)
  }
  return index.get(address)
}

/**
 * What the grid's rows are made of when no value filter is set: the address,
 * whether a scan found it, and its group, one row a line. A string, so a
 * selector answering it compares equal while none of those change.
 */
const skeletons = new WeakMap<RegisterData[], string>()

export const skeletonOf = (registerData: RegisterData[]): string => {
  let skeleton = skeletons.get(registerData)
  if (skeleton === undefined) {
    skeleton = registerData
      .map(({ id, isScanned, groupIndex }) => `${id} ${isScanned ? 1 : 0} ${groupIndex ?? ''}`)
      .join('\n')
    skeletons.set(registerData, skeleton)
  }
  return skeleton
}

/** The groups of `type` whose Monitor Poll is off. */
const offGroups = (
  type: RegisterType,
  registerMapping: RegisterMapping | undefined
): AddressGroup[] =>
  configuredReadGroups(true, type, registerMapping).filter(
    (group) => groupPoll(type, registerMapping, group) === 'off'
  )

const inGroups = (address: number, groups: AddressGroup[]): boolean =>
  groups.some(([start, length]) => address >= start && address < start + length)

/**
 * The groups and results of a Monitor read, with the groups whose Poll is off
 * that the read left out kept as they were. A Monitor poll round reads only
 * the groups whose Poll is on, so what READ last showed of a group turned off
 * stays until the group is read again.
 */
export const withOffGroups = (
  previous: SectionData,
  type: RegisterType,
  registerMapping: RegisterMapping | undefined,
  addressGroups: AddressGroup[],
  groupResults: AddressGroupResult[]
): { addressGroups: AddressGroup[]; groupResults: AddressGroupResult[] } => {
  const off = offGroups(type, registerMapping)
  const kept = previous.addressGroups.map(
    ([start, length]) =>
      inGroups(start, off) &&
      !addressGroups.some(([address, size]) => address === start && size === length)
  )
  return {
    addressGroups: [...addressGroups, ...previous.addressGroups.filter((_, i) => kept[i])],
    groupResults: [...groupResults, ...previous.groupResults.filter((_, i) => kept[i])]
  }
}

/** The rows of a Monitor read, with the rows of the groups whose Poll is off kept, as `withOffGroups`. */
export const withOffRows = (
  previous: RegisterData[],
  type: RegisterType,
  registerMapping: RegisterMapping | undefined,
  registerData: RegisterData[]
): RegisterData[] => {
  const off = offGroups(type, registerMapping)
  const read = new Set(registerData.map(({ id }) => id))
  const kept = previous.filter(({ id }) => !read.has(id) && inGroups(id, off))
  if (kept.length === 0) return registerData
  return [...registerData, ...kept].sort((a, b) => a.id - b.id)
}
