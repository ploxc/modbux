/**
 * `interval` is the seconds the field is labelled in, and its mask caps at 10.
 * Measured 16 Sep 2026: both '100' and '1000' stored 10000 ms, which is a tick
 * every ten seconds and longer than a spec usually waits.
 */
export type RegisterDef = {
  registerType: 'holding_registers' | 'input_registers'
  address: number
  dataType: string
  next?: boolean
} & (
  | { mode: 'fixed'; value: string; comment?: string }
  | { mode: 'generator'; min: string; max: string; interval: string; comment?: string }
  | { mode: 'fixed-utf8'; stringValue: string; length: number; comment?: string }
  | { mode: 'fixed-datetime'; comment?: string }
  | { mode: 'generator-datetime'; interval: string; comment?: string }
)

export type BoolDef = {
  registerType: 'coils' | 'discrete_inputs'
  address: number
  state: boolean
  comment?: string
}

export type ServerConfig = {
  port: number
  name: string
  unitId: string
  registers: RegisterDef[]
  bools: BoolDef[]
}
