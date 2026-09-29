/** Debug configures and writes one unit at a time; Monitor reads the read configuration of every unit. */
export type ClientViewMode = 'debug' | 'monitor'

export interface ClientViewZustand {
  view: ClientViewMode
  setView: (view: ClientViewMode) => void
}
