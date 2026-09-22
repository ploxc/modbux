import { BackendMessage, humanizeSerialError } from '@shared'
import ModbusRTU from 'modbus-serial'

/** What a failed enumeration says, which is the client's `_emitMessage`. */
type EmitMessage = (message: BackendMessage) => void

/**
 * The serial ports this machine has, as the RTU fields list them.
 *
 * `ModbusRTU.getPorts` is static, so neither of these reads a connection. They
 * answer for the server window's COM field as well as the client's, which is
 * why `list_serial_ports` and `validate_serial_port` are not refused from it.
 */
export const listSerialPorts = async (
  emitMessage: EmitMessage
): Promise<{ path: string; manufacturer?: string }[]> => {
  try {
    const ports = await ModbusRTU.getPorts()
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? undefined
    }))
  } catch (error) {
    const message = humanizeSerialError(error as Error)
    emitMessage({ message, variant: 'error', error })
    return []
  }
}

/** Whether a path is one of the ports, compared without case. */
export const validateSerialPort = async (
  portPath: string,
  emitMessage: EmitMessage
): Promise<{ valid: boolean; message: string }> => {
  try {
    const ports = await ModbusRTU.getPorts()
    const found = ports.some((port) => port.path.toLowerCase() === portPath.toLowerCase())
    return {
      valid: found,
      message: found
        ? `Port "${portPath}" is available`
        : `Port "${portPath}" was not found in available ports`
    }
  } catch (error) {
    const message = humanizeSerialError(error as Error, portPath)
    emitMessage({ message, variant: 'error', error })
    return { valid: false, message }
  }
}
