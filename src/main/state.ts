import {
  ClientUnit,
  ConnectionConfig,
  RegisterConfig,
  DeepPartial,
  defaultConnectionConfig,
  defaultRegisterConfig
} from '@shared'
import merge from 'deepmerge'
import { isDeepStrictEqual } from 'util'

/**
 * The same value without the keys whose value is `undefined`.
 *
 * `deepPartial()` keeps a key the payload set to `undefined` and `deepmerge`
 * copies it over the stored one, so one explicit `undefined` leaves the config
 * holding a value its own schema refuses. Electron's structured clone carries
 * such a key across the IPC hop, so the schema cannot be the thing that stops
 * it.
 *
 * Neither config holds an array today. An array is handed back whole anyway,
 * because recursing into one would return its indices as an object and
 * deepmerge would never see an array again.
 */
export const withoutUndefined = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value

  const kept: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    kept[key] = withoutUndefined(item)
  }
  return kept as T
}

export class AppState {
  // Copies, because a field initialiser that names an export makes main's state
  // that export, until the first update replaces the tree.
  private _connectionConfig = structuredClone(defaultConnectionConfig)
  private _registerConfig = structuredClone(defaultRegisterConfig)
  private _units: ClientUnit[] = []
  private _readConfiguration = new Set<string>()
  private _readGenerations = new Map<string, number>()

  /**
   * How often what a read of `unit` is addressed to has changed.
   *
   * A read puts its requests on the wire under the unit id, the sections and
   * the mapping this state held when it started, and read configuration decides
   * whether the mapping or a section's window is what it asks for. Change one
   * of those while the read is in flight and the reply describes the old one,
   * so a read takes this number before its first request and drops what comes
   * back once it has moved.
   *
   * A unit's name, byte order and address base are not counted: they change
   * what the grid does with a read, not what this one asked the device.
   */
  readGeneration(unit: string): number {
    return this._readGenerations.get(unit) ?? 0
  }

  private _bump(unit: string): void {
    this._readGenerations.set(unit, this.readGeneration(unit) + 1)
  }

  /** The connection config `config` would leave, without leaving it. */
  public connectionConfigAfter(config: DeepPartial<ConnectionConfig>): ConnectionConfig {
    return merge<ConnectionConfig, DeepPartial<ConnectionConfig>>(
      this._connectionConfig,
      withoutUndefined(config)
    )
  }

  public updateConnectionConfig(config: DeepPartial<ConnectionConfig>): void {
    this._connectionConfig = this.connectionConfigAfter(config)
  }

  public updateRegisterConfig(config: DeepPartial<RegisterConfig>): void {
    this._registerConfig = merge<RegisterConfig, DeepPartial<RegisterConfig>>(
      this._registerConfig,
      withoutUndefined(config)
    )
  }

  /**
   * Replace the units, moving the read generation of each whose unit id,
   * sections or mapping changed, and of each that left. A unit that left is
   * out of read configuration too.
   */
  public setUnits(units: ClientUnit[]): void {
    const before = new Map(this._units.map((unit) => [unit.uuid, unit]))
    for (const unit of units) {
      const previous = before.get(unit.uuid)
      before.delete(unit.uuid)
      if (previous && isDeepStrictEqual(addressed(previous), addressed(unit))) continue
      this._bump(unit.uuid)
    }
    for (const left of before.keys()) {
      this._bump(left)
      this._readConfiguration.delete(left)
    }
    this._units = units
  }

  get connectionConfig(): ConnectionConfig {
    return this._connectionConfig
  }

  get registerConfig(): RegisterConfig {
    return this._registerConfig
  }

  get units(): ClientUnit[] {
    return this._units
  }

  /** The unit under `uuid`, or undefined for a uuid no unit has. */
  unit(uuid: string): ClientUnit | undefined {
    return this._units.find((unit) => unit.uuid === uuid)
  }

  public setReadConfiguration(unit: string, value: boolean): void {
    this._bump(unit)
    if (value) this._readConfiguration.add(unit)
    else this._readConfiguration.delete(unit)
  }

  readConfiguration(unit: string): boolean {
    return this._readConfiguration.has(unit)
  }
}

/** What a read of a unit is addressed to, the part `readGeneration` counts. */
const addressed = ({ unitId, sections, registerMapping }: ClientUnit): unknown => ({
  unitId,
  sections,
  registerMapping
})
