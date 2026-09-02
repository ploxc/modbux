import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { ElementType, useCallback, useMemo } from 'react'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import { dropPendingScanRows, useDataZustand } from '@renderer/context/data.zustand'
import {
  ScanCloseButton,
  ScanFoundCount,
  ScanGridToggle,
  ScanProgress,
  ScanTimeoutField
} from '../../ScanProgress/ScanProgress'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useScanRegistersZustand } from './scanRegisters.zustand'

//
//
// Unit ID field (syncs with main connection config)
const UnitIdField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const unitId = useClientZustand((z) => String(z.connectionConfig.unitId))

  const setUnitId = useClientZustand.getState().setUnitId

  return (
    <TextField
      disabled={scanning}
      label="Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={unitId}
      data-testid="scan-unitid-input"
      slotProps={{
        input: {
          inputComponent: UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setUnitId })
        }
      }}
    />
  )
})

//
//
// Address field with base toggle
const AddressField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const address = useScanRegistersZustand((z) => z.address)

  const setAddress = useScanRegistersZustand.getState().setAddress

  return (
    <AddressBaseInput
      disabled={scanning}
      address={address}
      setAddress={setAddress}
      testId="scan-address-input"
      baseTestId="scan-base"
    />
  )
})

//
//
// Scan Length field
const ScanLengthField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const scanLength = useScanRegistersZustand((z) => String(z.scanLength))

  const setScanLength = useScanRegistersZustand.getState().setScanLength

  return (
    <TextField
      disabled={scanning}
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={scanLength}
      data-testid="scan-length-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setScanLength })
        }
      }}
    />
  )
})

//
//
// Chunk Size field
const ChunkSizeField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const chunkSize = useScanRegistersZustand((z) => String(z.chunkSize))
  const type = useClientZustand((z) => z.registerConfig.type)
  const isCoilType = ['coils', 'discrete_inputs'].includes(type)
  const max = isCoilType ? 2000 : 125

  const setChunkSize = useScanRegistersZustand.getState().setChunkSize

  return (
    <TextField
      disabled={scanning}
      label="Chunk Size"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={chunkSize}
      data-testid="scan-chunk-size-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setChunkSize, max })
        }
      }}
    />
  )
})

//
//
// Timeout field
const TimeoutField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const timeout = useScanRegistersZustand((z) => z.timeout)

  const setTimeout = useScanRegistersZustand.getState().setTimeout

  return (
    <ScanTimeoutField
      disabled={scanning}
      timeout={timeout}
      setTimeout={setTimeout}
      testId="scan-timeout-input"
    />
  )
})

//
//
// Found count
//
// The grid shows the first rows, not how many there are, and the main process
// only sends back what is worth keeping: it drops every register that reads as
// zero. So the length of the grid data is the count of what the scan turned
// up, and it means that while a scan is running, since the same list holds
// polled data the rest of the time.
const FoundCount = meme((): JSX.Element | null => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const count = useDataZustand((z) => z.registerData.length)

  if (!scanning) return null

  return <ScanFoundCount count={count} testId="scan-found-count" />
})

//
//
// Show the grid while scanning
const GridToggle = meme((): JSX.Element => {
  const shown = useLayoutZustand((z) => z.showGridWhileScanning)

  const handleToggle = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.toggleShowGridWhileScanning()
  }, [])

  return <ScanGridToggle shown={shown} toggle={handleToggle} />
})

//
//
// Scan button
const ScanButton = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)

  const scan = useCallback(async () => {
    if (scanning) {
      window.api.stopScanningRegisters()
      return
    }

    window.api.stopPolling()

    const scanRegistersZustand = useScanRegistersZustand.getState()
    const clientZustand = useClientZustand.getState()
    const dataZustand = useDataZustand.getState()
    clientZustand.setReadConfiguration(false)
    // A scan walks raw addresses, which is what the extra columns are for, and
    // the rows land in a grid you are now watching fill.
    if (!clientZustand.registerConfig.advancedMode) clientZustand.setAdvancedMode(true)
    clientZustand.clearScanUnitIdResults()
    clientZustand.setScanProgress(0)
    dropPendingScanRows()
    dataZustand.setRegisterData([])

    const { address, scanLength, chunkSize, timeout } = scanRegistersZustand

    await window.api.scanRegisters({
      addressRange: [address, address + scanLength - 1],
      length: chunkSize,
      timeout
    })
  }, [scanning])

  const text = useMemo(() => (scanning ? 'Stop Scanning' : 'Start Scanning'), [scanning])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button variant="contained" color={color} onClick={scan} data-testid="scan-start-stop-btn">
      {text}
    </Button>
  )
})

//
//
// Scan registers button
const ScanRegisters = meme(() => {
  const open = useScanRegistersZustand((z) => z.open)

  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)

  const handleClose = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    if (clientZustand.clientState.scanningRegisters) return
    useScanRegistersZustand.getState().setOpen(false)
  }, [])

  return (
    <Modal
      open={open}
      // Escape still closes. A click beside it does not: the dialog sits over
      // the grid it fills, and reaching for anything behind it closed the scan
      // you were setting up.
      onClose={(_, reason) => reason !== 'backdropClick' && handleClose()}
      // No shade over the grid, and nothing swallowing what happens there: the
      // rows arriving underneath are the point. The grid itself takes away
      // everything but scrolling and paging while the scan runs.
      hideBackdrop
      sx={{
        display: 'flex',
        justifyContent: 'center',
        pt: 2,
        px: 2,
        pointerEvents: 'none',
        '& > *': { pointerEvents: 'auto' }
      }}
    >
      <Paper
        // No shadow: it fell across the grid it is covering, and a strip that
        // sits on the toolbar does not need to float above it.
        elevation={0}
        sx={(theme) => ({
          background: theme.palette.background.default,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          gap: 2,
          p: 2,
          // A fixed strip rather than a box that grows with its contents, so it
          // reads as an overlay laid over the grid toolbar it covers.
          height: 102,
          justifyContent: 'flex-start'
        })}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
            flexWrap: 'wrap',
            width: '100%'
          }}
        >
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <UnitIdField />
            <AddressField />
            <ScanLengthField />
            <ChunkSizeField />
            <TimeoutField />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FoundCount />
            <GridToggle />
            <ScanButton />
            <ScanCloseButton
              disabled={scanning}
              close={handleClose}
              testId="scan-registers-close-btn"
            />
          </Box>
        </Box>
        <ScanProgress />
      </Paper>
    </Modal>
  )
})

export default ScanRegisters
