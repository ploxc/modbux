# Changelog

All notable changes to Modbux will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Linux: Modbux offers to unblock port 502 for you.** Linux keeps the low
  ports for root. The Modbus default sits in that range, so the server started
  somewhere else and clients looking for 502 found nothing. Modbux now reads
  the kernel setting when the server view opens and says what is in the way. It
  offers to run the one sysctl that lowers the floor, until reboot or for good.
  You see the command before it runs, and the elevation goes through PolicyKit,
  so you approve it yourself and Modbux never sees your password. Inside
  Flatpak or Snap it hands you the command instead.
- **A button that clears the filters you set.** It sits next to RAW in the
  client toolbar and shows up only while a filter is on, so a filter left behind
  no longer reads as missing data.
- **The grid fills while a register scan runs.** It used to disappear for the
  length of the scan, leaving a progress bar and no sign of what was coming in.
  It stays up now and the rows arrive as the scan walks the range. They are
  written in batches, so the grid costs nothing: the same scan took eight times
  longer with the grid up before this, and the window stopped answering while
  it ran. You can scroll and page through it while it fills, but not edit it:
  the rows are still arriving, and the toolbar and the transaction log step
  aside for the same reason. Starting a scan turns advanced mode on, since a
  scan walks raw addresses, and the dialog stays open when the scan ends rather
  than closing to reveal what you were already watching. The eye beside the
  scan button puts it all back the old way.
- **A scan says how many it found.** The grid shows the first rows, not the
  total, so the count sits beside the scan button. The unit ID scan counts the
  units that answered, since its results list every unit it asked.

### Changed

- **Only the columns worth filtering still offer a filter.** Addr., Bit and BIN
  lost theirs: a filter over an address or a row of LEDs answers nothing anyone
  asks. HEX and the value columns keep theirs, because a status word or a fault
  code from the manual is often exactly what you are hunting for.
- **Reading a configuration turns filtering off.** That mode already hides the
  rows without a data type, and a filter of your own could fight it or take it
  away from the column menu, leaving the list full of empty rows.
- **A scan dialog no longer closes when you click beside it.** Reaching for
  anything behind it threw away the scan you were setting up. It has a close
  button now, off while a scan runs, and Escape still works.

### Fixed

- **Disconnecting no longer reports an error.** Clicking Disconnect raised
  "Connection closed unexpectedly" next to "Disconnected from server". The close
  event comes back while the disconnect is still finishing, and the flag marking
  it as deliberate was set too late to be read. That same stale flag then
  suppressed the next close that really was unexpected. Both are fixed, over
  serial and over TCP.
- **A reply that arrives in two pieces is no longer read as an error.** A Modbus
  TCP response does not always land in one packet, and the half that had come in
  was parsed as if it were the whole. Gateways on a slow or busy link are where
  this shows.
- **The coils and discrete inputs lists scroll inside their own panel.** A long
  list used to grow past the server view, and the whole view scrolled
  underneath it instead.
- **A scan no longer stops on the log it writes.** Scanning over a serial port
  could end partway with nothing on screen to say why. Modbux keeps a copy of
  every request and reply for the transaction log, and a request that had no
  copy took the scan down with it. That case now logs an empty frame.
- **The scan timeout keeps what you type.** Clearing the field and typing 500
  left 10000 behind. A value outside 100 to 10000 is corrected when you leave
  the field instead of while you are still typing.

### Security

- **The Linux AppImage is built by a version that fixes GHSA-7g7r-gx96-252g.**
  The advisory is about search path elements inside the AppImage that
  electron-builder produces, so it travels in the artefact rather than staying
  on the build machine.

## [2.2.1] - 2026-08-07

### Fixed

- **You can see which transport you are connected over.** RTU over TCP reuses
  the TCP host and port and keeps the TCP button selected, so nothing told the
  two apart. Now the connect message names it, and the TCP button and the
  checkbox in the cog menu both turn orange while it is on.
- **The register grid no longer sorts.** A 32-bit value keeps its second half
  in the next register, so reordering the rows pulled the halves apart and every
  value on screen became wrong. Filtering is unaffected.

### Changed

- **The download is less than half the size** — 170 MB → 82 MB on Windows,
  225 MB → 108 MB on macOS. The installer was carrying the entire build
  toolchain plus a second, unused copy of Electron.

## [2.2.0] - 2026-08-06

### Added

- **RTU over TCP client mode** — connect to serial-to-Ethernet gateways that carry
  encapsulated RTU (a full RTU frame with CRC sent over a TCP socket)
  - Enabled via a checkbox in the ⚙ options menu, shown only when TCP is selected
  - Reuses the TCP host/port inputs and the unit ID field

## [2.1.0] - 2026-03-14

### Added

- **RTU server mode** — new TCP/RTU toggle lets the server expose registers over a serial port
  - COM port autocomplete with refresh, baud rate, parity, data bits, and stop bits
  - Status indicator with click-to-reconnect
  - Switching between TCP and RTU preserves all register data
  - All register types, value generators, and booleans work the same as TCP

- **Hostname/IP support for TCP client** — connection config now accepts any hostname or IP address instead of only `localhost`

- **Linux support** — verified builds and packaging for Linux (`.deb`, `.AppImage`)
  - Privileged port errors (EACCES on port 502) handled gracefully with clear error messages
  - Linux icon path configured for correct app icons
  - README updated with Linux-specific setup notes (unprivileged ports, serial `dialout` group)

---

## [2.0.0] - 2026-02-24

### Added

- **Bitmap data type** for both client and server registers
  - Client: expandable detail panel showing all 16 bits with toggle indicators, inline comments, per-bit color (default/warning/error), and invert option
  - Server: per-bit toggle circles that update the underlying uint16 register value
  - Bitmap configuration persists in config files via `registerMapping`

- **Redesigned server booleans** (coils & discrete inputs)
  - Individual address rows with toggle circles and inline editable comments
  - Inline add bar with auto-increment to the next free address
  - Per-boolean delete with hover-to-reveal trash icon and red row highlight

- **Three new server register data types:**
  - **UTF-8 strings:** Store text values across multiple registers (1-124 registers) with real-time byte counter
  - **Unix timestamps:** Store and display timestamps as seconds since epoch
  - **Datetime (IEC 870-5):** Industry-standard datetime format for SCADA systems

- **Time-based value generators** for Unix and Datetime types
  - Registers automatically update to current system time at configured intervals

- **DateTimePicker with UTC toggle** for setting Unix/datetime values in fixed mode
  - UTC toggle only changes the display — the register value is always encoded in UTC

- **`Read configuration` improvements**
  - Group index column ("G") showing which read group each register belongs to with alternating background tints
  - Read errors displayed inline as styled error rows instead of snackbar notifications

- **Endianness included in client config export/import** — `littleEndian` now persists in client config JSON files

### Changed

- **Endianness is now a global server setting** instead of per-register configuration
  - Endian toggle moved from "Add Register" modal to server toolbar

- **Config files now include version metadata** for backward compatibility
  - Server configs: `version`, `modbuxVersion`, `littleEndian` fields
  - Client configs: `version`, `modbuxVersion` fields
  - Old configurations are **automatically migrated** when loaded

- **`Read configuration` replaces `View Configuration` button** — the separate `View Configuration` button is removed; its functionality is merged into the `Read configuration` toggle

- **Scan dialogs use address + length** instead of min/max range inputs, with a shared address base toggle component

- **Address base simplified** — the conventional address column (40001/30001 style) is removed; the 0/1 toggle now shifts displayed addresses by +1 while the underlying register address stays the same

- **Backward compatibility handling**
  - Automatic migration of v1 configs to v2 format
  - Detection and handling of mixed endianness scenarios (shows warning)
  - Forward compatibility: configs from newer versions show warning but attempt to load
  - localStorage state is automatically migrated on app startup

### Fixed

- **Off-by-one in server register arrays** — address 65535 now works correctly (arrays are 65536 elements instead of 65535)
- **Register not removed from mapping when set to "none"** — `Read configuration` toggle now correctly disables when no registers are configured
- **UTF-8 value column offset** — string values after non-ASCII registers now display correctly
- **Client polling resumes on reconnect** — polling continues automatically after connection drops
- **Windows e2e compatibility** — splash window now has a distinct title for reliable main window detection

### Migration Notes

- **Automatic migration:** Old configs (pre-v2.0.0) are auto-migrated when loaded
- **Mixed endianness warning:** If a v1 config had registers with different byte orders, the most common setting is used globally with a warning notification
- **Backward incompatibility:** Configs saved in v2.0.0+ cannot be opened in older Modbux versions
  - This is intentional to enable the improved architecture
  - Keep backups of configs if you need to downgrade
- **`datetime` register length corrected** from 2 to 4 registers (IEC 870-5 standard)

---

## [1.4.2] - 2026-02-20

### Fixed

- Multi-register data types (int32/float/int64/double) not fully cleared on removal — all occupied registers are now reset, not just the start address

---

## [1.4.1] - 2025-01-15

### Fixed

- Windows build and E2E test compatibility
- Critical coil/discrete input bug
- AddRegister UX improvements

### Added

- Update notification banner
- Comprehensive E2E tests

---

_For older versions, see git history_
