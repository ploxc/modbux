/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Box, Button, InputBaseComponentProps, Modal, Paper, TextField } from '@mui/material'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ElementType, forwardRef, useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { IMaskInput, IMask } from 'react-imask'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import LengthInput from '@renderer/components/shared/inputs/LengthInput'
import { useDataZustand } from '@renderer/context/data.zustand'
import { ScanProgress, TimeoutInput } from '../../ScanProgress/ScanProgress'
import { meme } from '@renderer/components/shared/inputs/meme'

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
      onAccept={(value) => set(value, true)}
    />
  )
})

MinInput.displayName = 'MinInput'

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
      onAccept={(value) => set(value, true)}
    />
  )
})

MaxInput.displayName = 'MaxInput'

//
//
// Min Max components
const MinTextField = (): JSX.Element => {
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
      data-testid="scan-min-address-input"
      slotProps={{
        input: {
          inputComponent: MinInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMinRange })
        }
      }}
    />
  )
}

const MaxTextField = (): JSX.Element => {
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
      data-testid="scan-max-address-input"
      slotProps={{
        input: {
          inputComponent: MaxInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMaxRange })
        }
      }}
    />
  )
}

//
//
// Length Input
const LengthField = (): JSX.Element => {
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
      data-testid="scan-length-input"
      slotProps={{
        input: {
          inputComponent: LengthInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
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
const TimeoutField = (): JSX.Element => {
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
    rootState.clearScanUnitIdResults()
    rootState.setScanProgress(0)
    dataState.setRegisterData([])

    const { length, range, timeout } = state

    await window.api.scanRegisters({
      addressRange: range,
      length,
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
})

export default ScanRegisters
