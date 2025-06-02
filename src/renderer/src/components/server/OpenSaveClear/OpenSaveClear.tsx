import { FileOpen, Save, Delete } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { ServerConfig, ServerConfigSchema, ServerRegistersSchema } from '@shared'
import { DateTime } from 'luxon'
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
          const { serverRegisters, name } = configResult.data
          state.setName(name)
          state.replaceServerRegisters(serverRegisters)
          enqueueSnackbar({ variant: 'success', message: 'Configuration opened successfully' })
        }

        // Legacy format, without name
        const legacyConfigResult = ServerRegistersSchema.safeParse(configObject)

        if (legacyConfigResult.success) {
          state.setName('')
          state.replaceServerRegisters(legacyConfigResult.data)
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

      await window.api.restartServer(state.selectedUuid)

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

    const config: ServerConfig = {
      name: z.name[selectedUuid] || '',
      serverRegisters: serverRegisters[selectedUuid]
    }
    const configJson = JSON.stringify(config)

    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(configJson))

    const filename = `modbux_server_config_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}.json`

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

  const clear = useCallback(() => {
    const serverState = useServerZustand.getState()
    serverState.setName('')
    serverState.resetBools('coils')
    serverState.resetBools('discrete_inputs')
    serverState.resetRegisters('holding_registers')
    serverState.resetRegisters('input_registers')
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
