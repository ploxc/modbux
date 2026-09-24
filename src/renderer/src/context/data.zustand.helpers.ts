import { defaultClientState } from '@shared'
import { ClientData, DataZustand } from './data.zustand.types'

/** A client the data store has heard nothing about yet. */
export const emptyClientData = (): ClientData => ({
  registerData: [],
  addressGroups: [],
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

/** The data of the client under `uuid`. */
export const dataOf = (state: Pick<DataZustand, 'clients'>, uuid: string): ClientData =>
  state.clients[uuid] ?? NO_DATA
