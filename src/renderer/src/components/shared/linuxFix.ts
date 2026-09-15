import { useSnackbar } from 'notistack'

/**
 * What the two Linux modals share.
 *
 * The privileged port floor and the serial group are different problems with
 * the same shape: a check says the system is in the way, a modal shows the
 * pkexec command that fixes it, and a button runs it. Both asked the same two
 * questions of their status and reported the same result the same way, in two
 * copies that could drift.
 */

/** The half of a Linux status that decides whether a button can be offered. */
interface ElevationStatus {
  canElevate: boolean
  sandbox?: 'flatpak' | 'snap'
}

/**
 * Why Modbux cannot run the command itself, or null when it can.
 *
 * `whatItChanges` completes "so it cannot change ... itself", which is the only
 * word the two modals differ in.
 */
export const blockedReason = (
  status: ElevationStatus | null,
  whatItChanges: string
): string | null => {
  if (!status) return null
  if (status.sandbox) {
    const name = status.sandbox === 'flatpak' ? 'Flatpak' : 'Snap'
    return `Modbux is running inside ${name}, so it cannot change ${whatItChanges} itself.`
  }
  if (!status.canElevate) {
    return 'pkexec is not installed, so Modbux cannot ask for permission itself.'
  }
  return null
}

/** What a fix channel answers, and what the boundary answers when it refuses. */
interface FixResult {
  ok: boolean
  message: string
}

/** What `useSnackbar` hands back, so this takes exactly what a component has. */
type EnqueueSnackbar = ReturnType<typeof useSnackbar>['enqueueSnackbar']

/**
 * Reports what a fix command said and answers whether it worked.
 *
 * `undefined` is the boundary refusing the payload, which has already sent its
 * own message. Saying so twice helps nobody.
 */
export const reportFixResult = (
  result: FixResult | undefined,
  enqueueSnackbar: EnqueueSnackbar
): boolean => {
  if (!result) return false
  enqueueSnackbar({ message: result.message, variant: result.ok ? 'success' : 'warning' })
  return result.ok
}
