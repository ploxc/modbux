/**
 * What a pkexec fix answers, for both of the Linux helpers that run one.
 *
 * `privilegedPort.ts` and `serialGroup.ts` each held their own copy: two unions
 * a `diff` called identical, and two interfaces that differed by one optional
 * field. Neither said it was a copy.
 *
 * The port fix extends this with that field, because it re-reads what it wrote
 * (`readUnprivilegedPortStart` at `privilegedPort.ts:160`, after the command).
 * The group fix has nothing to re-read and takes the shape as it stands.
 */

/** Why a fix attempt did not go through. Read through `PkexecFixResult`. */
type PkexecFixFailure = 'cancelled' | 'unavailable' | 'failed' | 'unsupported'

export interface PkexecFixResult {
  ok: boolean
  /** Absent when `ok` is true. */
  reason?: PkexecFixFailure
  /** Human-readable outcome, safe to drop straight into a snackbar. */
  message: string
}
