import { ClientState, ConnectionConfigSchema, RegisterConfigSchema } from '@shared'

/**
 * The `window` a store finds when it is imported, answering like the boundary.
 *
 * The stores call IPC at module scope and from every setter, so a blanket
 * `undefined` here is a mock that lies: the config setters write only when main
 * accepts, and under that stub none of them would ever write. These two parse
 * with the schemas `main/ipc.ts` guards the channels with, and answer what
 * `createIpcHandle` answers.
 */
const answerConfig = (schema: {
  safeParse: (value: unknown) => { success: boolean }
}): ((payload: unknown) => Promise<true | undefined>) => {
  return (payload: unknown): Promise<true | undefined> =>
    Promise.resolve(schema.safeParse(payload).success ? true : undefined)
}

const disconnected: ClientState = {
  connectState: 'disconnected',
  polling: false,
  scanningUnitIds: false,
  scanningRegisters: false
}

/**
 * A channel whose type cannot answer `undefined` answers something here.
 *
 * `init` writes what `get_client_state` hands back, so a stub answering
 * `undefined` puts that in the store and every setter reading `connectState`
 * throws a line later.
 */
const answers: Record<string, (payload: unknown) => Promise<unknown>> = {
  updateConnectionConfig: answerConfig(ConnectionConfigSchema.deepPartial()),
  updateRegisterConfig: answerConfig(RegisterConfigSchema.deepPartial()),
  getClientState: () => Promise.resolve(disconnected),
  getAppVersion: () => Promise.resolve('0.0.0-test'),
  listSerialPorts: () => Promise.resolve([])
}

export const stubRenderer = (): void => {
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (): (() => void) => (): void => {},
      send: (): void => {},
      invoke: async (): Promise<undefined> => undefined
    }
  }
  w.api = new Proxy(
    {},
    {
      get: (_target, method: string): ((payload: unknown) => Promise<unknown>) =>
        answers[method] ?? ((): Promise<undefined> => Promise.resolve(undefined))
    }
  )
}
