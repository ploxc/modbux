import { Windows } from '../../windows'

/**
 * A server message goes to the window showing the server, which in split view
 * is the popped out one. Broadcasting put "A server needs a port between 1 and
 * 65535" in the window on the client view and in the one that asked.
 */
export const emitServerMessage = (
  windows: Windows,
  {
    message,
    variant,
    error
  }: {
    message: string
    variant: 'default' | 'error' | 'success' | 'warning' | 'info'
    error?: Error
  }
): void => {
  windows.send('backend_message', { message, variant, error }, 'serverView')
}
