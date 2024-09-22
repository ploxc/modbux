export class ModbusServer {
  constructor() {
    // TODO
  }
}

// create an empty modbus client
const ModbusRTU = require('modbus-serial')
const vector = {
  getInputRegister: function (addr, unitID) {
    // Synchronous handling
    return addr
  },
  getHoldingRegister: function (addr, unitID, callback) {
    // Asynchronous handling (with callback)
    setTimeout(function () {
      // callback = function(err, value)
      callback(null, addr % 30 === 0 ? addr : 0)
    }, 10)
  },
  getCoil: function (addr, unitID) {
    // Asynchronous handling (with Promises, async/await supported)
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(addr % 2 === 0)
      }, 10)
    })
  },
  setRegister: function (addr, value, unitID) {
    // Asynchronous handling supported also here
    console.log('set register', addr, value, unitID)
    return
  },
  setCoil: function (addr, value, unitID) {
    // Asynchronous handling supported also here
    console.log('set coil', addr, value, unitID)
    return
  },
  readDeviceIdentification: function (addr) {
    return {
      0x00: 'MyVendorName',
      0x01: 'MyProductCode',
      0x02: 'MyMajorMinorRevision',
      0x05: 'MyModelName',
      0x97: 'MyExtendedObject1',
      0xab: 'MyExtendedObject2'
    }
  }
}

// set the server to answer for modbus requests
console.log('ModbusTCP listening on modbus://0.0.0.0:8502')
export const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '0.0.0.0',
  port: 8502,
  debug: true,
  unitID: 1
})
