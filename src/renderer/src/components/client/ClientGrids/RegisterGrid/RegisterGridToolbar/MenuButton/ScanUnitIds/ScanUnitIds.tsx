import {
  Box,
  Button,
  InputBaseComponentProps,
  Modal,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ElementType, useCallback, useMemo } from 'react'
import useScanUnitIdColumns from './_columns'
import { useScanUnitIdZustand } from './_zustand'
import {
  ScanCloseButton,
  ScanFoundChip,
  ScanProgress,
  ScanTimeoutField
} from '../ScanProgress/ScanProgress'
import { meme } from '@renderer/components/shared/inputs/meme'

//
//
// Start Unit ID field
const StartUnitIdField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const startUnitId = useScanUnitIdZustand((z) => String(z.startUnitId))
  const setStartUnitId = useScanUnitIdZustand((z) => z.setStartUnitId)

  return (
    <TextField
      disabled={scanning}
      label="Start Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 100 }}
      value={startUnitId}
      data-testid="scan-start-unitid-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setStartUnitId, max: 255 })
        }
      }}
    />
  )
}

//
//
// Count field
const CountField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const count = useScanUnitIdZustand((z) => String(z.count))
  const setCount = useScanUnitIdZustand((z) => z.setCount)

  return (
    <TextField
      disabled={scanning}
      label="Count"
      variant="outlined"
      size="small"
      sx={{ width: 80 }}
      value={count}
      data-testid="scan-unitid-count-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setCount, max: 256 })
        }
      }}
    />
  )
}

//
//
// Address field with base toggle
const AddressField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const address = useScanUnitIdZustand((z) => z.address)
  const setAddress = useScanUnitIdZustand((z) => z.setAddress)

  return (
    <AddressBaseInput
      disabled={scanning}
      address={address}
      setAddress={setAddress}
      testId="scan-unitid-address-input"
      baseTestId="scan-unitid-base"
    />
  )
}

//
//
// Length field
const LengthField = (): JSX.Element => {
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
      data-testid="scan-unitid-length-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setLength })
        }
      }}
    />
  )
}

//
//
// Timeout field
const TimeoutField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const timeout = useScanUnitIdZustand((z) => z.timeout)
  const setTimeout = useScanUnitIdZustand((z) => z.setTimeout)

  return (
    <ScanTimeoutField
      disabled={scanning}
      timeout={timeout}
      setTimeout={setTimeout}
      testId="scan-unitid-timeout-input"
    />
  )
}

//
//
// Select register types
const SelectRegisterTypes = (): JSX.Element => {
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
      <ToggleButton value={'coils'}>Coils</ToggleButton>
      <ToggleButton value={'discrete_inputs'}>Discrete Inputs</ToggleButton>
      <ToggleButton value={'input_registers'}>Input Registers</ToggleButton>
      <ToggleButton value={'holding_registers'}>Holding Registers</ToggleButton>
    </ToggleButtonGroup>
  )
}

//
//
// Found count
//
// Every scanned unit ID lands in the results, answering or not, so the count
// is the ones that answered on at least one register type.
const FoundCount = (): JSX.Element | null => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const scanned = useRootZustand((z) => z.scanUnitIdResults.length)
  const count = useRootZustand(
    (z) => z.scanUnitIdResults.filter((result) => result.registerTypes.length > 0).length
  )

  if (!scanning && scanned === 0) return null

  return <ScanFoundChip count={count} testId="scan-unitid-found-chip" />
}

//
// Scan button
const ScanButton = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const polling = useRootZustand((z) => z.clientState.polling)
  const disabled = useScanUnitIdZustand((z) => z.registerTypes.length === 0)

  const scan = useCallback(() => {
    if (scanning) {
      window.api.stopScanningUnitIds()
      return
    }

    window.api.stopPolling()

    const state = useScanUnitIdZustand.getState()
    const rootState = useRootZustand.getState()
    rootState.clearScanUnitIdResults()
    rootState.setScanProgress(0)

    const { address, length, startUnitId, count, registerTypes, timeout } = state

    window.api.scanUnitIds({
      address,
      length,
      range: [startUnitId, startUnitId + count - 1],
      registerTypes,
      timeout
    })
  }, [scanning])

  const text = useMemo(() => (scanning ? 'Stop Scanning' : 'Start Scanning'), [scanning])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button
      disabled={disabled || polling}
      variant="contained"
      color={color}
      onClick={scan}
      data-testid="scan-unitid-start-stop-btn"
    >
      {text}
    </Button>
  )
}

//
//
// Scan result grid
const ScanResultGrid = meme(() => {
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
      // Results are listed per unit ID and that is the order you look them up
      // in. The type columns keep their column menu on purpose -- filtering to
      // "only units that answered for holding registers" is useful; reordering
      // them is not.
      disableColumnSorting
      sx={{
        // x-data-grid v8 moved the column headers inside the virtual scroller
        // for column virtualisation, so scoping monospace to the scroller now
        // catches the headers too. Target the data rows instead.
        '& .MuiDataGrid-row': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        }
      }}
      localeText={{
        noRowsLabel: 'No scan results yet'
      }}
    />
  )
})

//
//
// Scan unit ids button
const ScanUnitIdsButton = (): JSX.Element => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'connected')
  const setScanUnitIdsOpen = useScanUnitIdZustand((z) => z.setOpen)
  return (
    <Button
      disabled={disabled}
      sx={{ my: 1 }}
      size="small"
      variant="outlined"
      onClick={() => setScanUnitIdsOpen(true)}
      data-testid="scan-unitids-btn"
    >
      Scan Unit ID{`'`}s
    </Button>
  )
}

//
//
// MAIN
const ScanUnitIds = meme(() => {
  const open = useScanUnitIdZustand((z) => z.open)
  const setOpen = useScanUnitIdZustand((z) => z.setOpen)

  // Don't close while scanning
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)

  const handleClose = useCallback(() => {
    const currentRootState = useRootZustand.getState()
    if (currentRootState.clientState.scanningUniId) return
    setOpen(false)
  }, [setOpen])

  return (
    <>
      <ScanUnitIdsButton />
      <Modal
        open={open}
        // Escape still closes. A click on the backdrop does not: the dialog fills
        // the window, and reaching for anything behind it closed the scan you
        // were setting up, results and all.
        onClose={(_, reason) => reason !== 'backdropClick' && handleClose()}
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
            height: '90dvh',
            width: '90dvw',
            minHeight: 0
          })}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <StartUnitIdField />
              <CountField />
              <AddressField />
              <LengthField />
              <TimeoutField />
              <SelectRegisterTypes />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <FoundCount />
              <ScanButton />
              <ScanCloseButton
                disabled={scanning}
                close={handleClose}
                testId="scan-unitid-close-btn"
              />
            </Box>
          </Box>
          <ScanProgress />
          <Paper sx={{ flex: 1, height: '100%', minHeight: 0 }}>
            <ScanResultGrid />
          </Paper>
        </Paper>
      </Modal>
    </>
  )
})
export default ScanUnitIds
