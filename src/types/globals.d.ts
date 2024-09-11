declare global {
  interface RowData {
    id: number
    hex: string
    bigEndian: RowDataEndian
    littleEndian: RowDataEndian
  }
  interface RowDataEndian {
    int16: number
    uint16: number
    int32: number
    uint32: number
    int64: bigint
    uint64: bigint
    float: number
    double: number
  }
  type Protocol = 'ModbusTcp' | 'ModbusRtu'

  interface Api {
    read: (address: number, length: number) => Promise<RowData[]>
  }
}

export { Protocol }
