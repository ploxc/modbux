import Delete from '@mui/icons-material/Delete'
import FileOpen from '@mui/icons-material/FileOpen'
import Save from '@mui/icons-material/Save'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { downloadJson } from '@renderer/components/shared/downloadJson'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useServerZustand } from '@renderer/context/server.zustand'
import { checkHasConfig, migrateServerConfig, resetMessage } from '@shared'
import {
  CURRENT_SERVER_CONFIG_VERSION,
  ServerConfig,
  ServerRegistersPerUnit,
  UnitIdStringSchema
} from '@shared'
import { snakeCase } from 'lodash'
import { useSnackbar } from 'notistack'
import { useRef, useState, useCallback } from 'react'

//
//
// Open button
type UseOpenHook = () => {
  opening: boolean
  openingRef: React.MutableRefObject<boolean>
  open: (file: File | undefined) => Promise<void>
}

const useOpen: UseOpenHook = () => {
  const openingRef = useRef(false)
  const [opening, setOpening] = useState(false)

  const { enqueueSnackbar } = useSnackbar()

  const open = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (openingRef.current) return
      openingRef.current = true
      setOpening(true)

      const serverZustand = useServerZustand.getState()

      try {
        const content = await file.text()

        // Use migration framework to handle all config versions
        const migrationResult = migrateServerConfig(content)
        const { config, migrated, warning, wasMixedEndianness, reset } = migrationResult

        // A unit the file does not name is not written over on the way in, so
        // whatever the previous config left on it would answer a master after
        // this one is loaded. Reset takes both sides down to nothing first.
        //
        // After the migration rather than before it, because `migrateServerConfig`
        // needs nothing from the store and throws on both shapes a user picks by
        // accident, a client config file and malformed JSON. Reset first, and the
        // configuration on screen was gone in main and in the store before
        // anything had read the file.
        await serverZustand.resetServer(serverZustand.selectedUuid)

        // Set name and littleEndian
        serverZustand.setName(config.name)
        serverZustand.setLittleEndian(config.littleEndian)

        // Load all unit configs
        for (const unitId of UnitIdStringSchema.options) {
          const serverRegisters = config.serverRegistersPerUnit[unitId]
          if (!serverRegisters) continue
          const hasConfig = checkHasConfig(serverRegisters)
          if (!hasConfig) continue
          serverZustand.replaceServerRegisters(unitId, serverRegisters)
        }

        // Show success notification
        if (migrated) {
          enqueueSnackbar({
            variant: 'info',
            message: 'Configuration updated from older format',
            autoHideDuration: 5000
          })
        } else {
          enqueueSnackbar({
            variant: 'success',
            message: 'Configuration opened successfully'
          })
        }

        // Show warning for mixed endianness
        if (wasMixedEndianness) {
          enqueueSnackbar({
            variant: 'warning',
            message: `Warning: Config had mixed byte order settings. Now using ${config.littleEndian ? 'Little' : 'Big'}-Endian globally. Please verify.`,
            autoHideDuration: 8000
          })
        }

        // A config from a newer Modbux is parsed against the current schema and
        // keeps what matches, so the warning says which fields did not come
        // across rather than that some feature may not work.
        if (warning === 'FUTURE_VERSION' && reset) {
          enqueueSnackbar({
            variant: 'warning',
            message: resetMessage('Server', reset),
            persist: true
          })
        }
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `Failed to load config: ${tError.message}` })
        console.error('Config load error:', error)
      } finally {
        // In the `finally` because `file.text()` is inside the `try` now, and a
        // file that is gone by the time it is read left `opening` true and
        // every server button disabled until the app was restarted.
        //
        // `init` runs either way: on a refused file it hands main the
        // configuration that is still there, which is the one on screen.
        await serverZustand.init(serverZustand.selectedUuid)

        openingRef.current = false
        setOpening(false)
      }
    },
    [enqueueSnackbar]
  )

  return { opening, openingRef, open }
}

//
//
// Saving
type UseSaveHook = () => {
  save: () => void
}

const useSave: UseSaveHook = () => {
  const save = useCallback(() => {
    const serverZustand = useServerZustand.getState()
    const { serverRegisters, selectedUuid, littleEndian } = serverZustand
    const name = serverZustand.name[selectedUuid] ?? ''

    const serverRegistersPerUnit: ServerRegistersPerUnit = {}

    const registersPerUnit = serverRegisters[selectedUuid]
    if (!registersPerUnit) return

    Object.entries(registersPerUnit).forEach(([unitId, registers]) => {
      if (!checkHasConfig(registers)) return
      serverRegistersPerUnit[unitId] = registers
    })

    // The store reads the version once at startup; it cannot change after that
    const modbuxVersion = useLayoutZustand.getState().version

    const config: ServerConfig = {
      version: CURRENT_SERVER_CONFIG_VERSION,
      modbuxVersion,
      name,
      littleEndian: littleEndian[selectedUuid] ?? false,
      serverRegistersPerUnit
    }
    downloadJson(`modbux_server_${snakeCase(name)}.json`, JSON.stringify(config, null, 2))
  }, [])

  return { save }
}

//
//
// Open save and clear the register configuration
const OpenSaveClear = meme(() => {
  const { opening, open } = useOpen()
  const { save } = useSave()

  const clear = useCallback(async () => {
    const serverZustand = useServerZustand.getState()
    serverZustand.setName('')
    await serverZustand.resetServer(serverZustand.selectedUuid)
  }, [])

  return (
    <Box sx={{ display: 'flex', gap: 0 }}>
      <div>
        {!opening && (
          <input
            data-testid="server-open-file-input"
            accept="application/JSON"
            style={{ display: 'none' }}
            id="container-button-server-file"
            type="file"
            onChange={(e) => open(e.target.files?.[0])}
          />
        )}
        <label htmlFor="container-button-server-file">
          <IconButton
            data-testid="server-open-btn"
            aria-label="Open configuration"
            color="primary"
            disabled={opening}
            component="span"
            title="Open configuration"
          >
            <FileOpen fontSize="small" />
          </IconButton>
        </label>
      </div>
      <IconButton
        data-testid="server-save-btn"
        aria-label="Save configuration"
        title="Save configuration"
        color="primary"
        disabled={opening}
        onClick={save}
      >
        <Save fontSize="small" />
      </IconButton>
      <IconButton
        data-testid="server-clear-btn"
        aria-label="Clear configuration"
        title="Clear configuration"
        color="primary"
        disabled={opening}
        onClick={clear}
      >
        <Delete fontSize="small" />
      </IconButton>
    </Box>
  )
})

export default OpenSaveClear
