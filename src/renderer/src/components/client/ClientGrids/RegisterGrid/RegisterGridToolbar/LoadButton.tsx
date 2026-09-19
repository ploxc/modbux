import FileOpen from '@mui/icons-material/FileOpen'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useClientZustand } from '@renderer/context/client.zustand'
import { migrateClientConfig, resetMessage } from '@shared'
import { useSnackbar } from 'notistack'
import { useRef, useState, useCallback } from 'react'
import { showMapping } from '@renderer/context/data.zustand'
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

      const clientZustand = useClientZustand.getState()

      try {
        const content = await file.text()

        // Use migration framework to handle all config versions
        const migrationResult = migrateClientConfig(content)
        const { config, migrated, futureVersion } = migrationResult

        // Set name, endianness and register mapping
        if (config.name) clientZustand.setName(config.name)
        clientZustand.setLittleEndian(config.littleEndian)
        await clientZustand.replaceRegisterMapping(config.registerMapping)

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

        // A config from a newer Modbux is parsed against the current schema
        // and keeps what matches, so the warning says which fields did not come
        // across rather than that some feature may not work.
        if (futureVersion) {
          enqueueSnackbar({
            variant: 'warning',
            message: resetMessage('Client', futureVersion),
            // A notice that everything came across is not one the user has to
            // dismiss, and it sits on top of "Configuration opened
            // successfully" either way.
            persist: futureVersion.fields.length > 0,
            autoHideDuration: 8000
          })
        }
        // Inside the `try`, because it draws the grid from the mapping: on a
        // file that was refused the mapping is the one already there, and the
        // rows it builds would drop the values a read loop had put in them.
        showMapping()
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `Failed to load config: ${tError.message}` })
        console.error('Config load error:', error)
      } finally {
        // Whatever the read did, the button takes another file. `opening`
        // renders the input behind `{!opening && ...}` and disables the button.
        openingRef.current = false
        setOpening(false)
      }
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
