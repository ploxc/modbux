import { RegisterData, RegisterType, defaultClientState } from '@shared'
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
  staleSections: []
})

/**
 * What a selector reads for a uuid the store holds nothing under. One object
 * for the life of the module, so a selector reading through it answers the
 * same reference on every read, which is what zustand compares.
 */
const NO_DATA: ClientData = emptyClientData()

/** The same, for a section nothing was read into yet. */
const NO_SECTION: SectionData = { registerData: [], addressGroups: [] }

/** The data of the client under `uuid`. */
export const dataOf = (state: Pick<LiveZustand, 'clients'>, uuid: string): ClientData =>
  state.clients[uuid] ?? NO_DATA

/** The key a unit's register type is held under in `ClientData.sections`. */
export const sectionKey = (unit: string, type: RegisterType): string => `${unit}:${type}`

/** The rows and groups of one unit's register type on the client under `uuid`. */
export const sectionOf = (
  state: Pick<LiveZustand, 'clients'>,
  uuid: string,
  unit: string,
  type: RegisterType
): SectionData => dataOf(state, uuid).sections[sectionKey(unit, type)] ?? NO_SECTION

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
  address: number
): RegisterData | undefined => {
  const { registerData } = sectionOf(state, uuid, unit, type)
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
