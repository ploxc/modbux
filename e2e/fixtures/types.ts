export type RegisterDef = {
  registerType: 'holding_registers' | 'input_registers'
  address: number
  dataType: string
  next?: boolean
} & (
  | { mode: 'fixed'; value: string; comment?: string }
  | { mode: 'generator'; min: string; max: string; interval: string; comment?: string }
)

export type BoolDef = {
  registerType: 'coils' | 'discrete_inputs'
  address: number
  state: boolean
}

export type ServerConfig = {
  port: number
  name: string
  unitId: string
  registers: RegisterDef[]
  bools: BoolDef[]
}
