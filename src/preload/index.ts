import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS, IpcHandlerMap } from '@shared'

const passedArgs = process.argv.slice(2)
const isServerWindow = passedArgs.includes('is-server-window')

export const ipcInvoke = <C extends keyof IpcHandlerMap>(
  channel: C,
  ...args: IpcHandlerMap[C]['args']
): Promise<IpcHandlerMap[C]['return']> => {
  return ipcRenderer.invoke(channel, ...args)
}

type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? // If there's an underscore, concatenate Head with Capitalize of the next segment,
    // then recursively process the remainder.
    `${Head}${Capitalize<CamelCase<Tail>>}`
  : // If no underscore remains, simply return S.
    S

/**
 * Convert a snake_case string to camelCase.
 * Example: "get_connection_config" → "getConnectionConfig"
 */
function snakeToCamel<S extends string>(
  str: S
): /* Return type is the same string, but transformed */
string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * AUTOMATIC IPC HANDLER GENERATION
 *
 * This code automatically converts snake_case IPC channels to camelCase methods.
 *
 * HOW IT WORKS:
 * 1. Takes all channels from IPC_CHANNELS (e.g., 'get_connection_config')
 * 2. Converts to camelCase (e.g., 'getConnectionConfig')
 * 3. Creates a method that calls ipcInvoke with the original channel name
 * 4. Exposes on window.api with full TypeScript support
 *
 * ADDING A NEW CHANNEL:
 * 1. Add channel name to IPC_CHANNELS in shared/types/ipc.ts
 * 2. Define args/return in IpcHandlerSpec
 * 3. Done! Method is automatically available as window.api.yourMethodName()
 *
 * EXAMPLE:
 *   IPC_CHANNELS: 'update_register_config'
 *   → window.api.updateRegisterConfig(config)
 */
const handlers = Object.fromEntries(
  (Object.values(IPC_CHANNELS) as Array<keyof IpcHandlerMap>).map((channelName) => {
    // channelName is a string like "get_connection_config"
    const methodName = snakeToCamel(channelName) as CamelCase<typeof channelName>
    return [
      methodName,
      (
        ...args: IpcHandlerMap[typeof channelName]['args']
      ):
        | Promise<IpcHandlerMap[typeof channelName]['return']>
        | IpcHandlerMap[typeof channelName]['return'] => ipcInvoke(channelName, ...args)
    ]
  })
) as {
  // We assert that handlers now matches the mapped type:
  // For each channel C (snake_case) in IpcHandlerMap,
  // produce a camelCase method name and signature.
  [C in keyof IpcHandlerMap as CamelCase<C & string>]: (
    ...args: IpcHandlerMap[C]['args']
  ) => Promise<IpcHandlerMap[C]['return']>
}

type Handlers = typeof handlers

/**
 * Define your Api interface by combining `isServerWindow` plus
 * all methods generated from IpcHandlerMap (in camelCase).
 */
export type Api = {
  isServerWindow: boolean
} & Handlers

/**
 * Finally, assemble the `api` object:
 * - `isServerWindow` is a boolean checked at runtime
 * - spread in all generated handler methods
 */
const api = {
  isServerWindow,
  ...handlers
} as Api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
