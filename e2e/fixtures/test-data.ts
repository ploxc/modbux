import type { ServerConfig } from './types'

// Server 1 (port 502, unit 0) — comprehensive test coverage of all data types
export const SERVER_1_UNIT_0: ServerConfig = {
  port: 502,
  name: 'Main Server',
  unitId: '0',
  registers: [
    // Holding registers — all data types
    {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '-100',
      comment: 'test int16 negative',
      next: true
    },
    {
      registerType: 'holding_registers',
      address: 1,
      dataType: 'UINT16',
      mode: 'fixed',
      value: '500',
      comment: 'test uint16',
      next: true
    },
    {
      registerType: 'holding_registers',
      address: 2,
      dataType: 'INT32',
      mode: 'fixed',
      value: '-70000',
      comment: 'test int32 negative',
      next: true
    },
    {
      registerType: 'holding_registers',
      address: 4,
      dataType: 'UINT32',
      mode: 'fixed',
      value: '100000',
      comment: 'test uint32'
    },
    {
      registerType: 'holding_registers',
      address: 6,
      dataType: 'FLOAT',
      mode: 'fixed',
      value: '3.14',
      comment: 'test float'
    },
    {
      registerType: 'holding_registers',
      address: 8,
      dataType: 'INT64',
      mode: 'fixed',
      value: '-1000000',
      comment: 'test int64 negative'
    },
    {
      registerType: 'holding_registers',
      address: 12,
      dataType: 'UINT64',
      mode: 'fixed',
      value: '2000000',
      comment: 'test uint64'
    },
    {
      registerType: 'holding_registers',
      address: 16,
      dataType: 'DOUBLE',
      mode: 'fixed',
      value: '2.718',
      comment: 'test double'
    },
    {
      registerType: 'holding_registers',
      address: 22,
      dataType: 'INT16',
      mode: 'generator',
      min: '0',
      max: '1000',
      interval: '1',
      comment: 'generator int16'
    },
    {
      registerType: 'holding_registers',
      address: 24,
      dataType: 'UTF-8',
      mode: 'fixed-utf8',
      stringValue: 'Hello',
      length: 10,
      comment: 'test utf8'
    },
    {
      registerType: 'holding_registers',
      address: 34,
      dataType: 'UNIX',
      mode: 'fixed-datetime',
      comment: 'test unix timestamp'
    },
    {
      registerType: 'holding_registers',
      address: 36,
      dataType: 'DATETIME',
      mode: 'generator-datetime',
      interval: '5',
      comment: 'test datetime generator'
    },

    // Input registers
    {
      registerType: 'input_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '200',
      comment: 'input int16'
    },
    {
      registerType: 'input_registers',
      address: 1,
      dataType: 'FLOAT',
      mode: 'fixed',
      value: '9.81',
      comment: 'input float'
    },
    {
      registerType: 'input_registers',
      address: 3,
      dataType: 'UINT16',
      mode: 'generator',
      min: '100',
      max: '500',
      interval: '2',
      comment: 'input generator'
    }
  ],
  bools: [
    { registerType: 'coils', address: 0, state: false },
    { registerType: 'coils', address: 5, state: true },
    { registerType: 'coils', address: 8, state: false },
    { registerType: 'discrete_inputs', address: 3, state: true }
  ]
}

// Server 1, unit ID 1 — separate unit config
export const SERVER_1_UNIT_1: Omit<ServerConfig, 'port'> = {
  name: 'Main Server',
  unitId: '1',
  registers: [
    {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'UINT16',
      mode: 'fixed',
      value: '777',
      comment: 'unit1 holding'
    },
    {
      registerType: 'input_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '888',
      comment: 'unit1 input'
    }
  ],
  bools: [{ registerType: 'coils', address: 2, state: true }]
}

// Server 2 (auto port) — minimal config
export const SERVER_2_UNIT_0: Omit<ServerConfig, 'port'> = {
  name: 'Second Server',
  unitId: '0',
  registers: [
    {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '42',
      comment: 'server2 register'
    },
    {
      registerType: 'holding_registers',
      address: 1,
      dataType: 'UINT16',
      mode: 'generator',
      min: '10',
      max: '90',
      interval: '3',
      comment: 'server2 generator'
    }
  ],
  bools: [{ registerType: 'coils', address: 0, state: true }]
}
