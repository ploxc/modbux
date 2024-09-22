import { BackendMessage, IpcEvent } from '@shared'
import { BrowserWindow } from 'electron'
import { IServiceVector, ServerTCP } from 'modbus-serial'

export interface ServerParams {
  mainWindow: BrowserWindow
}

export class ModbusServer {
  private _server: ServerTCP
  private _mainWindow: BrowserWindow

  private _coils = Array(65535).fill(false)
  private _discreteInputs = Array(65535).fill(false)
  private _inputRegisters = Array(65535).fill(123)
  private _holdingRegisters = Array(65535).fill(0)

  constructor({ mainWindow }: ServerParams) {
    this._mainWindow = mainWindow

    const vector: IServiceVector = {
      getCoil: this._getCoil,
      getDiscreteInput: this._getDiscreteInput,
      getInputRegister: this._getInputRegister,
      getHoldingRegister: this._getHoldingRegister,
      setCoil: this._setCoil,
      setRegister: this._setHoldingRegister
    }

    this._server = new ServerTCP(vector, { host: '0.0.0.0' })
    this._server.on('error', (error) => {
      if (error) {
        this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
      }
    })
  }

  // Events
  private _emitMessage = (message: BackendMessage) => {
    this._mainWindow.webContents.send(IpcEvent.BackendMessage, message)
  }

  private _getCoil: IServiceVector['getCoil'] = async (addr: number, unitID: number) => {
    return this._coils[addr]
  }
  private _getDiscreteInput: IServiceVector['getDiscreteInput'] = async (
    addr: number,
    unitID: number
  ) => {
    return this._discreteInputs[addr]
  }

  private _getInputRegister: IServiceVector['getInputRegister'] = async (
    addr: number,
    unitID: number
  ) => {
    if (unitID !== 1) return
    return this._inputRegisters[addr]
  }
  private _getHoldingRegister: IServiceVector['getHoldingRegister'] = async (
    addr: number,
    unitID: number
  ) => {
    return this._holdingRegisters[addr]
  }
  private _setCoil: IServiceVector['setCoil'] = async (
    addr: number,
    value: boolean,
    unitID: number
  ) => {
    this._coils[addr] = value
  }
  private _setHoldingRegister: IServiceVector['setRegister'] = async (
    addr: number,
    value: number,
    unitID: number
  ) => {
    this._holdingRegisters[addr] = value
  }
}
