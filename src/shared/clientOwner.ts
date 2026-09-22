import type { ClientState } from './types'

/** How a caller asks about the poll a scan stops rather than is refused by. */
export interface ClientOwnerQuestion {
  /**
   * Leave a poll out of the answer.
   *
   * `scanUnitIds` and `scanRegisters` stop a poll on their way in, so a poll
   * is not what refuses them, and the two Start buttons say Start rather than
   * greying while one runs.
   */
  exceptPolling?: boolean
}

/**
 * Whatever owns the Modbus client, named, or nothing.
 *
 * One request at a time is what the client can promise, and every caller that
 * puts one on the wire asks this first. A write holds the client from its own
 * request to the end of the read back, so `writing` covers a stretch in which
 * `reading` is set too, and a caller arriving in it is told about the write.
 *
 * Here rather than in `modbusClient`, because the question was spelled out in
 * four places and three of them were different subsets: main named five
 * states, `readWhenMainCan` named the same five, `ReadButton` named the
 * connect state plus three, and `RegisterConfig` named two. Nothing was wrong
 * at the time, because a register scan draws its dialog over the config bar
 * and a unit id scan draws a backdrop over the window, which is layout rather
 * than a guard. Main refuses what it cannot allow; this is what lets a control
 * grey for the same reason rather than for a subset of it.
 *
 * The name is read into a sentence, `Cannot ${verb} during ${owner}`, so it
 * carries its own article.
 */
export const clientOwner = (
  clientState: ClientState,
  { exceptPolling = false }: ClientOwnerQuestion = {}
): string | undefined => {
  if (clientState.writing) return 'another write'
  if (!exceptPolling && clientState.polling) return 'a poll'
  if (clientState.scanningUnitIds) return 'a unit id scan'
  if (clientState.scanningRegisters) return 'a register scan'
  if (clientState.reading) return 'another read'
  return undefined
}

/**
 * The read loop that owns the client, named, or nothing.
 *
 * Each of the three loops decides for itself when it is done, which is what
 * separates them from a single read: a write reads back what it wrote unless a
 * loop is already reading, and that is this question rather than `clientOwner`.
 */
export const readLoopOwner = (clientState: ClientState): string | undefined => {
  if (clientState.polling) return 'a poll'
  if (clientState.scanningUnitIds) return 'a unit id scan'
  if (clientState.scanningRegisters) return 'a register scan'
  return undefined
}
