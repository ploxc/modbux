/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import {
  ClientSet,
  PersistedClientZustand,
  PersistedClientZustandSchema,
  ClientZustand
} from './client.zustand.types'
import {
  defaultConnectionConfig,
  defaultRegisterConfig,
  CURRENT_CLIENT_ZUSTAND_VERSION,
  migrateClientState,
  carryFormerClientState,
  CLIENT_ZUSTAND_STORAGE_KEY,
  clientOwner,
  configuredReadGroups,
  emptyRegisterMapping,
  isConnectionAddressGiven,
  isReadLengthGiven,
  RegisterConfig,
  RegisterMapping,
  SerialPortOptions
} from '@shared'
import { showMapping, useDataZustand } from './data.zustand'
import { loadSerialPorts } from './serialPorts'
import { repairPersistedStore } from './repairPersistedStore'

/**
 * The version the blob on disk carried, set by `migrate` and read once below.
 *
 * persist calls `migrate` for any version that is not the current one, the ones
 * above it included, and that call is the only place the number is offered.
 */
let persistedVersion: number | undefined

// Debounced IPC sync — avoids flooding the main process on rapid cell edits
let _ipcTimer: ReturnType<typeof setTimeout> | null = null
function syncRegisterMappingToMain(): void {
  if (_ipcTimer) clearTimeout(_ipcTimer)
  _ipcTimer = setTimeout(() => {
    _ipcTimer = null
    // Nothing waits on a cell edit reaching main, so the answer has nobody to
    // stop. A refusal reports itself as a `backend_message` and costs main the
    // edit, and the next edit sends the whole mapping again.
    void window.api.setRegisterMapping(useClientZustand.getState().registerMapping)
  }, 150)
}

/**
 * Sends `registerMapping` now instead of in 150 ms, and answers whether main
 * took it.
 *
 * For a caller that needs the backend to hold the mapping before its next
 * request. Turning on read configuration reads straight afterwards, and the
 * debounce would let that read go out against the mapping from before.
 *
 * It takes the mapping rather than reading the store, because a caller that
 * writes only once main has it has nothing in the store to send yet.
 */
export const flushRegisterMappingToMain = async (
  registerMapping: RegisterMapping
): Promise<boolean> => {
  if (_ipcTimer) clearTimeout(_ipcTimer)
  _ipcTimer = null
  return (await window.api.setRegisterMapping(registerMapping)) ?? false
}

/**
 * Answer a question the rows on screen no longer answer.
 *
 * Address, length and type each change what a read asks for, and the unit id
 * changes which device answers it, so the rows from the last read are about
 * something else now. A poll puts new ones there on its own.
 *
 * With read configuration on, emptying the grid is the wrong answer, because
 * the grid is drawn from the mapping there and the configured rows would go
 * with it. Whether there is a right one depends on the field, which is what
 * `readsTheMapping` names.
 *
 * The unit id and the type change what the mapping is read from, so the rows
 * are redrawn and main is asked to fill them: leaving them alone left the old
 * unit's values in the named rows, and after a type change left the rows of
 * the type before it, because `RegisterGrid` redraws the mapping on a change
 * of `readConfiguration` and not of `type`. That is what `setReadConfiguration`
 * does when it is switched on and what `setLittleEndian` does for its own
 * question.
 *
 * The address and the length change nothing there. `_read` builds its groups
 * from the mapping and falls back to the toolbar's group only when the mapping
 * has none, so the rows still answer the same question, and redrawing them
 * would trade values a device answered for `showMapping`'s zeros. Both fields
 * are disabled while read configuration is on, so this is the rule rather than
 * a state to reach.
 *
 * `configuredReadGroups` is that same fallback asked before the ask. A bit
 * type configures nothing main will read, and neither does a type with no
 * group under it, so a read there comes back as the toolbar's block over the
 * mapping just drawn. The redraw still happens, because the mapping is what
 * the grid is about; the ask does not.
 */
const clearRegisterDataWhenIdle = (readsTheMapping: boolean): void => {
  const { readConfiguration, registerConfig, registerMapping } = useClientZustand.getState()
  if (useDataZustand.getState().clientState.polling) return
  if (readConfiguration) {
    if (!readsTheMapping) return
    showMapping()
    if (configuredReadGroups(true, registerConfig.type, registerMapping).length > 0) {
      readWhenMainCan()
    }
    return
  }
  useDataZustand.getState().setRegisterData([])
}

/**
 * Whether a connection field may change, which is while no connection stands.
 *
 * Five setters ask it: `setSerialOption` for the four serial options, and
 * `setProtocol`, `setPort`, `setHost` and `setCom`. `connectState` lives in
 * `data.zustand` with the rest of what main pushes, so they read it there
 * rather than out of the state they are writing.
 */
const isDisconnected = (): boolean =>
  useDataZustand.getState().clientState.connectState === 'disconnected'

/**
 * One serial option, sent and then written where main took it.
 *
 * `baudRate`, `parity`, `dataBits` and `stopBits` differ in nothing but the
 * key. All four describe the line a connect opens, so all four are refused
 * while one stands. `setCom` is not this shape: it carries a validity flag.
 */
const setSerialOption = async <Key extends keyof SerialPortOptions>(
  set: ClientSet,
  get: () => ClientZustand,
  key: Key,
  value: SerialPortOptions[Key]
): Promise<void> => {
  if (!get().ready) return
  if (!isDisconnected()) return

  if (!(await window.api.updateConnectionConfig({ rtu: { options: { [key]: value } } }))) return

  set((state) => {
    state.connectionConfig.rtu.options[key] = value
  })
}

/**
 * One register config field, sent and then written where main took it.
 *
 * `addressBase`, `show64BitValues`, `advancedMode`, `pollRate` and `timeout`
 * differ in nothing but the key. The four fields that are not here each end on
 * something more: `address`, `length` and `type` clear the grid, `littleEndian`
 * reads again, and `length` carries a validity flag as well.
 */
const setRegisterConfigField = async <Key extends keyof RegisterConfig>(
  set: ClientSet,
  get: () => ClientZustand,
  key: Key,
  value: RegisterConfig[Key]
): Promise<void> => {
  if (!get().ready) return
  if (!(await window.api.updateRegisterConfig({ [key]: value }))) return

  set((state) => {
    state.registerConfig[key] = value
  })
}

/**
 * Ask main for a read, unless it is in no position to answer.
 *
 * `read` refuses and says so in a snackbar when anything owns the client, and
 * again when nothing is connected, so a caller that asks anyway costs the user
 * a warning it did not ask for. `clientOwner` is the question main asks, which
 * is why it is asked here rather than restated.
 */
const readWhenMainCan = (): void => {
  const { clientState } = useDataZustand.getState()
  if (clientState.connectState !== 'connected') return
  if (clientOwner(clientState)) return
  window.api.read()
}

carryFormerClientState(localStorage)

export const useClientZustand = create<
  ClientZustand,
  [['zustand/persist', PersistedClientZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      // Config
      init: () => {
        const { connectionConfig, registerConfig } = get()

        window.api.updateConnectionConfig(connectionConfig)
        window.api.updateRegisterConfig(registerConfig)
        window.api.setReadConfiguration(false)

        set((state) => {
          state.readConfiguration = false
          state.ready = true

          // `partialize` persists `connectionConfig` and not `valid`, so a
          // blank COM port typed before a quit comes back in the field with
          // the flag reading true, and Connect took a press on it. The flag is
          // read off the value rather than stored, because it is what the two
          // fields decide about a value and a value is what disk carries.
          state.valid.host = isConnectionAddressGiven(connectionConfig.tcp.host)
          state.valid.com = isConnectionAddressGiven(connectionConfig.rtu.com)
          state.valid.length = isReadLengthGiven(registerConfig.length)
        })
      },
      connectionConfig: defaultConnectionConfig,
      registerConfig: defaultRegisterConfig,
      name: '',
      setName: (name) =>
        set((state) => {
          state.name = name
        }),
      configReset: undefined,
      acknowledgeConfigReset: () =>
        set((state) => {
          state.configReset = undefined
        }),
      registerMapping: emptyRegisterMapping(),
      setRegisterMapping: (register, key, value) => {
        const type = get().registerConfig.type

        set((state) => {
          // Remove register from mapping when data type is set to 'none'
          if (key === 'dataType' && value === 'none') {
            delete state.registerMapping[type][register]
            return
          }

          if (!state.registerMapping[type][register]) {
            state.registerMapping[type][register] = { [key]: value }
            return
          }

          if (!state.registerMapping[type][register][key]) {
            state.registerMapping[type][register][key] = value
            return
          }

          state.registerMapping[type][register][key] = value
        })

        syncRegisterMappingToMain()
      },
      replaceRegisterMapping: async (registerMapping) => {
        // Read configuration is the one thing that makes main read the mapping,
        // so turning it off first leaves no read answering out of the mapping
        // this call throws away. `syncRegisterMappingToMain` debounces for
        // rapid cell edits, and a whole new mapping is not one.
        get().setReadConfiguration(false)

        // Main keeps the mapping it had when it refuses one, so a write here
        // would leave the grid showing registers main is not holding. What a
        // refusal costs is read configuration, which is off by the line above
        // and stays off: both sides hold the mapping from before, and the
        // message main sends names the channel.
        if (!(await flushRegisterMappingToMain(registerMapping))) return

        set((state) => {
          state.registerMapping = registerMapping
        })
      },
      clearRegisterMapping: () => get().replaceRegisterMapping(emptyRegisterMapping()),

      // State
      ready: false,
      readConfiguration: false,

      // Configuration actions
      valid: {
        host: true,
        com: true,
        length: true
      },
      //
      //
      // Protocol
      //
      // Every setter below sends first and writes only what main took, so a
      // payload the schemas refuse leaves both sides on the value they had.
      // `1,5` in a mask field is `NaN`, `UnitIdSchema` refuses it, and a store
      // that wrote it persisted `null` and lost the whole config on the next
      // launch. A round trip is shorter than the gap between two keystrokes, so
      // no field waits on the answer. The exception is a field carrying a
      // validity flag, which sends nothing while that flag is false; the host,
      // the COM port and the length each say why where they stand.
      //
      // Nine of them differ in nothing but a key under `rtu.options` or under
      // `registerConfig`, and those are one line each over `setSerialOption`
      // or `setRegisterConfigField` above. Every setter still written out
      // below has its own reason: a payload of another shape, a string to
      // convert, a validity flag, a grid to clear, a read to ask for.
      setProtocol: async (protocol) => {
        if (!get().ready) return
        if (!isDisconnected()) return

        if (!(await window.api.updateConnectionConfig({ protocol }))) return

        set((state) => {
          state.connectionConfig.protocol = protocol
        })
      },
      //
      //
      // TCP
      setPort: async (port) => {
        if (!get().ready) return
        if (!isDisconnected()) return

        const newPort = Number(port)
        if (!(await window.api.updateConnectionConfig({ tcp: { options: { port: newPort } } })))
          return

        set((state) => {
          state.connectionConfig.tcp.options.port = newPort
        })
      },
      setHost: async (host, valid) => {
        if (!get().ready) return
        if (!isDisconnected()) return

        // The field reads its text from the store, so an invalid host is kept
        // here and never sent. What the boundary never sees needs no answer.
        if (!valid) {
          set((state) => {
            state.valid.host = false
            state.connectionConfig.tcp.host = host
          })
          return
        }

        if (!(await window.api.updateConnectionConfig({ tcp: { host } }))) return

        set((state) => {
          state.valid.host = true
          state.connectionConfig.tcp.host = host
        })
      },
      //
      //
      // RTU
      setCom: async (com, valid) => {
        if (!get().ready) return
        if (!isDisconnected()) return

        // The field reads its text from the store, so a blank port name is
        // kept here and never sent. `ConnectionConfigRtuSchema` types `com` as
        // a string and takes a blank one, so the boundary had nothing to refuse
        // and main held a connection config naming no port.
        if (!valid) {
          set((state) => {
            state.valid.com = false
            state.connectionConfig.rtu.com = com
          })
          return
        }

        if (!(await window.api.updateConnectionConfig({ rtu: { com } }))) return

        set((state) => {
          state.valid.com = true
          state.connectionConfig.rtu.com = com
        })
      },
      setBaudRate: (baudRate) => setSerialOption(set, get, 'baudRate', baudRate),
      setParity: (parity) => setSerialOption(set, get, 'parity', parity),
      setDataBits: (dataBits) => setSerialOption(set, get, 'dataBits', dataBits),
      setStopBits: (stopBits) => setSerialOption(set, get, 'stopBits', stopBits),
      //
      //
      // Layout configuration settings
      setAddressBase: (addressBase) => setRegisterConfigField(set, get, 'addressBase', addressBase),
      setShow64BitValues: (show64BitValues) =>
        setRegisterConfigField(set, get, 'show64BitValues', show64BitValues),
      setAdvancedMode: (advancedMode) =>
        setRegisterConfigField(set, get, 'advancedMode', advancedMode),
      // Addressing
      setUnitId: async (unitId) => {
        const currentState = get()
        if (!currentState.ready) return

        // `UnitIdInput` is an `IMaskInput`, which fires `accept` when the value
        // it is handed differs from the empty mask it mounts with, so every
        // mount of the toolbar field and of the scan dialog's calls this with
        // the id the store already holds. The rows below would go with it.
        const newUnitId = Number(unitId)
        if (newUnitId === currentState.connectionConfig.unitId) return

        if (!(await window.api.updateConnectionConfig({ unitId: newUnitId }))) return

        set((state) => {
          state.connectionConfig.unitId = newUnitId
        })
        clearRegisterDataWhenIdle(true)
      },
      setAddress: async (address) => {
        const currentState = get()
        if (!currentState.ready) return

        const newAddress = Number(address)
        if (newAddress === currentState.registerConfig.address) return

        if (!(await window.api.updateRegisterConfig({ address: newAddress }))) return

        set((state) => {
          state.registerConfig.address = newAddress
        })
        clearRegisterDataWhenIdle(false)
      },
      setLength: async (length, valid) => {
        const currentState = get()
        if (!currentState.ready) return

        const newLength = Number(length)

        // The field reads its length from the store, so an empty or zero one is
        // kept here and never sent.
        if (!valid) {
          set((state) => {
            state.valid.length = false
            state.registerConfig.length = newLength
          })
          return
        }

        if (!(await window.api.updateRegisterConfig({ length: newLength }))) return

        set((state) => {
          state.valid.length = true
          state.registerConfig.length = newLength
        })
        clearRegisterDataWhenIdle(false)
      },
      setType: async (type) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ type }))) return

        set((state) => {
          state.registerConfig.type = type
        })
        clearRegisterDataWhenIdle(true)
      },
      setLittleEndian: async (littleEndian) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ littleEndian }))) return

        set((state) => {
          state.registerConfig.littleEndian = littleEndian
        })

        // The rows on screen were read in the other word order, and the
        // conversion happens where the reading does, so they stay that way
        // until the next read. An empty grid has nothing to put right.
        if (useDataZustand.getState().registerData.length > 0) readWhenMainCan()
      },
      setReadConfiguration: (readConfiguration) => {
        if (!get().ready) return
        set((state) => {
          state.readConfiguration = readConfiguration
        })
        window.api.setReadConfiguration(readConfiguration)

        // Turning it on puts the mapping in the grid through `showMapping`,
        // which gives every row `dummyWords`, and that reads `uint16: 0`. A
        // connected user was left looking at zeros nothing had asked a device
        // for. Main holds what the read needs by then: `ReadConfiguration`
        // flushes the mapping before it calls this, and the flag goes out on
        // the line above.
        if (readConfiguration) readWhenMainCan()
      },
      // Reading
      setPollRate: (pollRate) => setRegisterConfigField(set, get, 'pollRate', pollRate),
      setTimeout: (timeout) => setRegisterConfigField(set, get, 'timeout', timeout),

      // Serial port discovery
      serialPorts: [],
      serialPortsLoading: false,
      serialPortValidating: false,
      refreshSerialPorts: () => loadSerialPorts(set),
      validateSerialPort: async (portPath) => {
        set((state) => {
          state.serialPortValidating = true
        })
        try {
          return await window.api.validateSerialPort(portPath)
        } finally {
          set((state) => {
            state.serialPortValidating = false
          })
        }
      }
    })),
    {
      name: CLIENT_ZUSTAND_STORAGE_KEY,
      version: CURRENT_CLIENT_ZUSTAND_VERSION,
      migrate: (state, version) => {
        persistedVersion = version
        return migrateClientState(state, version) as PersistedClientZustand
      },
      partialize: (state) => ({
        name: state.name,
        connectionConfig: state.connectionConfig,
        registerConfig: state.registerConfig,
        registerMapping: state.registerMapping
      })
    }
  )
)

const clientZustand = useClientZustand.getState()

/**
 * The window this module may call main from, the question its siblings ask.
 * `layout.zustand`, `server.zustand` and `data.zustand` each read it too, and
 * `data.zustand`'s tail is the other one that calls main from module scope.
 *
 * `App.tsx` imports `containers/Client` statically and `Client.tsx:11` imports
 * this file, so `out/renderer/assets/` holds one js file and both windows
 * evaluate this module scope. Without the guard, opening the split out server
 * window ran `init`, which hands main the config this window loaded and calls
 * `setReadConfiguration(false)`. `modbusClient.ts:586` reads that flag, and off
 * it polls one flat `[address, length]` block instead of the configured groups,
 * while the main window's toggle still reads on. `init`'s own `set` writes
 * `CLIENT_ZUSTAND_STORAGE_KEY` as well, because persist wraps `setState`, so
 * the split window overwrote the shared key on every open.
 *
 * Every call this tail makes to main is inside the guard now. The app version
 * was the one outside it, and `layout.zustand` fetches it instead, beside the
 * field it fills and in both windows. What is left unguarded asks main nothing:
 * the repair below. Its `setState` still writes the shared key, for the same
 * reason `init`'s does.
 */
const isServerWindow = window.api.isServerWindow

// Keep the fields that parsed and default the rest, then say which went.
const repair = repairPersistedStore(useClientZustand, PersistedClientZustandSchema, {
  storageKey: CLIENT_ZUSTAND_STORAGE_KEY,
  persistedVersion,
  currentVersion: CURRENT_CLIENT_ZUSTAND_VERSION
})

if (repair) useClientZustand.setState({ ...repair.state, configReset: repair.reset })

// Sync the main process state with the front end
if (!isServerWindow) clientZustand.init()

//
//
// Stop scanning when reloaded, shouldn't be a problem with the build app,
// but just in case and for development, stop scanning when the frontend is reloaded
//
// The catch is what a module tail owes: nothing awaits this call, and a
// rejection with nothing behind it is an unhandled one. Main reports its own
// failures through `backend_message`, so a rejected invoke carries the channel
// name and nothing the user can act on.
if (!isServerWindow) {
  window.api
    .stopScanningUnitIds()
    .catch((error) => console.error('A running scan was not stopped:', error))
}
