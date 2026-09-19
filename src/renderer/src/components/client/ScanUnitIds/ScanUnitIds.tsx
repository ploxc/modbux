import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { alpha } from '@mui/material/styles'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useClientZustand } from '@renderer/context/client.zustand'
import { MAX_UNIT_ID, maxReadQuantity, RegisterType } from '@shared'
import { ElementType, useCallback, useMemo } from 'react'
import useScanUnitIdColumns from './_columns'
import { useScanUnitIdZustand } from './scanUnitIds.zustand'
import { ScanCloseButton, ScanProgress, ScanTimeoutField } from '../ScanProgress/ScanProgress'
import { meme } from '@renderer/components/shared/inputs/meme'

//
//
// Start Unit ID field
const StartUnitIdField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const startUnitId = useScanUnitIdZustand((z) => String(z.startUnitId))

  const setStartUnitId = useScanUnitIdZustand.getState().setStartUnitId

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
})

//
//
// Count field
const CountField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const count = useScanUnitIdZustand((z) => z.count)

  const setCount = useScanUnitIdZustand.getState().setCount

  // Clearing the field stores `Number('') === 0`, and a count of none scanned
  // nothing while the dialog flipped scanning on and off. The floor sits on the
  // blur, where `clampScanTimeout` put the timeout's for a measured reason: a
  // bound on the mask rewrites what you type.
  return (
    <TextField
      disabled={scanning}
      label="Count"
      variant="outlined"
      size="small"
      sx={{ width: 80 }}
      value={String(count)}
      onBlur={() => setCount(String(Math.max(1, count)))}
      data-testid="scan-unitid-count-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setCount, max: 256 })
        }
      }}
    />
  )
})

//
//
// Address field with base toggle
const AddressField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const address = useScanUnitIdZustand((z) => z.address)

  const setAddress = useScanUnitIdZustand.getState().setAddress

  return (
    <AddressBaseInput
      disabled={scanning}
      address={address}
      setAddress={setAddress}
      testId="scan-unitid-address-input"
      baseTestId="scan-unitid-base"
    />
  )
})

//
//
// Length field
const LengthField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const length = useScanUnitIdZustand((z) => z.length)

  // The field passed no `max`, so `UintInput`'s default of 65535 was typeable
  // and went to the socket as the quantity. `maxReadQuantity` is the protocol's
  // own pair, and it reads the types selected because one length goes out for
  // every one of them. The floor is the blur's, the way Count's is:
  // `ScanUnitIDParametersSchema` takes a positive length.
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)
  const max = maxReadQuantity(registerTypes)

  const setLength = useScanUnitIdZustand.getState().setLength

  return (
    <TextField
      disabled={scanning}
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={String(length)}
      onBlur={() => setLength(String(Math.max(1, length)))}
      data-testid="scan-unitid-length-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setLength, max })
        }
      }}
    />
  )
})

//
//
// Timeout field
const TimeoutField = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const timeout = useScanUnitIdZustand((z) => z.timeout)

  const setTimeout = useScanUnitIdZustand.getState().setTimeout

  return (
    <ScanTimeoutField
      disabled={scanning}
      timeout={timeout}
      setTimeout={setTimeout}
      testId="scan-unitid-timeout-input"
    />
  )
})

//
//
// Select register types
const SelectRegisterTypes = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)

  const handleChange = useCallback((_event: unknown, value: RegisterType[]): void => {
    const scanUnitIdZustand = useScanUnitIdZustand.getState()
    scanUnitIdZustand.setRegisterTypes(value)
  }, [])

  return (
    <ToggleButtonGroup
      disabled={scanning}
      color="primary"
      size="small"
      value={registerTypes}
      onChange={handleChange}
      aria-label="Register types to scan"
    >
      {/* The same short names the result columns carry, so the button you
          press and the column it produces read the same. The full name is on
          each one for anything reading the page out. */}
      <ToggleButton value={'coils'} aria-label="Coils" data-testid="scan-unitid-type-coils">
        Coils
      </ToggleButton>
      <ToggleButton
        value={'discrete_inputs'}
        aria-label="Discrete inputs"
        data-testid="scan-unitid-type-discrete-inputs"
      >
        Inputs
      </ToggleButton>
      <ToggleButton
        value={'input_registers'}
        aria-label="Input registers"
        data-testid="scan-unitid-type-input-registers"
      >
        Input Reg.
      </ToggleButton>
      <ToggleButton
        value={'holding_registers'}
        aria-label="Holding registers"
        data-testid="scan-unitid-type-holding-registers"
      >
        Holding
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
// Scan button
const ScanButton = meme((): JSX.Element => {
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)
  const disabled = useScanUnitIdZustand((z) => z.registerTypes.length === 0)

  const scan = useCallback(() => {
    if (scanning) {
      window.api.stopScanningUnitIds()
      return
    }

    const scanUnitIdZustand = useScanUnitIdZustand.getState()
    const clientZustand = useClientZustand.getState()
    clientZustand.clearScanUnitIdResults()
    clientZustand.setScanProgress(0)

    const { address, length, startUnitId, count, registerTypes, timeout } = scanUnitIdZustand

    // Clamped where the request is built rather than left to the boundary. Each
    // field masks to its own ceiling and the request is bounded by a pair: a
    // length typed under one set of register types stays in the store when
    // another is selected, and Start caps at 255 with Count at 256, so 200 and
    // 100 name unit id 299. The boundary refuses what it is given and the
    // results are already cleared by then.
    window.api.scanUnitIds({
      address,
      length: Math.min(length, maxReadQuantity(registerTypes)),
      range: [startUnitId, Math.min(MAX_UNIT_ID, startUnitId + count - 1)],
      registerTypes,
      timeout
    })
  }, [scanning])

  const text = useMemo(() => (scanning ? 'Stop Scanning' : 'Start Scanning'), [scanning])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button
      disabled={disabled}
      variant="contained"
      color={color}
      onClick={scan}
      data-testid="scan-unitid-start-stop-btn"
    >
      {text}
    </Button>
  )
})

//
//
// Scan result grid
const ScanResultGrid = meme(() => {
  const scanResults = useClientZustand((z) => z.scanUnitIdResults)
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)

  const columns = useScanUnitIdColumns()

  return (
    <DataGrid
      // Turning a register type on or off changes which columns exist, and the
      // grid carries width state across that: the error column is the only one
      // on flex, and it came back at zero often enough to look like it had
      // disappeared. A new column set is a new grid.
      key={registerTypes.join('|')}
      rows={scanResults}
      columns={columns}
      autoHeight={false}
      density="compact"
      columnHeaderHeight={48}
      getRowHeight={() => 'auto'}
      // Results are listed per unit ID and that is the order you look them up
      // in. The type columns keep their column menu on purpose -- filtering to
      // "only units that answered for holding registers" is useful; reordering
      // them is not.
      disableColumnSorting
      sx={(theme) => ({
        // The answer is the cell, not a badge inside it: green for a reply
        // with data, amber for a unit that answered by refusing, red for one
        // that said nothing at all.
        '& .scan-answered': { backgroundColor: alpha(theme.palette.success.main, 0.22) },
        '& .scan-refused': { backgroundColor: alpha(theme.palette.warning.main, 0.22) },
        '& .scan-silent': { backgroundColor: alpha(theme.palette.error.main, 0.22) },
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
      })}
      localeText={{
        noRowsLabel: 'No scan results yet'
      }}
    />
  )
})

//
//
// MAIN
/**
 * The dialog only. It is mounted beside the client view rather than inside the
 * menu that opens it: a Popover unmounts its children when it closes, so a
 * dialog rendered in there goes with the menu the moment the menu does.
 */
const ScanUnitIds = meme(() => {
  const open = useScanUnitIdZustand((z) => z.open)

  // Don't close while scanning
  const scanning = useClientZustand((z) => z.clientState.scanningUnitIds)

  const handleClose = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    const scanUnitIdZustand = useScanUnitIdZustand.getState()
    if (clientZustand.clientState.scanningUnitIds) return
    // The results belong to the dialog. Leaving them behind means the next
    // scan opens on the last one and fills in around it.
    clientZustand.clearScanUnitIdResults()
    scanUnitIdZustand.setOpen(false)
  }, [])

  return (
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
  )
})
export default ScanUnitIds
