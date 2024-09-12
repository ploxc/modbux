export enum ClientState {
  Init,
  Next,
  ReadOk,
  ReadFail,
  ConnectOk,
  ConnectFail
}

export interface ClientParams {
  host: string
  id?: number
  port?: number
  timeout?: number
}
