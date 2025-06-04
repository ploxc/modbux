import { FileOpen, Save, Delete } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { checkHasConfig, useServerZustand } from '@renderer/context/server.zustand'
import {
  ServerConfig,
  ServerConfigSchema,
  ServerRegistersPerUnit,
  ServerRegistersSchema,
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

      let content = await file.text()

      try {
        // replace legacy strings
        content = content.replaceAll('InputRegisters', 'input_registers')
        content = content.replaceAll('DiscreteInputs', 'discrete_inputs')
        content = content.replaceAll('Coils', 'coils')
        content = content.replaceAll('HoldingRegisters', 'holding_registers')

        const configObject = JSON.parse(content)
        const configResult = ServerConfigSchema.safeParse(configObject)

        if (configResult.success) {
          const { serverRegistersPerUnit, name } = configResult.data
          state.setName(name)
          UnitIdStringSchema.options.forEach(async (unitId) => {
            const serverRegisters = serverRegistersPerUnit[unitId]
            if (!serverRegisters) return
            const hasConfig = checkHasConfig(serverRegisters)
            if (!hasConfig) return
            state.replaceServerRegisters(unitId, serverRegisters)
            await new Promise((r) => setTimeout(r, 1))
          })

          enqueueSnackbar({ variant: 'success', message: 'Configuration opened successfully' })
        }

        // Legacy format, without name
        const legacyConfigResult = ServerRegistersSchema.safeParse(configObject)

        if (legacyConfigResult.success) {
          state.setName('')
          state.replaceServerRegisters('0', legacyConfigResult.data)
          enqueueSnackbar({
            variant: 'warning',
            message:
              'Configuration opened successfully (legacy format), consider saving with the new format.'
          })
        }

        if (!configResult.success && !legacyConfigResult.success) {
          enqueueSnackbar({ variant: 'error', message: 'Invalid Config' })
          console.log({
            configResult: configResult.error,
            legacyConfigResult: legacyConfigResult.error
          })
        }
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `INVALID JSON: ${tError.message}` })
      }

      // Need to initialize the server again after opening the configuration
      // to synchronize the front with backend registers
      await state.init()

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
  const save = useCallback(() => {
    const z = useServerZustand.getState()
    const { serverRegisters, selectedUuid } = z
    const name = z.name[selectedUuid] || ''

    const serverRegistersPerUnit: ServerRegistersPerUnit = {}
    const uuids = Object.keys(serverRegisters)
    uuids.forEach((uuid) => {
      const registersPerUnit = serverRegisters[uuid]
      Object.entries(registersPerUnit).forEach(([unitId, registers]) => {
        if (!checkHasConfig(registers)) return
        if (!serverRegistersPerUnit[unitId]) {
          serverRegistersPerUnit[unitId] = {}
        }
        serverRegistersPerUnit[unitId] = registers
      })
    })

    const config: ServerConfig = {
      name,
      serverRegistersPerUnit
    }
    const configJson = JSON.stringify(config)

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
    <Box sx={{ display: 'flex' }}>
      <div>
        {!opening && (
          <input
            accept="application/JSON"
            style={{ display: 'none' }}
            id="container-button-server-file"
            type="file"
            onChange={(e) => open(e.target.files?.[0])}
          />
        )}
        <label htmlFor="container-button-server-file">
          <IconButton
            color="primary"
            disabled={opening}
            component="span"
            title="load a modbux server configuration file"
          >
            <FileOpen />
          </IconButton>
        </label>
      </div>
      <IconButton color="primary" disabled={opening} onClick={save}>
        <Save />
      </IconButton>
      <IconButton color="primary" disabled={opening} onClick={clear}>
        <Delete />
      </IconButton>
    </Box>
  )
})

export default OpenSaveClear
