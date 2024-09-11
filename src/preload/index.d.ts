import { ElectronAPI } from '@electron-toolkit/preload'
import { Api } from './types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
