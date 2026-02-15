# Changelog

All notable changes to Modbux will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - Unreleased

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
- **Client register config state preserved** — `readConfiguration` is no longer reset on navigation or client load, preventing loss of user settings

### Improved

- Extracted `getRegisterLength` to shared utilities for reuse across frontend and backend
- Extracted server register sync helpers for cleaner state management

### Technical Details

- Config schema version: v1 → v2
- `RegisterParams.littleEndian` removed → now `ServerConfig.littleEndian` (global)
- Migration framework with sequential migration pattern for future updates
- Comprehensive test coverage (18 migration tests + E2E endianness round-trip tests)

### Migration Notes

- **Automatic migration:** Old configs (pre-v1.5.0) are auto-migrated when loaded
- **No data loss:** All register configurations are preserved during migration
- **Mixed endianness warning:** If a v1 config had registers with different byte orders, the most common setting is used globally with a warning notification
- **Backward incompatibility:** Configs saved in v1.5.0+ cannot be opened in older Modbux versions
  - This is intentional to enable the improved architecture
  - Keep backups of configs if you need to downgrade

### For Developers

- New migration framework in `src/shared/configMigration.ts`
- Zustand persist middleware now includes version-based migration
- Test fixtures for v1/v2 configs in `src/shared/__tests__/__fixtures__/`

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
