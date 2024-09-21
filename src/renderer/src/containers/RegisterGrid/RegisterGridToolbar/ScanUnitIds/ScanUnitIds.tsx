import {
  Box,
  Button,
  Modal,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { maskInputProps, MaskInputProps } from '@renderer/components/types'
import UIntInput from '@renderer/components/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterType } from '@shared'
import { forwardRef, useCallback, useMemo } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import useScanUnitIdColumns from './_columns'
import { useScanUnitIdZustand } from './_zustand'

//
//
// Min/Max Masks
const MinInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const max = useScanUnitIdZustand((z) => z.range[1])

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      max={max}
      autofix
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
      overwrite
    />
  )
})

const MaxInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const min = useScanUnitIdZustand((z) => z.range[0])

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={247}
      autofix
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
      overwrite
    />
  )
})

//
//
// Min Max components
const MinTextField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const min = useScanUnitIdZustand((z) => String(z.range[0]))
  const setMinRange = useScanUnitIdZustand((z) => z.setMinRange)

  return (
    <TextField
      disabled={scanning}
      label="Min Unit ID"
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
  const max = useScanUnitIdZustand((z) => String(z.range[1]))
  const setMaxRange = useScanUnitIdZustand((z) => z.setMaxRange)

  return (
    <TextField
      disabled={scanning}
      label="Max Unit ID"
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
//
//
// Address field
const AddressField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const address = useScanUnitIdZustand((z) => String(z.address))
  const setAddress = useScanUnitIdZustand((z) => z.setAddress)

  return (
    <TextField
      disabled={scanning}
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: setAddress })
        }
      }}
    />
  )
}

//
//
//
//
// Length field
const LengthField = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const length = useScanUnitIdZustand((z) => String(z.length))
  const setLength = useScanUnitIdZustand((z) => z.setLength)

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
          inputComponent: UIntInput as any,
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
// Select register types
const SelectRegisterTypes = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)
  const setRegisterTypes = useScanUnitIdZustand((z) => z.setRegisterTypes)

  return (
    <ToggleButtonGroup
      disabled={scanning}
      color="primary"
      size="small"
      value={registerTypes}
      onChange={(_, rt) => setRegisterTypes(rt)}
      aria-label="text formatting"
    >
      <ToggleButton value={RegisterType.Coils}>Coils</ToggleButton>
      <ToggleButton value={RegisterType.DiscreteInputs}>Discrete Inputs</ToggleButton>
      <ToggleButton value={RegisterType.InputRegisters}>Input Registers</ToggleButton>
      <ToggleButton value={RegisterType.HoldingRegisters}>Holding Registers</ToggleButton>
    </ToggleButtonGroup>
  )
}

//
//
//
//
// Scan button
const ScanButton = () => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const disabled = useScanUnitIdZustand((z) => z.registerTypes.length === 0)

  const scan = useCallback(() => {
    if (scanning) {
      window.api.stopScanningUnitId()
      return
    }
    const state = useScanUnitIdZustand.getState()
    const rootState = useRootZustand.getState()
    rootState.clearScanUnitIdResults()

    const { address, length, range, registerTypes } = state

    window.api.scanUnitId({
      address,
      length,
      range,
      registerTypes
    })
  }, [scanning])

  const text = useMemo(() => (scanning ? 'Stop Scanning' : 'Start Scanning'), [scanning])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button disabled={disabled} variant="contained" color={color} onClick={scan}>
      {text}
    </Button>
  )
}

//
//
//
//
// Scan result grid
const ScanResultGrid = () => {
  const scanResults = useRootZustand((z) => z.scanUnitIdResults)

  const columns = useScanUnitIdColumns()

  return (
    <DataGrid
      rows={scanResults}
      columns={columns}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      getRowHeight={() => 'auto'}
      sx={(theme) => ({
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        },
        '& .MuiDataGrid-toolbarContainer': {
          background: theme.palette.background.default
        }
      })}
      localeText={{
        noRowsLabel: 'No scan results yet'
      }}
    />
  )
}

//
//
//
//
// MAIN
const ScanUnitIds = () => {
  const open = useScanUnitIdZustand((z) => z.open)
  const setOpen = useScanUnitIdZustand((z) => z.setOpen)

  // Don't close while scanning
  const handleClose = useCallback(() => {
    const currentRootState = useRootZustand.getState()
    if (currentRootState.clientState.scanningUniId) return
    setOpen(false)
  }, [setOpen])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      <Paper
        elevation={5}
        sx={(theme) => ({
          background: theme.palette.background.default,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          p: 3,
          height: '95dvh',
          width: '95dvw',
          minHeight: 0
        })}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <MinTextField />
            <MaxTextField />
            <AddressField />
            <LengthField />
            <SelectRegisterTypes />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <ScanButton />
          </Box>
        </Box>
        <Paper sx={{ flex: 1, height: '100%', minHeight: 0 }}>
          <ScanResultGrid />
        </Paper>
      </Paper>
    </Modal>
  )
}
export default ScanUnitIds
