import { ElectronAPI } from '@electron-toolkit/preload'
import { Api } from '.'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
