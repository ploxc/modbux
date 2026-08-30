import type { Page } from '@playwright/test'
import { SerialPort } from 'serialport'

/**
 * USB vendor IDs that count as "the Arduino running iem3000.ino".
 *
 * Only the two genuine ones. A clone board presents the VID of whatever USB
 * bridge it carries -- 1a86 for a CH340, 0403 for an FTDI -- and those chips
 * sit on hundreds of unrelated adapters, so matching them would let the suite
 * pick up a random dongle and read nonsense off it. Add one here if you use a
 * clone; the failure message below prints what it saw, so you know what to add.
 */
export const ARDUINO_VENDOR_IDS = ['2341', '2a03']

export type PortChoice = { port: string; reason?: undefined } | { port?: undefined; reason: string }

/**
 * The Arduino's serial port, or why there isn't one.
 *
 * Replaces the page.pause() these specs used to open, which needed a person to
 * pick the port by hand and so kept the hardware round out of the unattended
 * suites. The vendor ID is what identifies the board: `manufacturer` reads
 * "Microsoft" on Windows, where the generic usbser driver claims the device.
 *
 * Returns a reason rather than throwing, so the caller decides between skipping
 * the suite and failing it.
 */
export async function findArduinoPort(): Promise<PortChoice> {
  const ports = await SerialPort.list()
  const matches = ports.filter((p) => ARDUINO_VENDOR_IDS.includes((p.vendorId ?? '').toLowerCase()))

  if (matches.length === 1) return { port: matches[0].path }

  const seen = ports.length
    ? ports.map((p) => `${p.path} (vid ${p.vendorId ?? '?'})`).join(', ')
    : 'no serial ports at all'

  if (matches.length === 0) {
    return { reason: `No Arduino on any serial port. Saw: ${seen}` }
  }

  // Two boards is not a machine to guess on: picking the wrong one reads
  // registers off something that was never programmed with iem3000.ino, and
  // the failure would land on a value assertion far from the cause.
  return {
    reason: `${matches.length} Arduinos connected, expected 1: ${matches
      .map((p) => p.path)
      .join(', ')}`
  }
}

/**
 * Type the port into the COM input.
 *
 * The field is a freeSolo Autocomplete, so setting the text is enough -- there
 * is no need to refresh the list first and pick the option out of it.
 */
export async function selectComPort(p: Page, port: string): Promise<void> {
  await p.getByTestId('rtu-com-input').locator('input').fill(port)
}
