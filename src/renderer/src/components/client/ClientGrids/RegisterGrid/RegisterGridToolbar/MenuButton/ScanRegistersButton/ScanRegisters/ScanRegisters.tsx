/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Box, Button, InputBaseComponentProps, Modal, Paper, TextField } from '@mui/material'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ElementType, useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import { useDataZustand } from '@renderer/context/data.zustand'
import { ScanProgress, TimeoutInput } from '../../ScanProgress/ScanProgress'
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
  const timeout = useScanRegistersZustand((z) => String(z.timeout))
  const setTimeout = useScanRegistersZustand((z) => z.setTimeout)

  return (
    <TextField
      disabled={scanning}
      label="Timeout (ms)"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={timeout}
      data-testid="scan-timeout-input"
      slotProps={{
        input: {
          inputComponent: TimeoutInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setTimeout })
        }
      }}
    />
  )
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
    rootState.clearScanUnitIdResults()
    rootState.setScanProgress(0)
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

  const handleClose = useCallback(() => {
    const rootState = useRootZustand.getState()
    if (rootState.clientState.scanningRegisters) return
    useScanRegistersZustand.getState().setOpen(false)
  }, [])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      sx={{ display: 'flex', justifyContent: 'center', pt: 2, px: 2 }}
      slotProps={{ backdrop: { sx: { background: 'rgba(0,0,0,0.25)' } } }}
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
          <Box sx={{ display: 'flex', gap: 2 }}>
            <ScanButton />
          </Box>
        </Box>
        <ScanProgress />
      </Paper>
    </Modal>
  )
})

export default ScanRegisters
