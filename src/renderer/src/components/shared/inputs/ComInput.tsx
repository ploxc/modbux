import { IMaskInput } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

/**
While the majority of serial port names follow the patterns discussed (e.g., `COMx` on Windows and `/dev/tty...` or `/dev/cu...` on Unix-based systems like Linux and macOS), there are a few additional possibilities depending on specialized devices, drivers, or configurations.

### Windows
- **COM ports**: `COMx` where `x` is a number (e.g., `COM1`, `COM10`). Windows reserves `COM1` to `COM9` by default, but `COM10` and higher are valid.
- **Advanced/Custom Names**: On some systems, it is possible to encounter port names like `\\.\COMx` (with the `\\.\` prefix). This syntax is used to access COM ports with numbers greater than 9 or when a more precise path is required in some programming APIs.

### Linux/macOS (Unix-like systems)
- **Standard serial ports**: `/dev/ttySx` where `x` is a number (e.g., `/dev/ttyS0`, `/dev/ttyS1`).
- **USB-to-serial converters**: `/dev/ttyUSBx` for USB serial devices (e.g., `/dev/ttyUSB0`).
- **Bluetooth serial ports**: `/dev/rfcommx` for Bluetooth serial devices (e.g., `/dev/rfcomm0`).
- **macOS specific**: `/dev/cu.usbserial-xxxx` or `/dev/tty.usbserial-xxxx` for USB serial devices.
- **Pseudo terminals**: `/dev/pts/x` are used for pseudo-terminal devices on Unix-like systems.

### Special Cases
- **Named Pipes (Windows)**: Occasionally, you might see virtual serial ports that communicate over named pipes in the form of `\\.\pipe\...`.
- **Serial-over-Ethernet**: In rare cases, virtual COM port drivers can map a COM port to an IP address using names like `\\.\COMx` or even `tcp://hostname:port`.

### Updated Regex for All Scenarios:
Considering these additional possibilities, an updated regex would be:

```regex
^(COM[0-9]+|\\\\\.\\COM[0-9]+|/dev/(ttyS[0-9]+|ttyUSB[0-9]+|cu\.[\w.-]+|rfcomm[0-9]+|pts/[0-9]+))$
```

### Explanation:
- `^`: Start of the string.
- `COM[0-9]+`: Matches standard Windows COM ports.
- `\\\\\.\\COM[0-9]+`: Matches the extended Windows COM port format used for ports numbered 10 and higher.
- `/dev/`: For Unix-based systems.
  - `ttyS[0-9]+`: Matches standard serial ports (`/dev/ttyS0`, `/dev/ttyS1`, etc.).
  - `ttyUSB[0-9]+`: Matches USB serial devices (`/dev/ttyUSB0`, `/dev/ttyUSB1`, etc.).
  - `cu\.[\w.-]+`: Matches macOS USB serial devices (`/dev/cu.usbserial-xxxx`).
  - `rfcomm[0-9]+`: Matches Bluetooth serial devices (`/dev/rfcomm0`).
  - `pts/[0-9]+`: Matches pseudo-terminal devices (`/dev/pts/0`, `/dev/pts/1`, etc.).
- `$`: End of the string.

This regex should cover the most common and specialized cases across all platforms.
 */
const comValidation =
  /^(COM[0-9]+|\\\\\.\\COM[0-9]+|\/dev\/(ttyS[0-9]+|ttyUSB[0-9]+|cu\.[\w.-]+|rfcomm[0-9]+|pts\/[0-9]+))$/

const ComInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      mask={/^[\w/.-]+$/}
      inputRef={ref}
      onAccept={(value) => {
        set(value, comValidation.test(value))
      }}
    />
  )
})

export default ComInput
