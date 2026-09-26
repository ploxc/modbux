import { RegisterType, defaultClientState } from '@shared'
import { ClientData, LiveZustand, SectionData } from './live.zustand.types'

/** A client the live store has heard nothing about yet. */
export const emptyClientData = (): ClientData => ({
  sections: {},
  clientState: { ...defaultClientState },
  transactions: [],
  lastSuccessfulTransactionMillis: null,
  scanUnitIdResults: [],
  scanProgress: 0
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
