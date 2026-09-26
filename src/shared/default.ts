import {
  ClientSection,
  ClientSections,
  ClientState,
  ClientUnit,
  ConnectionConfig,
  RegisterConfig,
  RegisterData,
  RegisterDataWords,
  RegisterMapping,
  SerialPortOptions
} from './types'

/**
 * What a serial port opens with until someone says otherwise.
 *
 * `ConnectionConfigRtuSchema` and `ServerSerialConfigSchema` are both
 * `{ com: z.string(), options: SerialPortOptionsSchema }`, so the client's
 * connection and the server's RTU mode start from these four values. Copied at
 * each use, so a store writing one option leaves the other's alone.
 */
export const defaultSerialPortOptions: SerialPortOptions = {
  baudRate: '9600',
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
}

export const defaultConnectionConfig: ConnectionConfig = {
  protocol: 'ModbusTcp',
  tcp: {
    host: '192.168.1.10',
    options: { port: 502 }
  },
  rtu: {
    com: 'COM3',
    options: { ...defaultSerialPortOptions }
  }
}
export const defaultRegisterConfig: RegisterConfig = {
  pollRate: 1000,
  timeout: 5000,
  offlineAfterTimeouts: 3,
  maxPollInterval: 60_000,
  advancedMode: false,
  show64BitValues: false
}

/**
 * A mapping with nothing configured, one empty record per register type.
 *
 * Built fresh at each call, because the store writes into it. Two callers: the
 * client store's Clear, and the repair a config from a newer Modbux goes
 * through, which needs something to default the field to when it fails.
 */
export const emptyRegisterMapping = (): RegisterMapping => ({
  coils: {},
  discrete_inputs: {},
  holding_registers: {},
  input_registers: {}
})

/** A read window of ten from address 0, not polled. Built fresh at each call. */
export const defaultSection = (): ClientSection => ({ address: 0, length: 10, polled: false })

/** A default section for each register type, built fresh at each call. */
export const defaultSections = (): ClientSections => ({
  coils: defaultSection(),
  discrete_inputs: defaultSection(),
  input_registers: defaultSection(),
  holding_registers: defaultSection()
})

/**
 * A unit with nothing configured but its uuid and unit id: big endian, base 0,
 * an empty mapping, and holding registers polled from address 0.
 */
export const newClientUnit = (uuid: string, unitId: number): ClientUnit => ({
  uuid,
  unitId,
  name: '',
  littleEndian: false,
  addressBase: '0',
  registerMapping: emptyRegisterMapping(),
  sections: {
    ...defaultSections(),
    holding_registers: { ...defaultSection(), polled: true }
  }
})

export const defaultClientState: ClientState = {
  connectState: 'disconnected',
  polling: false,
  offlineUnits: [],
  scanningUnitIds: false,
  scanningRegisters: false,
  reading: false,
  writing: false
}

export const dummyWords: RegisterDataWords = {
  ['int16']: 0,
  ['uint16']: 0,
  ['int32']: 0,
  ['uint32']: 0,
  ['unix']: '',
  ['float']: 0,
  ['int64']: 0n,
  ['uint64']: 0n,
  ['double']: 0,
  ['datetime']: '',
  ['utf8']: ''
}

export const getDummyRegisterData = (register: number): RegisterData => ({
  bit: false,
  hex: '0000',
  buffer: new Uint8Array([0, 0]),
  id: register,
  isScanned: false,
  words: { ...dummyWords }
})

export const MAIN_SERVER_UUID = '21794bae-26a7-488c-954c-2105cb303c59'

/** The uuid the client store's one client is created and addressed under. */
export const MAIN_CLIENT_UUID = '084550bd-a9eb-452e-83f9-dc7a125b2ba4'
