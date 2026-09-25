import {
  AddRegisterParamsSchema,
  ClientConnectionConfigUpdateSchema,
  ClientRegisterConfigUpdateSchema,
  ClientRegisterMappingSchema,
  ClientState,
  defaultClientState,
  MAIN_CLIENT_UUID,
  McpSettingsSchema
} from '@shared'

/**
 * The `window` a store finds when it is imported, answering like the boundary.
 *
 * The stores call IPC at module scope and from every setter, so a blanket
 * `undefined` here is a mock that lies: a setter that writes only when main
 * accepts writes nothing under that stub. Every channel answering this way
 * parses with the schema `main/ipc.ts` guards it with, and answers what
 * `createIpcHandle` answers.
 */
const answerConfig = (schema: {
  safeParse: (value: unknown) => { success: boolean }
}): ((payload: unknown) => Promise<true | undefined>) => {
  return (payload: unknown): Promise<true | undefined> =>
    Promise.resolve(schema.safeParse(payload).success ? true : undefined)
}

const disconnected: ClientState = { ...defaultClientState }

/**
 * A channel whose type cannot answer `undefined` answers something here.
 *
 * `live.zustand` writes what `get_client_states` hands back, so a stub answering
 * `undefined` puts that in the store and every setter reading `connectState`
 * throws a line later.
 */
const answers: Record<string, (payload: unknown) => Promise<unknown>> = {
  updateConnectionConfig: answerConfig(ClientConnectionConfigUpdateSchema),
  updateRegisterConfig: answerConfig(ClientRegisterConfigUpdateSchema),
  setRegisterMapping: answerConfig(ClientRegisterMappingSchema),
  // The words main answers with, which for a payload it refuses is nothing at
  // all rather than an empty list.
  addReplaceServerRegister: (payload: unknown): Promise<number[] | undefined> =>
    Promise.resolve(AddRegisterParamsSchema.safeParse(payload).success ? [] : undefined),
  getClientStates: () => Promise.resolve({ [MAIN_CLIENT_UUID]: disconnected }),
  getAppVersion: () => Promise.resolve('0.0.0-test'),
  getRtuServerStatus: () => Promise.resolve(false),
  getServerPorts: () => Promise.resolve({}),
  listSerialPorts: () => Promise.resolve([]),
  // Main listens once it is switched on and a token is set.
  setMcpSettings: (payload: unknown) => {
    const parsed = McpSettingsSchema.safeParse(payload)
    if (!parsed.success) return Promise.resolve(undefined)
    const { access, tokenHash } = parsed.data
    return Promise.resolve({
      listening: tokenHash !== undefined && access.enabled
    })
  },
  createMcpToken: () => Promise.resolve({ token: 'mbx_test', tokenHash: 'a'.repeat(64) })
}

/**
 * The listeners the stores registered, so a test can deliver an event.
 *
 * `stubRenderer` empties it, and `fireEvent` calls what is in it. A store
 * registers at module scope, so the import has to come after the stub.
 */
const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

/** Delivers `event` to every listener a store registered for it. */
export const fireEvent = (event: string, ...args: unknown[]): void => {
  for (const listener of listeners.get(event) ?? []) listener(...args)
}

/**
 * Which window the stub answers as.
 *
 * `isServerWindow` is the flag three stores read at module scope to decide what
 * they may do, so a test about the split out window has to be able to say so.
 */
export interface StubOptions {
  isServerWindow?: boolean
}

export const stubRenderer = ({ isServerWindow = false }: StubOptions = {}): void => {
  listeners.clear()
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (event: string, listener: (...args: unknown[]) => void): (() => void) => {
        const forEvent = listeners.get(event) ?? []
        // The preload hands a listener the Electron event first, and a store
        // reads its payload off the second argument.
        forEvent.push((...args) => listener(undefined, ...args))
        listeners.set(event, forEvent)
        return (): void => {}
      },
      send: (): void => {},
      invoke: async (): Promise<undefined> => undefined
    }
  }
  w.api = new Proxy(
    {},
    {
      // A boolean the preload exposes, not a channel: a function here is truthy
      // and would make every window look like the server window.
      get: (_target, method: string): unknown =>
        method === 'isServerWindow'
          ? isServerWindow
          : (answers[method] ?? ((): Promise<undefined> => Promise.resolve(undefined)))
    }
  )
}

export type ApiCall = { method: string; payload: unknown }

/**
 * Every `window.api` call a test drives, in order, still answered underneath.
 *
 * A store calls main from module scope and from most setters, and the order it
 * calls in is the thing under test where one call has to hold before the next
 * goes out. Wraps whatever `stubRenderer` left on `window.api`, so it is called
 * after it and not instead of it.
 */
export const recordApiCalls = (calls: ApiCall[]): void => {
  const answers = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    {
      get: (_target, method: string): unknown => {
        // `isServerWindow` is a boolean the preload exposes rather than a
        // channel, so there is no call to record.
        if (method === 'isServerWindow') return answers[method]
        const answer = answers[method]
        if (typeof answer !== 'function') throw new Error(`stubRenderer answers no ${method}`)
        return (payload: unknown): unknown => {
          calls.push({ method, payload })
          return (answer as (payload: unknown) => unknown)(payload)
        }
      }
    }
  ) as never
}

/**
 * What a client channel carried besides the uuid, once the uuid is the store's.
 *
 * Every client channel names the client it drives, so a payload is the uuid
 * and one field beside it. A test about the field reads the field; this checks
 * the uuid on the way, so none of them can send another client's.
 */
export const clientPayload = (payload: unknown): unknown => {
  const { uuid, ...rest } = payload as { uuid: unknown } & Record<string, unknown>
  if (uuid !== MAIN_CLIENT_UUID) throw new Error(`addressed to ${String(uuid)}`)
  const [field, ...more] = Object.values(rest)
  if (more.length > 0) throw new Error('a client payload carries one field beside the uuid')
  return field
}
