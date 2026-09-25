import type { ZodError, ZodIssue } from 'zod'
import { RegisterAddressKeySchema } from '../types/ranges'
import { RegisterMapValueSchema } from '../types/client'
import {
  RegisterParamsSchema,
  ServerBoolEntrySchema,
  ServerRegisterEntrySchema
} from '../types/server'
import {
  BooleanRegistersSchema,
  DataType,
  isBooleanRegister,
  NumberRegistersSchema,
  ParitySchema,
  RegisterType,
  RegisterTypeSchema,
  UnitIdStringSchema
} from '../types'
import { getUsedAddresses, holdsExact64Bits } from '../encoding'

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

/** An object keyed by name. A list is an object too, and not one of these. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * What a config file has to be, and the version it claims, for either migration.
 *
 * Both opened with `JSON.parse(raw)` and then `parsed.version ?? 1`. On a
 * number, a string, a boolean or an array that is `undefined`, so 1, so the v1
 * to v2 step ran, and every field the server migration needs sits behind a
 * `??`, so `5`, `[]`, `"hello"` and `true` each came out a valid empty v2
 * config and the user was told the configuration had been updated from an older
 * format. `null` reached them as
 * `Cannot read properties of null (reading 'version')` instead. The client
 * migration refuses the same input, but only because `migrateClientV1toV2`
 * feeds the whole blob into `registerMapping` and the final `safeParse` catches
 * it, which is an accident of that one field rather than a rule.
 *
 * An array is refused with the rest: `Array.isArray` is the half `typeof` does
 * not cover, and a config is a map of named fields either way.
 *
 * The version is checked here too. `JSON.parse` answers `any`, so nothing had
 * asked what was in that field, and a relational operator coerces: `"3" > 2`
 * and `2.5 > 2` are both true, so those two took the future version branch and
 * came back with `migrated: false` and the newer-version warning, while `true`
 * and `null` compared false against both and took the v1 path. Four values,
 * three outcomes, none of them the one the file asked for.
 */
export function parseConfigFile(raw: string): {
  parsed: Record<string, unknown>
  detectedVersion: number
} {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) {
    throw new Error('This file does not hold a Modbux configuration')
  }

  const version = parsed.version
  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version))) {
    throw new Error(`This file claims version ${JSON.stringify(version)}, which is not a version`)
  }

  return { parsed, detectedVersion: version ?? 1 }
}

/**
 * Refuses a file saved by the other side.
 *
 * A server config is the one that holds `serverRegistersPerUnit`, in every
 * version, or `serverRegisters`, which a server wrote before it had units. A
 * client config from before versioned files is a bare register mapping with no
 * key of its own to test for, so the client side asks the opposite question:
 * whether the file holds a server's key.
 */
export function refuseOtherSidesConfig(
  parsed: Record<string, unknown>,
  side: 'client' | 'server'
): void {
  const isServerConfig = 'serverRegistersPerUnit' in parsed || 'serverRegisters' in parsed
  if (side === 'server' && !isServerConfig) {
    throw new Error(
      'This is not a server configuration. A client configuration opens in the client.'
    )
  }
  if (side === 'client' && isServerConfig) {
    throw new Error(
      'This is not a client configuration. A server configuration opens on the server.'
    )
  }
}

/** The object entries of `value`, and nothing at all when it is not an object. */
export const recordEntries = (value: unknown): [string, Record<string, unknown>][] =>
  isRecord(value)
    ? Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] =>
        isRecord(entry[1])
      )
    : []

/** The object values of `value`, and nothing at all when it is not an object. */
export const objectValues = (value: unknown): Record<string, unknown>[] =>
  recordEntries(value).map(([, entry]) => entry)

/**
 * The object at `parent[key]`, made empty when the key holds nothing.
 *
 * A key holding something that is not an object answers `undefined` and is left
 * where it is. `repairPersisted` reads a persisted field whole, resets the ones
 * that fail and names them through `FIELD_LABELS`, so a bad value replaced here
 * is one it never sees and never tells the user about.
 */
const recordAt = (
  parent: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined => {
  const existing = parent[key]
  if (isRecord(existing)) return existing
  if (existing !== undefined) return undefined
  const made: Record<string, unknown> = {}
  parent[key] = made
  return made
}

/** The addresses one unit's surviving registers occupy, by register type. */
const usedAddressesOfUnit = (
  registersByType: Record<string, unknown>
): Record<string, number[]> => {
  const used: Record<string, number[]> = {}
  for (const registerType of NumberRegistersSchema.options) {
    const params = objectValues(registersByType[registerType])
      .map((entry) => RegisterParamsSchema.safeParse(entry.params))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    used[registerType] = getUsedAddresses(params)
  }
  return used
}

/**
 * Drop persisted registers the current `RegisterParamsSchema` no longer names,
 * and rewrite the used addresses of every unit walked.
 *
 * Every rule here arrived after registers had already been persisted against a
 * looser one. `address` was a bare number, so a config file could put a
 * register at 70000. `interval` had no floor, so one could carry a generator
 * that fires every millisecond, and then no ceiling, where `setInterval` sets
 * the duration to 1 and does the same thing. `length` was bare, so a string
 * could ask for `Buffer.alloc(2e12)`, and a fixed `value` was bare, so a
 * `uint16` could carry 70000 and throw out of `createRegisters`. A register
 * running past address 65535 is the pair of `address` and `length` and was
 * refused by neither. A server is read back field by field, so without this
 * one such register costs every register on every unit of the server that
 * carries it.
 *
 * `usedAddresses` is persisted beside the registers, `isAddressInUse` refuses an
 * address against it, and the only thing recomputing it on launch is
 * `syncUuidToBackend`, for a unit that still holds something. So a unit the drop
 * emptied kept its addresses marked, because `extractUnitIdsWithData` skips it,
 * and so did every unit of a server whose port `createServer` refuses.
 *
 * Every unit walked, rather than the ones something went from, because a blob
 * can arrive with the register gone and the address still marked. The store
 * versions that did that ran on this branch alone and were collapsed into one
 * step, so what is left is a hand-edited blob: a register deleted by hand
 * leaves its addresses behind the same way.
 *
 * A unit id `UnitIdStringSchema` refuses is skipped, because `usedAddresses`
 * is one field of that server: writing `'300'` into it would cost the
 * addresses of every unit beside it, where the same key costs that server's
 * `registers` alone today.
 */
export function dropUnservableRegisters(state: Record<string, unknown>): void {
  for (const [, server] of recordEntries(state.servers)) {
    const registersPerUnit = recordAt(server, 'registers')
    const usedPerUnit = recordAt(server, 'usedAddresses')

    for (const [unitId, registersByType] of recordEntries(registersPerUnit)) {
      dropUnservableEntries(registersByType)

      if (!usedPerUnit) continue
      if (!UnitIdStringSchema.safeParse(unitId).success) continue
      usedPerUnit[unitId] = usedAddressesOfUnit(registersByType)
    }
  }
}

/**
 * Whether one entry can be served under the type and the address it is filed
 * at.
 *
 * The schema that will judge the entry is the schema that answers here, so a
 * register the drop keeps is a register `ServerRegistersSchema` takes. Reading
 * `params` alone did not do that: the branch keeping a boolean entry was
 * `if (!isRecord(params)) return true`, and a holding register of
 * `{ value: 1 }` took it, so the drop kept an entry `ServerRegisterSchema`
 * refuses and the whole `serverRegistersPerUnit` field reset for it. An entry
 * carrying valid `params` and no `value` cost the field the same way.
 *
 * A register map is keyed by address and a number entry repeats that address
 * in its parameters, so the two have to agree. `ServerRegisterSchema` asks
 * that of a blob or a file a whole field at a time: what the two callers here
 * buy is the register rather than the field, which is the reason written above
 * each of them.
 */
const isServable = (registerType: RegisterType, address: string, entry: unknown): boolean => {
  if (!RegisterAddressKeySchema.safeParse(address).success) return false
  if (isBooleanRegister(registerType)) return ServerBoolEntrySchema.safeParse(entry).success

  const parsed = ServerRegisterEntrySchema.safeParse(entry)
  return parsed.success && String(parsed.data.params.address) === address
}

/**
 * Drop the entries of one unit that cannot be served, and give the unit the
 * four register types it is missing.
 *
 * `ServerRegistersSchema` is a `z.object` naming all four, so a unit carrying
 * three of them fails the whole `serverRegistersPerUnit` field: measured on a
 * v9 config whose unit had no `coils` key, which came back with every register
 * on every unit gone and `serverRegistersPerUnit` named as reset. That is the
 * cost this walk exists to avoid, so the walk is over the four types rather
 * than over the keys that happen to be there, and each is a map afterwards.
 *
 * Walking the four also leaves a fifth register type from a newer Modbux
 * untouched, and that key costs nothing: a `z.object` strips what it does not
 * declare.
 *
 * Two callers reach a unit by different routes, a config file through
 * `serverRegistersPerUnit[unit]` and the persisted store through
 * `servers[uuid].registers[unit]`. Only that walk differs, so each caller owns
 * it and the work below it is here once, the way `migrateBoolShapeForUnit`
 * already is.
 */
const dropUnservableEntries = (registersByType: unknown): void => {
  if (!isRecord(registersByType)) return

  for (const registerType of RegisterTypeSchema.options) {
    // A type holding something that is not a map is emptied. No reading of it
    // is a register map, and left there it fails the whole field it sits in,
    // every register on every unit, where emptying costs this type alone.
    const existing = registersByType[registerType]
    const entriesByAddress = isRecord(existing) ? existing : {}
    registersByType[registerType] = entriesByAddress

    for (const [address, entry] of Object.entries(entriesByAddress)) {
      if (isServable(registerType, address, entry)) continue
      delete entriesByAddress[address]
    }
  }
}

/**
 * Drop the registers a config file from a newer Modbux carries that this one
 * cannot serve, so the ones it can survive.
 *
 * `repairPersisted` reads a field whole, and `serverRegistersPerUnit` is the
 * one field a server config is about, so without this a single register with a
 * data type this version does not name cost every register on every unit. That
 * is the cost `dropUnservableRegisters` exists to avoid on the persisted store,
 * and a config from a newer version is where a register the enum does not name
 * actually comes from.
 *
 * Walks `serverRegistersPerUnit[unit]` where the store walks
 * `servers[uuid].registers[unit]`, which is the same difference
 * `migrateBoolShapeForUnit` already carries.
 */
export function dropUnservableConfigRegisters(parsed: Record<string, unknown>): void {
  for (const [, registersByType] of recordEntries(parsed.serverRegistersPerUnit)) {
    dropUnservableEntries(registersByType)
  }
}

/**
 * Drop the mapping entries a client config from a newer Modbux carries that
 * this one cannot read.
 *
 * `registerMapping` is one field too, and it is the one thing in the client
 * store built by hand, which is the reason `dropUnmappableRegisters` gives for
 * doing the same on the persisted side. `LoadButton` calls
 * `replaceRegisterMapping` on whatever comes back and flushes it to main, so a
 * mapping of thousands of rows was replaced by nothing on account of one entry.
 */
export function dropUnreadableConfigMapping(parsed: Record<string, unknown>): void {
  for (const entriesByAddress of objectValues(parsed.registerMapping)) {
    for (const [address, entry] of Object.entries(entriesByAddress)) {
      if (RegisterAddressKeySchema.safeParse(address).success) {
        if (RegisterMapValueSchema.safeParse(entry).success) continue
      }
      delete entriesByAddress[address]
    }
  }
}

/**
 * Rewrite a persisted 64 bit register value as the decimal string it is now.
 *
 * `ServerRegisterEntrySchema.value` was `z.number()`, so every blob on disk
 * carries a number for the three types whose composite fills 64 bits as an
 * integer. The schema takes a string as well now, and a number still parses,
 * so nothing is dropped by leaving them: this is so the first word write after
 * a launch reads an exact value rather than the rounded one. A value already
 * past 2 ** 53 cannot be recovered, and the string says what was stored rather
 * than what the device holds.
 */
export function stringifyExact64BitValues(state: Record<string, unknown>): void {
  for (const [, server] of recordEntries(state.servers)) {
    for (const [, registersByType] of recordEntries(recordAt(server, 'registers'))) {
      for (const entriesByAddress of objectValues(registersByType)) {
        for (const entry of Object.values(entriesByAddress)) {
          if (!isRecord(entry)) continue
          if (typeof entry.value !== 'number') continue
          const params = entry.params
          if (!isRecord(params)) continue
          const dataType = params.dataType
          if (typeof dataType !== 'string') continue
          if (!holdsExact64Bits(dataType as DataType)) continue

          // The digits, or `'0'` where there are none. `String(0.5)` is
          // `"0.5"` and `String(1e21)` is `"1e+21"`, and the union takes
          // either as a number and neither as a string, so writing one back
          // would turn a blob that parsed into one that does not, and a
          // server's `registers` is read whole: every unit of it. An integer
          // above 2 ** 53 is the case this step is for, so the test is the
          // digits rather than `Number.isSafeInteger`.
          //
          // `'0'` rather than left alone, because `toExact64Bits` answers
          // nothing for a value no composite can be read out of, and
          // `applyRegisterValue` then leaves the entry where it is: the grid
          // would show that value for every write from then on while main
          // served the new one. Zero is what a register the server has not
          // written holds, and a fraction on a 64 bit type is not a value any
          // device wrote.
          const asString = String(entry.value)
          entry.value = /^-?\d+$/.test(asString) ? asString : '0'
        }
      }
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
 * `servers[uuid].registers[unit]`. Only that walk differs, so each caller owns
 * it and the work below it is here once.
 */
export function migrateBoolShapeForUnit(unitRegisters: unknown): void {
  if (!isRecord(unitRegisters)) return

  for (const boolType of BooleanRegistersSchema.options) {
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
  if (Array.isArray(value)) {
    for (const entry of value) renameLegacyRegisterTypeKeys(entry)
    return
  }
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
