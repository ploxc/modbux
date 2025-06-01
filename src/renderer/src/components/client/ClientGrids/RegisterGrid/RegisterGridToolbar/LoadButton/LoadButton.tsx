import { FileOpen } from '@mui/icons-material'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterMappingSchema } from '@shared'
import { useSnackbar } from 'notistack'
import { useRef, useState, useCallback } from 'react'
import { showMapping } from '../ViewConfigButton/ViewConfigButton'

const LoadButton = () => {
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
        const configResult = RegisterMappingSchema.safeParse(configObject)

        if (configResult.success) {
          const registerMapping = configResult.data
          state.replaceRegisterMapping(registerMapping)
          enqueueSnackbar({ variant: 'success', message: 'Configuration opened successfully' })
        } else {
          enqueueSnackbar({ variant: 'error', message: 'Invalid Config' })
          console.log(configResult.error)
        }
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `INVALID JSON: ${tError.message}` })
      }

      openingRef.current = false
      setOpening(false)
      showMapping()
    },
    [enqueueSnackbar]
  )

  return (
    <Box>
      {!opening && (
        <input
          accept="application/JSON"
          style={{ display: 'none' }}
          id="contained-button-file"
          type="file"
          onChange={(e) => openConfig(e.target.files?.[0])}
        />
      )}
      <label htmlFor="contained-button-file">
        <IconButton
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
}

export default LoadButton
