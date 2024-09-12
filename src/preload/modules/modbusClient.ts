import ModbusRTU from 'modbus-serial'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { ClientParams, ClientState } from './modbusClient/types'

export class ModbusTcpClient {
  private _client: ModbusRTU
  private _host: string
  private _id: number
  private _port: number
  private _timeout: number
  private _state: ClientState

  constructor({ host, id, port, timeout }: ClientParams) {
    this._client = new ModbusRTU()
    this._host = host
    this._id = id || 1
    this._port = port || 502
    this._timeout = timeout || 3000

    this._state = ClientState.Init

    this._client
      .on('error', (error) => console.error(`ERROR\n${JSON.stringify(error, null, 2)}`))
      .on('close', () => console.warn(`Client closed`))
  }

  public read = async (
    address: number,
    length: number
  ): Promise<ReadRegisterResult | undefined> => {
    const connectStates = [ClientState.Init, ClientState.ConnectFail]
    const connectCondition = connectStates.includes(this._state) || !this._client.isOpen

    if (connectCondition) {
      await this._connect()
      await new Promise((r) => setTimeout(r, 1000))
    }

    const readStates = [
      ClientState.Next,
      ClientState.ConnectOk,
      ClientState.ReadFail,
      ClientState.ReadOk
    ]
    const readCondition = readStates.includes(this._state)
    if (!readCondition) {
      console.warn(`Cannot read, client is not in a valid state: ${this._state}`)
      return
    }

    try {
      const result = await this._client.readHoldingRegisters(address, length)
      return result
    } catch (error) {
      this._state = ClientState.ReadFail

      const message = `'READ ERROR addres:${address} lenght:${length}'\n${JSON.stringify(error, null, 2)}`
      console.error(message)
      return
    }
  }

  private _connect = async (): Promise<void> => {
    console.debug(`Client open: ${this._client.isOpen}`)
    this._client.isOpen && this._client.close(() => console.info('Client closed'))

    this._client.setID(this._id)
    this._client.setTimeout(this._timeout)

    // Connect
    const message = `Connecting to modbus host: ${this._host}:${this._port} - ID: ${this._id}`
    console.info(message)

    try {
      await this._client.connectTCP(this._host, { port: this._port })
      this._state = ClientState.ConnectOk
      console.info('Client connected')
    } catch (error) {
      this._state = ClientState.ConnectFail
      console.error(`'CONNECT ERROR'\n${error}`)
    }
  }
}

export * from './modbusClient/default'
