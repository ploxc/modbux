import { FileOpen } from '@mui/icons-material'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterMapConfigSchema, RegisterMappingSchema } from '@shared'
import { useSnackbar } from 'notistack'
import { useRef, useState, useCallback } from 'react'
import { showMapping } from '../ViewConfigButton/ViewConfigButton'
import { meme } from '@renderer/components/shared/inputs/meme'

const LoadButton = meme((): JSX.Element => {
  const openingRef = useRef(false)
  const [opening, setOpening] = useState(false)

  const { enqueueSnackbar } = useSnackbar()

  const openConfig = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (openingRef.current) return
      openingRef.current = true
      setOpening(true)

      const state = useRootZustand.getState()

      let content = await file.text()

      try {
        // replace legacy strings
        content = content.replaceAll('InputRegisters', 'input_registers')
        content = content.replaceAll('DiscreteInputs', 'discrete_inputs')
        content = content.replaceAll('Coils', 'coils')
        content = content.replaceAll('HoldingRegisters', 'holding_registers')

        const configObject = JSON.parse(content)
        const configResult = RegisterMapConfigSchema.safeParse(configObject)

        if (configResult.success) {
          const { name, registerMapping } = configResult.data
          if (name) state.setName(name)
          state.replaceRegisterMapping(registerMapping)
          enqueueSnackbar({ variant: 'success', message: 'Configuration opened successfully' })
        }

        // Legacy format, without name
        const legacyConfigResult = RegisterMappingSchema.safeParse(configObject)

        if (legacyConfigResult.success) {
          state.setName('')
          state.replaceRegisterMapping(legacyConfigResult.data)
          enqueueSnackbar({
            variant: 'warning',
            message:
              'Configuration opened successfully (legacy format), consider saving with the new format.'
          })
        }

        if (!configResult.success && !legacyConfigResult.success) {
          enqueueSnackbar({ variant: 'error', message: 'Invalid Config' })
          console.warn({
            configResult: configResult.error,
            legacyConfigResult: legacyConfigResult.error
          })
        }
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `INVALID JSON: ${tError.message}` })
      }

      openingRef.current = false
      setOpening(false)
      showMapping()
      useRootZustand.getState().setReadConfiguration(false)
    },
    [enqueueSnackbar]
  )

  return (
    <Box>
      {!opening && (
        <input
          data-testid="load-config-file-input"
          accept="application/JSON"
          style={{ display: 'none' }}
          id="contained-button-file"
          type="file"
          onChange={(e) => openConfig(e.target.files?.[0])}
        />
      )}
      <label htmlFor="contained-button-file">
        <IconButton
          data-testid="load-config-btn"
          aria-label="Load configuration"
          size="small"
          disabled={opening}
          color="primary"
          component="span"
          title="load a modbux client configuration file"
        >
          <FileOpen fontSize="small" />
        </IconButton>
      </label>
    </Box>
  )
})

export default LoadButton
