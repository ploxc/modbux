import { Box, Button, Modal, Paper, TextField } from '@mui/material'
import { useRootZustand } from '@renderer/context/root.zustand'
import { forwardRef, useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { ScanProgress, TimeoutInput } from '../RegisterGrid/RegisterGridToolbar/components'
import { maskInputProps, MaskInputProps } from '@renderer/components/types'
import { IMaskInput, IMask } from 'react-imask'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import LengthInput from '@renderer/components/LengthInput'
import { useLayoutZustand } from '@renderer/context/layout.zustand'

interface ScanRegistersZustand {
  open: boolean
  setOpen: (open: boolean) => void
  range: [number, number]
  setMinRange: MaskSetFn
  setMaxRange: MaskSetFn
  length: number
  setLength: MaskSetFn
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
    range: [0, 9999],
    setMinRange: (min) =>
      set((state) => {
        state.range[0] = Number(min)
      }),
    setMaxRange: (max) =>
      set((state) => {
        state.range[1] = Number(max)
      }),
    length: 100,
    setLength: (length) =>
      set((state) => {
        state.length = Number(length)
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
// Min/Max Masks
const MinInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const max = useScanRegistersZustand((z) => z.range[1])

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      max={max}
      autofix
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
    />
  )
})

const MaxInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const min = useScanRegistersZustand((z) => z.range[0])

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={65535}
      autofix
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
    />
  )
})

//
//
// Min Max components
const MinTextField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const min = useScanRegistersZustand((z) => String(z.range[0]))
  const setMinRange = useScanRegistersZustand((z) => z.setMinRange)

  return (
    <TextField
      disabled={scanning}
      label="Min Address"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={min}
      slotProps={{
        input: {
          inputComponent: MinInput as any,
          inputProps: maskInputProps({ set: setMinRange })
        }
      }}
    />
  )
}

const MaxTextField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const max = useScanRegistersZustand((z) => String(z.range[1]))
  const setMaxRange = useScanRegistersZustand((z) => z.setMaxRange)

  return (
    <TextField
      disabled={scanning}
      label="Max Address"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={max}
      slotProps={{
        input: {
          inputComponent: MaxInput as any,
          inputProps: maskInputProps({ set: setMaxRange })
        }
      }}
    />
  )
}

//
//
// Length Input
const LengthField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const length = useScanRegistersZustand((z) => String(z.length))
  const setLength = useScanRegistersZustand((z) => z.setLength)

  return (
    <TextField
      disabled={scanning}
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={length}
      slotProps={{
        input: {
          inputComponent: LengthInput as any,
          inputProps: maskInputProps({ set: setLength })
        }
      }}
    />
  )
}

//
//
//
//
// Timeout field
const TimeoutField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
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
      slotProps={{
        input: {
          inputComponent: TimeoutInput as any,
          inputProps: maskInputProps({ set: setTimeout })
        }
      }}
    />
  )
}

//
//
//
//
// Scan button
const ScanButton = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)

  const scan = useCallback(() => {
    console.log('Scanning registers...', scanning)
    if (scanning) {
      window.api.stopScanningRegisters()
      return
    }

    window.api.stopPolling()

    const state = useScanRegistersZustand.getState()
    const rootState = useRootZustand.getState()
    const layoutState = useLayoutZustand.getState()
    rootState.clearScanUnitIdResults()
    rootState.setScanProgress(0)
    rootState.setRegisterData([])
    layoutState.setShowLog(true)

    const { length, range, timeout } = state

    window.api.scanRegisters({
      addressRange: range,
      length,
      timeout
    })
  }, [scanning])

  const text = useMemo(() => (scanning ? 'Stop Scanning' : 'Start Scanning'), [scanning])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button variant="contained" color={color} onClick={scan}>
      {text}
    </Button>
  )
}

//
//
// Scan registers button
const ScanRegisters = () => {
  const open = useScanRegistersZustand((z) => z.open)
  const setOpen = useScanRegistersZustand((z) => z.setOpen)

  const handleClose = useCallback(() => {
    const rootState = useRootZustand.getState()
    if (rootState.clientState.scanningRegisters) return
    setOpen(false)
  }, [setOpen])

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
            <MinTextField />
            <MaxTextField />
            <LengthField />
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
}

export default ScanRegisters
