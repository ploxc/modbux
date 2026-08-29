/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Box, Button, InputBaseComponentProps, Modal, Paper, TextField } from '@mui/material'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ElementType, useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import { dropPendingScanRows, useDataZustand } from '@renderer/context/data.zustand'
import {
  ScanCloseButton,
  ScanFoundChip,
  ScanGridToggle,
  ScanProgress,
  ScanTimeoutField
} from '../../ScanProgress/ScanProgress'
import { meme } from '@renderer/components/shared/inputs/meme'

interface ScanRegistersZustand {
  open: boolean
  setOpen: (open: boolean) => void
  address: number
  setAddress: MaskSetFn
  scanLength: number
  setScanLength: MaskSetFn
  chunkSize: number
  setChunkSize: MaskSetFn
  timeout: number
  setTimeout: MaskSetFn
}
export const useScanRegistersZustand = create<ScanRegistersZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    open: false,
    setOpen: (open) =>
      set((state) => {
        state.open = open
      }),
    address: 0,
    setAddress: (address) =>
      set((state) => {
        state.address = Number(address)
      }),
    scanLength: 10000,
    setScanLength: (scanLength) =>
      set((state) => {
        state.scanLength = Number(scanLength)
      }),
    chunkSize: 100,
    setChunkSize: (chunkSize) =>
      set((state) => {
        state.chunkSize = Number(chunkSize)
      }),
    timeout: 500,
    setTimeout: (timeout) =>
      set((state) => {
        state.timeout = Number(timeout)
      })
  }))
)

//
//
// Unit ID field (syncs with main connection config)
const UnitIdField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const unitId = useRootZustand((z) => String(z.connectionConfig.unitId))
  const setUnitId = useRootZustand((z) => z.setUnitId)

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
}

//
//
// Address field with base toggle
const AddressField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const address = useScanRegistersZustand((z) => z.address)
  const setAddress = useScanRegistersZustand((z) => z.setAddress)

  return (
    <AddressBaseInput
      disabled={scanning}
      address={address}
      setAddress={setAddress}
      testId="scan-address-input"
      baseTestId="scan-base"
    />
  )
}

//
//
// Scan Length field
const ScanLengthField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const scanLength = useScanRegistersZustand((z) => String(z.scanLength))
  const setScanLength = useScanRegistersZustand((z) => z.setScanLength)

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
}

//
//
// Chunk Size field
const ChunkSizeField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const chunkSize = useScanRegistersZustand((z) => String(z.chunkSize))
  const setChunkSize = useScanRegistersZustand((z) => z.setChunkSize)
  const type = useRootZustand((z) => z.registerConfig.type)
  const isCoilType = ['coils', 'discrete_inputs'].includes(type)
  const max = isCoilType ? 2000 : 125

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
}

//
//
// Timeout field
const TimeoutField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const timeout = useScanRegistersZustand((z) => z.timeout)
  const setTimeout = useScanRegistersZustand((z) => z.setTimeout)

  return (
    <ScanTimeoutField
      disabled={scanning}
      timeout={timeout}
      setTimeout={setTimeout}
      testId="scan-timeout-input"
    />
  )
}

//
//
// Found count
//
// The grid shows the first rows, not how many there are, and the main process
// only sends back what is worth keeping: it drops every register that reads as
// zero. So the length of the grid data is the count of what the scan turned
// up, and it means that while a scan is running, since the same list holds
// polled data the rest of the time.
const FoundCount = (): JSX.Element | null => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const count = useDataZustand((z) => z.registerData.length)

  if (!scanning) return null

  return <ScanFoundChip count={count} testId="scan-found-chip" />
}

//
//
// Show the grid while scanning
const GridToggle = (): JSX.Element => {
  const shown = useLayoutZustand((z) => z.showGridWhileScanning)
  const toggle = useLayoutZustand((z) => z.toggleShowGridWhileScanning)

  return <ScanGridToggle shown={shown} toggle={toggle} />
}

//
//
// Scan button
const ScanButton = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)

  const scan = useCallback(async () => {
    if (scanning) {
      window.api.stopScanningRegisters()
      return
    }

    window.api.stopPolling()

    const state = useScanRegistersZustand.getState()
    const rootState = useRootZustand.getState()
    const dataState = useDataZustand.getState()
    rootState.setReadConfiguration(false)
    // A scan walks raw addresses, which is what the extra columns are for, and
    // the rows land in a grid you are now watching fill.
    if (!rootState.registerConfig.advancedMode) rootState.setAdvancedMode(true)
    rootState.clearScanUnitIdResults()
    rootState.setScanProgress(0)
    dropPendingScanRows()
    dataState.setRegisterData([])

    const { address, scanLength, chunkSize, timeout } = state

    await window.api.scanRegisters({
      addressRange: [address, address + scanLength - 1],
      length: chunkSize,
      timeout
    })

    useScanRegistersZustand.getState().setOpen(false)
  }, [scanning])

  const text = useMemo(() => (scanning ? 'Stop Scanning' : 'Start Scanning'), [scanning])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button variant="contained" color={color} onClick={scan} data-testid="scan-start-stop-btn">
      {text}
    </Button>
  )
}

//
//
// Scan registers button
const ScanRegisters = meme(() => {
  const open = useScanRegistersZustand((z) => z.open)

  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)

  const handleClose = useCallback(() => {
    const rootState = useRootZustand.getState()
    if (rootState.clientState.scanningRegisters) return
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
        elevation={5}
        sx={(theme) => ({
          background: theme.palette.background.default,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          gap: 2,
          p: 2,
          height: 'fit-content'
        })}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
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
