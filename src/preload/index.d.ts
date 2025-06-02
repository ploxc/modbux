import { ElectronAPI } from '@electron-toolkit/preload'
import { Api } from '.'
import { Events } from './events'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
    events: Events
  }
}
