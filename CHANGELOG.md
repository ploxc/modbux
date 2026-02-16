# Changelog

All notable changes to Modbux will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - Unreleased

### Added

- **Three new register data types:**
  - **UTF-8 strings:** Store text values across multiple registers (1-124 registers)
    - String input field with real-time byte counter to prevent overflow
    - Register length selector to specify how many registers to use
  - **Unix timestamps:** Store and display timestamps as seconds since epoch
    - Displayed in human-readable format (e.g., 2025/02/16 14:30:45)
    - Toggle between UTC and local time display
  - **Datetime (IEC 870-5):** Industry-standard datetime format for SCADA systems
    - DateTime picker for easy timestamp entry with UTC toggle
    - Displayed in human-readable format

- **Time-based value generators for Unix and Datetime types:**
  - Registers automatically update to current system time at configured intervals
  - Useful for simulating real-time devices and testing timestamp handling

### Changed

- **Endianness is now a global server setting** instead of per-register configuration
  - More intuitive: byte order is a device property, not a register property
  - Endian toggle moved from "Add Register" modal to server toolbar
  - Switching endianness live re-syncs all registers with the backend
  - Client configuration remains unchanged (global per connection)

- **Config files now include version metadata** for better backward compatibility
  - Server configs now include `version`, `modbuxVersion`, and `littleEndian` fields
  - Client configs now include `version` and `modbuxVersion` fields
  - Old configurations are **automatically migrated** when loaded (no user action required)

- **Improved backward compatibility handling**
  - Automatic migration of v1 configs to v2 format
  - Detection and handling of mixed endianness scenarios (shows warning)
  - Forward compatibility: configs from newer Modbux versions show warning but attempt to load
  - localStorage state is automatically migrated on app startup

### Fixed

- **Client polling now resumes on reconnect** — when the connection drops and auto-reconnects, polling continues automatically instead of silently stopping
- **Client register config state preserved** — `readConfiguration` is no longer reset on navigation or client load.

### Migration Notes

- **Automatic migration:** Old configs (pre-v1.5.0) are auto-migrated when loaded
- **No data loss:** All register configurations are preserved during migration
- **Mixed endianness warning:** If a v1 config had registers with different byte orders, the most common setting is used globally with a warning notification
- **Backward incompatibility:** Configs saved in v1.5.0+ cannot be opened in older Modbux versions
  - This is intentional to enable the improved architecture
  - Keep backups of configs if you need to downgrade

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
