import requireBindable502 from './require-bindable-502'
import requireOpenablePorts from './require-openable-ports'

/**
 * What the machine has to provide before any spec is worth running.
 *
 * Both checks are Linux-only and both fail the same way when skipped: a spec
 * times out on something that looks like a broken selector, and the real cause
 * is one command away. Each says which one.
 */
export default function globalSetup(): void {
  requireBindable502()
  requireOpenablePorts()
}
