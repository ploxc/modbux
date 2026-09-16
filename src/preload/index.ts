import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { CamelCase, IPC_CHANNELS, IpcHandlerMap, snakeToCamel } from '@shared'

const isServerWindow = process.argv.includes('--is-server-window')

const ipcInvoke = <C extends keyof IpcHandlerMap>(
  channel: C,
  ...args: IpcHandlerMap[C]['args']
): Promise<IpcHandlerMap[C]['return']> => {
  return ipcRenderer.invoke(channel, ...args)
}

/**
 * AUTOMATIC IPC HANDLER GENERATION
 *
 * This code automatically converts snake_case IPC channels to camelCase methods.
 *
 * HOW IT WORKS:
 * 1. Takes all channels from IPC_CHANNELS (e.g., 'update_register_config')
 * 2. Converts to camelCase (e.g., 'updateRegisterConfig')
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
    // channelName is a string like "update_register_config"
    const methodName = snakeToCamel(channelName)
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

// Every window this app opens sets `contextIsolation: true`, so there is no
// branch here for the case where it is off.
try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
