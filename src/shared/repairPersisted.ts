import { z } from 'zod'

/** What a store lost on the way in, and why, so the user can be told both. */
export interface ConfigReset {
  /** The fields that failed, by name. */
  fields: string[]
  /** The persisted blob was written by a version this code does not know. */
  savedByNewerVersion: boolean
}

/** What a repair found, and what it had to give up to get there. */
export interface Repair<T> {
  state: T
  /** Undefined when every field parsed, which is the ordinary case. */
  reset: ConfigReset | undefined
}

/**
 * Keeps the fields of a persisted state that parse and defaults the rest.
 *
 * `persist` merges shallowly, so one corrupt top-level field replaces its whole
 * default sub-object rather than being filled in, and a check over the whole
 * object then fails on the merged result. Checking the whole object is also how
 * that failure is answered: `clearStorage` takes the siblings that were fine,
 * and a register mapping built by hand goes with them.
 *
 * A state saved by a newer version reaches this the same way, because the
 * fields it still shares with this one are the fields worth keeping.
 */
export function repairPersisted<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  state: unknown,
  /** The store's initial state. Only the fields the schema names are read. */
  defaults: object,
  savedByNewerVersion = false
): Repair<z.infer<z.ZodObject<Shape>>> {
  const repaired: Record<string, unknown> = {}
  const resetFields: string[] = []

  // A state that is not an object shares no field with the schema, so every
  // one of them resets and the caller reports the lot.
  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const fields = asRecord(state)
  const fallback = asRecord(defaults)

  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const result = fieldSchema.safeParse(fields[key])
    if (result.success) {
      repaired[key] = result.data
      continue
    }
    repaired[key] = fallback[key]
    resetFields.push(key)
  }

  const nothingLost = resetFields.length === 0 && !savedByNewerVersion
  return {
    state: repaired as z.infer<z.ZodObject<Shape>>,
    reset: nothingLost ? undefined : { fields: resetFields, savedByNewerVersion }
  }
}

/**
 * What each persisted field is called on screen. A field with no entry is named
 * as it is stored, which is worth more in a bug report than a guess.
 */
const FIELD_LABELS: Record<string, string> = {
  connectionConfig: 'the connection settings',
  registerConfig: 'the register settings',
  registerMapping: 'the register mapping',
  name: 'the name',
  port: 'the ports',
  selectedUuid: 'the selected server',
  uuids: 'the server list',
  serverRegisters: 'the registers',
  usedAddresses: 'the used addresses',
  unitId: 'the unit ids',
  littleEndian: 'the endianness',
  serverMode: 'the server mode',
  serialConfig: 'the serial settings'
}

const listFields = (fields: string[]): string => {
  const labelled = fields.map((field) => FIELD_LABELS[field] ?? `\`${field}\``)
  if (labelled.length === 1) return labelled[0]
  return `${labelled.slice(0, -1).join(', ')} and ${labelled[labelled.length - 1]}`
}

/**
 * What to tell the user about a config that did not come in whole.
 *
 * Naming the fields is the point: "your configuration was reset" leaves the
 * reader to work out whether the mapping they built by hand is still there.
 */
export function resetMessage(store: 'Client' | 'Server', reset: ConfigReset): string {
  const kept = 'Everything else was kept.'

  if (!reset.savedByNewerVersion) {
    return `${store} configuration: ${listFields(reset.fields)} could not be read and ${
      reset.fields.length === 1 ? 'was' : 'were'
    } reset. ${kept}`
  }

  if (reset.fields.length === 0) {
    return `${store} configuration was saved by a newer version of Modbux and was read in full.`
  }

  return `${store} configuration was saved by a newer version of Modbux. ${listFields(
    reset.fields
  )} did not come across and ${reset.fields.length === 1 ? 'was' : 'were'} reset. ${kept}`
}

/**
 * Puts the unreadable blob somewhere it can be sent in with a bug report.
 *
 * The reset is what makes the app usable again, and it is also what destroys
 * the evidence. A copy under a key nothing reads costs the bytes it holds.
 */
export function keepCorrupt(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  now: () => number = Date.now
): void {
  try {
    const blob = storage.getItem(key)
    if (blob === null) return
    storage.setItem(`${key}.corrupt-${now()}`, blob)
  } catch {
    // Storage that cannot be read holds nothing worth keeping either.
  }
}
