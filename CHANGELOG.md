# Changelog

All notable changes to Modbux will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
