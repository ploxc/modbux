import { McpToolArgs, RegisterMapValue, isNumberRegister, migrateClientConfig } from '@shared'
import { useClientZustand } from '@renderer/context/client.zustand'
import { asOneClientStep } from '@renderer/context/clientUndo'
import { showMapping } from '@renderer/context/live.zustand'
import { McpToolError } from './readTools'
import { selectClient, setType } from './operateTools'

export const addClient = ({ name }: McpToolArgs<'add_client'>): unknown => {
  const clientZustand = useClientZustand.getState()
  const client = clientZustand.addClient()
  // `addClient` leaves the selection alone while another call holds it.
  if (useClientZustand.getState().selectedUuid !== client) {
    throw new McpToolError(`Added ${client}, but Modbux is busy with another client; name it later`)
  }
  if (name !== undefined) clientZustand.setName(name)
  return { client }
}

export const deleteClient = async ({ client }: McpToolArgs<'delete_client'>): Promise<unknown> => {
  selectClient(client)
  if (Object.keys(useClientZustand.getState().clients).length < 2) {
    throw new McpToolError('The last client cannot be removed')
  }
  // `selectClient` refused a held selection and an unknown id, and the line
  // above the last client: the three reasons the store answers false.
  await useClientZustand.getState().deleteClient(client)
  return { deleted: client }
}

type EntryField = Exclude<keyof McpToolArgs<'set_mapping_entry'>, 'client' | 'type' | 'address'>

/** The fields the grid edits, in the order they are set. */
const ENTRY_FIELDS = [
  'dataType',
  'scalingFactor',
  'comment',
  'groupEnd',
  'interpolate',
  'bitMap'
] as const satisfies readonly EntryField[]

export const setMappingEntry = async ({
  client,
  type,
  address,
  ...fields
}: McpToolArgs<'set_mapping_entry'>): Promise<unknown> => {
  selectClient(client)
  if (!(await setType(type))) {
    throw new McpToolError(`The client cannot switch to ${type} now; a register scan owns it`)
  }
  const changed: string[] = []
  const refused: string[] = []
  const removing = fields.dataType === 'none'
  for (const field of ENTRY_FIELDS) {
    const value = fields[field]
    if (value === undefined) continue
    // A bit register has a comment column and nothing else to edit.
    const taken =
      (field === 'comment' || isNumberRegister(type)) && (!removing || field === 'dataType')
    if (taken) {
      useClientZustand
        .getState()
        .setRegisterMapping(address, field, value as RegisterMapValue[typeof field])
    }
    ;(taken ? changed : refused).push(field)
  }
  return { changed, refused }
}

export const replaceMapping = async ({
  client,
  config
}: McpToolArgs<'replace_mapping'>): Promise<unknown> => {
  selectClient(client)
  let migration: ReturnType<typeof migrateClientConfig>
  try {
    migration = migrateClientConfig(JSON.stringify(config))
  } catch (error) {
    throw new McpToolError(`The config was refused: ${(error as Error).message}`)
  }
  const { config: opened, migrated, futureVersion } = migration
  let replaced = false
  await asOneClientStep(async () => {
    const clientZustand = useClientZustand.getState()
    if (opened.name) clientZustand.setName(opened.name)
    await clientZustand.setLittleEndian(opened.littleEndian)
    replaced = await clientZustand.replaceRegisterMapping(opened.registerMapping)
  })
  if (!replaced) throw new McpToolError('Modbux refused the mapping; the one before stays')
  showMapping(client)
  return { migrated, fieldsNotBroughtAcross: futureVersion?.fields ?? [] }
}

export const clearMapping = async ({ client }: McpToolArgs<'clear_mapping'>): Promise<unknown> => {
  selectClient(client)
  await asOneClientStep(async () => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setName('')
    await clientZustand.clearRegisterMapping()
  })
  return { cleared: client }
}
