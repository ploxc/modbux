import type { ZodError, ZodIssue } from 'zod'
import { RegisterAddressKeySchema } from '../types/ranges'
import { RegisterParamsSchema } from '../types/server'
import { ParitySchema } from '../types'
import { getUsedAddresses } from '../utils'

/**
 * Replace a stored parity that `ParitySchema` no longer names, at `path` from
 * the root of a persisted blob.
 *
 * `mark` and `space` were offered until they were measured against the POSIX
 * serial binding, so a config written before that carries one. `repairPersisted`
 * works a top level field at a time, and without this the stored `mark` costs
 * the user the com port and the baud rate sitting beside it.
 */
export function repairPersistedParity(state: Record<string, unknown>, ...path: string[]): void {
  let options: unknown = state
  for (const key of path) {
    if (typeof options !== 'object' || options === null) return
    options = (options as Record<string, unknown>)[key]
  }
  if (typeof options !== 'object' || options === null) return

  const serialOptions = options as Record<string, unknown>
  if (serialOptions.parity === undefined) return
  if (ParitySchema.safeParse(serialOptions.parity).success) return

  serialOptions.parity = 'none'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The object entries of `value`, and nothing at all when it is not an object. */
const recordEntries = (value: unknown): [string, Record<string, unknown>][] =>
  isRecord(value)
    ? Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] =>
        isRecord(entry[1])
      )
    : []

/** The object values of `value`, and nothing at all when it is not an object. */
export const objectValues = (value: unknown): Record<string, unknown>[] =>
  recordEntries(value).map(([, entry]) => entry)

/** The object at `parent[key]`, made empty when there is not one there. */
const recordAt = (parent: Record<string, unknown>, key: string): Record<string, unknown> => {
  const existing = parent[key]
  if (isRecord(existing)) return existing
  const made: Record<string, unknown> = {}
  parent[key] = made
  return made
}

/**
 * A register map is keyed by address, and a register entry repeats its whole
 * parameter set, so both have to hold for the entry to be servable. A boolean
 * entry carries the key alone.
 */
const isServable = (address: string, entry: Record<string, unknown>): boolean => {
  if (!RegisterAddressKeySchema.safeParse(address).success) return false
  const params = entry.params
  if (!isRecord(params)) return true
  return RegisterParamsSchema.safeParse(params).success
}

/** The addresses one unit's surviving registers occupy, by register type. */
const usedAddressesOfUnit = (
  registersByType: Record<string, unknown>
): Record<string, number[]> => {
  const used: Record<string, number[]> = {}
  for (const registerType of ['input_registers', 'holding_registers'] as const) {
    const params = objectValues(registersByType[registerType])
      .map((entry) => RegisterParamsSchema.safeParse(entry.params))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    used[registerType] = getUsedAddresses(params)
  }
  return used
}

/**
 * Drop persisted registers the current `RegisterParamsSchema` no longer names.
 *
 * Two rules arrived after registers had already been persisted against looser
 * ones. `RegisterParamsBasePartSchema.address` was a bare number, so a config
 * file could put a register at 70000. `interval` was a bare number, so one
 * could carry a generator that fires every millisecond. `repairPersisted`
 * works a top level field at a time, and without this one such register costs
 * every register on every server and every unit.
 *
 * A unit the drop touched gets its `usedAddresses` rewritten, because that map
 * is persisted beside the registers and the only thing recomputing it on launch
 * is `syncUuidToBackend`, for a unit that still holds something. What survived
 * without this was a unit the drop emptied, which `extractUnitIdsWithData`
 * skips, and every unit of a server whose port `createServer` refuses. Measured
 * on a v4 blob: a generator at 200 the interval floor refuses left
 * `holding_registers: [200]` standing in both, and `isAddressInUse` is what
 * reads that map.
 */
export function dropUnservableRegisters(state: Record<string, unknown>): void {
  for (const [uuid, registersPerUnit] of recordEntries(state.serverRegisters)) {
    for (const [unitId, registersByType] of recordEntries(registersPerUnit)) {
      let dropped = false
      for (const entriesByAddress of objectValues(registersByType)) {
        for (const [address, entry] of Object.entries(entriesByAddress)) {
          if (isRecord(entry) && isServable(address, entry)) continue
          delete entriesByAddress[address]
          dropped = true
        }
      }
      if (!dropped) continue
      recordAt(recordAt(state, 'usedAddresses'), uuid)[unitId] =
        usedAddressesOfUnit(registersByType)
    }
  }
}

/**
 * Drop persisted mapping entries at an address outside the 16 bit map.
 *
 * `RegisterMapObjectSchema`'s key refine was `!isNaN(Number(v))` until it was
 * measured, so a config file loaded before that could map `''`, `'1e5'`,
 * `'-1'` or `'Infinity'` and the store persisted it. `repairPersisted` works a
 * top level field at a time, and without this one such entry costs the whole
 * mapping, which is the one thing in the client store built by hand.
 */
export function dropUnmappableRegisters(state: Record<string, unknown>): void {
  for (const entriesByAddress of objectValues(state.registerMapping)) {
    for (const address of Object.keys(entriesByAddress)) {
      if (RegisterAddressKeySchema.safeParse(address).success) continue
      delete entriesByAddress[address]
    }
  }
}

/**
 * Convert one unit's old `boolean` bool entries to `{ value: boolean }`.
 *
 * Two callers walk to a unit's registers by different routes: a config file
 * through `serverRegistersPerUnit[unit]`, the persisted store through
 * `serverRegisters[uuid][unit]`. Only that walk differed, and the work below it
 * was written out twice.
 */
export function migrateBoolShapeForUnit(unitRegisters: unknown): void {
  if (!isRecord(unitRegisters)) return

  for (const boolType of ['coils', 'discrete_inputs'] as const) {
    const boolRecord = unitRegisters[boolType]
    if (!isRecord(boolRecord)) continue

    for (const [address, entry] of Object.entries(boolRecord)) {
      if (typeof entry === 'boolean') boolRecord[address] = { value: entry }
    }
  }
}

const LEGACY_REGISTER_TYPE_KEYS: Record<string, string> = {
  Coils: 'coils',
  DiscreteInputs: 'discrete_inputs',
  InputRegisters: 'input_registers',
  HoldingRegisters: 'holding_registers'
}

/**
 * Rename the register type keys a config from before `b3474fe` carries.
 *
 * `RegisterType` was an enum of camelCase members until that commit, and its
 * members were the keys of the register map, so a config saved earlier names
 * them that way. Versioned configs arrived at `b4f558b`, eight months later,
 * which is why only the v1 migrations call this.
 *
 * A key is the only thing renamed. The four names read as ordinary English, so
 * running them over the file text instead rewrote a config name and any comment
 * carrying one of them.
 */
export function renameLegacyRegisterTypeKeys(value: unknown): void {
  if (!isRecord(value)) return
  for (const [key, entry] of Object.entries(value)) {
    renameLegacyRegisterTypeKeys(entry)
    const currentName = LEGACY_REGISTER_TYPE_KEYS[key]
    if (currentName === undefined) continue
    value[currentName] = entry
    delete value[key]
  }
}

/**
 * The branch a union came closest to matching, which is the one with the fewest
 * issues. Every branch together is the seed, so a union with no branches at all
 * reports nothing rather than being reached for.
 */
const nearestBranch = (branches: ZodIssue[][]): ZodIssue[] =>
  branches.reduce(
    (fewest, issues) => (issues.length < fewest.length ? issues : fewest),
    branches.flat()
  )

/**
 * What a union that matched nothing was actually refused for.
 *
 * Zod reports one `invalid_union` at the union's own path, reading
 * `Invalid input`, and keeps what each branch said in `unionErrors`.
 * `RegisterParamsSchema` is a union of a generator and a fixed value, so a
 * register carrying both a `value` and a leftover `min` fitted neither and was
 * refused without a field being named.
 *
 * Only the nearest branch is reported. Every branch spent the whole five line
 * budget on one register, so a second bad register was named by one field and a
 * bad unit id after it was not named at all, and a `params` that is not an
 * object at all printed the same sentence once per branch. `write_register`
 * reaches this through `main/ipc.ts`, where the string is a snackbar: a bad
 * `dataType` led with three lines about the coils write nobody made.
 */
const expandUnion = (issue: ZodIssue): ZodIssue[] => {
  if (issue.code !== 'invalid_union') return [issue]

  return nearestBranch(issue.unionErrors.map((branch) => branch.issues)).flatMap(expandUnion)
}

/**
 * One line per fault.
 *
 * `RegisterParamsSchema` is an intersection, and both halves refuse a `params`
 * that is not an object at all, in the same words at the same path.
 */
const distinct = (issues: ZodIssue[]): ZodIssue[] => {
  const seen = new Set<string>()

  return issues.filter((issue) => {
    const line = `${issue.path.join('.')}: ${issue.message}`
    if (seen.has(line)) return false
    seen.add(line)
    return true
  })
}

/**
 * Format Zod validation errors into a readable summary.
 * Shows up to 5 issues with their path and message.
 */
export function formatZodError(error: ZodError): string {
  const expanded = distinct(error.issues.flatMap(expandUnion))
  const issues = expanded.slice(0, 5)
  const lines = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
  const extra = expanded.length > 5 ? `\n...and ${expanded.length - 5} more` : ''
  return lines.join('\n') + extra
}
