import { FileOpen, Save, Delete } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { checkHasConfig, migrateServerConfig } from '@shared'
import { ServerConfig, ServerRegistersPerUnit, UnitIdStringSchema } from '@shared'
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

      const state = useServerZustand.getState()

      // Reset the server before opening a new configuration
      // This way we can ensure that the server is in a clean state
      // When unitId's are configured which are not present in the file
      // there would be remaining registers in the server because
      // they are now overwritten
      await window.api.resetServer(state.selectedUuid)
      // Also clean the zustand state
      // to ensure that the state is in a clean state
      state.clean(state.selectedUuid)

      const content = await file.text()

      try {
        // Use migration framework to handle all config versions
        const migrationResult = migrateServerConfig(content)
        const { config, migrated, warning, wasMixedEndianness } = migrationResult

        // Set name and littleEndian
        state.setName(config.name)
        state.setLittleEndian(config.littleEndian)

        // Load all unit configs
        UnitIdStringSchema.options.forEach(async (unitId) => {
          const serverRegisters = config.serverRegistersPerUnit[unitId]
          if (!serverRegisters) return
          const hasConfig = checkHasConfig(serverRegisters)
          if (!hasConfig) return
          state.replaceServerRegisters(unitId, serverRegisters)
          await new Promise((r) => setTimeout(r, 1))
        })

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

        // Show warning for future version
        if (warning === 'FUTURE_VERSION') {
          enqueueSnackbar({
            variant: 'warning',
            message:
              'This config was created with a newer version of Modbux. Some features may not work correctly.',
            persist: true
          })
        }
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `Failed to load config: ${tError.message}` })
        console.error('Config load error:', error)
      }

      // Synchronize only the selected server after opening the configuration
      await state.init(state.selectedUuid)

      openingRef.current = false
      setOpening(false)
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
  const save = useCallback(async () => {
    const z = useServerZustand.getState()
    const { serverRegisters, selectedUuid, littleEndian } = z
    const name = z.name[selectedUuid] ?? ''

    const serverRegistersPerUnit: ServerRegistersPerUnit = {}

    const registersPerUnit = serverRegisters[selectedUuid]
    if (!registersPerUnit) return

    Object.entries(registersPerUnit).forEach(([unitId, registers]) => {
      if (!checkHasConfig(registers)) return
      serverRegistersPerUnit[unitId] = registers
    })

    // Get app version
    const modbuxVersion = await window.api.getAppVersion()

    const config: ServerConfig = {
      version: 2,
      modbuxVersion,
      name,
      littleEndian: littleEndian[selectedUuid] ?? false,
      serverRegistersPerUnit
    }
    const configJson = JSON.stringify(config, null, 2)

    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(configJson))

    const filename = `modbux_server_${snakeCase(name)}.json`

    element.setAttribute('download', filename)
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
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
    const state = useServerZustand.getState()
    state.setName('')
    // Reset the server before opening a new configuration
    // This way we can ensure that the server is in a clean state
    // When unitId's are configured which are not present in the file
    // there would be remaining registers in the server because
    // they are now overwritten
    await window.api.resetServer(state.selectedUuid)
    // Also clean the zustand state
    // to ensure that the state is in a clean state
    state.clean(state.selectedUuid)
  }, [])

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
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
            <FileOpen />
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
        <Save />
      </IconButton>
      <IconButton
        data-testid="server-clear-btn"
        aria-label="Clear configuration"
        title="Clear configuration"
        color="primary"
        disabled={opening}
        onClick={clear}
      >
        <Delete />
      </IconButton>
    </Box>
  )
})

export default OpenSaveClear
