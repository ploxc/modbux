import Box from '@mui/material/Box'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import {
  useClientZustand,
  getSelectedClient,
  selectedClient,
  selectedClientUuid
} from '@renderer/context/client.zustand'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import {
  dropPendingScanRows,
  useDataZustand,
  dataOf,
  getShownData
} from '@renderer/context/data.zustand'
import ScanCloseButton from '../scan/ScanCloseButton'
import ScanFoundCount from '../scan/ScanFoundCount'
import ScanGridToggle from '../scan/ScanGridToggle'
import ScanProgress from '../scan/ScanProgress'
import ScanStartStopButton from '../scan/ScanStartStopButton'
import ScanTimeoutField from '../scan/ScanTimeoutField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MAX_REGISTER_ADDRESS, maxReadQuantity, unitIdOutOfRange } from '@shared'
import { useScanRegistersZustand } from './scanRegisters.zustand'

//
//
// Unit ID field (syncs with main connection config)
const UnitIdField = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)
  const unitId = useClientZustand((z) => String(selectedClient(z).connectionConfig.unitId))
  // A string or undefined, which compares equal from one read to the next.
  const outOfRange = useClientZustand((z) => unitIdOutOfRange(selectedClient(z).connectionConfig))

  const setUnitId = useClientZustand.getState().setUnitId

  return (
    <Tooltip title={outOfRange ?? ''}>
      <TextField
        disabled={scanning}
        label="Unit ID"
        variant="outlined"
        size="small"
        sx={{ width: 60 }}
        error={outOfRange !== undefined}
        value={unitId}
        data-testid="scan-unitid-input"
        slotProps={{
          input: {
            inputComponent: UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
            inputProps: maskInputProps({ set: setUnitId })
          }
        }}
      />
    </Tooltip>
  )
})

//
//
// Address field with base toggle
const AddressField = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)
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
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)
  const scanLength = useScanRegistersZustand((z) => z.scanLength)

  const setScanLength = useScanRegistersZustand.getState().setScanLength

  const handleBlur = useCallback(
    () => setScanLength(String(Math.max(1, scanLength))),
    [scanLength, setScanLength]
  )

  // Clearing the field stores `Number('') === 0`, and a scan of no addresses
  // ran its loop zero times while the dialog flipped scanning on and off. The
  // floor is on the blur, where `clampScanTimeout` put the timeout's for a
  // measured reason: a bound on the mask rewrites what you type. `ScanButton`
  // holds the same floor for the field that never gets a blur.
  return (
    <TextField
      disabled={scanning}
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={String(scanLength)}
      onBlur={handleBlur}
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
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)
  const chunkSize = useScanRegistersZustand((z) => z.chunkSize)
  const type = useClientZustand((z) => selectedClient(z).registerConfig.type)
  // The protocol's pair, stated once in `ranges.ts`: this field computed it by
  // hand and the unit id scan's Length field computed nothing at all. The floor
  // is on the blur, the way Length's is: `ScanRegistersParametersSchema` takes
  // a positive length.
  const max = maxReadQuantity([type])

  const setChunkSize = useScanRegistersZustand.getState().setChunkSize

  const handleBlur = useCallback(
    () => setChunkSize(String(Math.max(1, chunkSize))),
    [chunkSize, setChunkSize]
  )

  return (
    <TextField
      disabled={scanning}
      label="Chunk Size"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={String(chunkSize)}
      onBlur={handleBlur}
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
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)
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
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)
  const count = useDataZustand((z) => dataOf(z, selectedUuid).registerData.length)

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

  return <ScanGridToggle shown={shown} toggle={handleToggle} testId="scan-grid-toggle-btn" />
})

//
//
// Scan button
const ScanButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  const scan = useCallback(async () => {
    if (scanning) {
      window.api.stopScanningRegisters(selectedClientUuid())
      return
    }

    const scanRegistersZustand = useScanRegistersZustand.getState()
    const clientZustand = useClientZustand.getState()
    const dataZustand = useDataZustand.getState()
    clientZustand.setReadConfiguration(false)
    // A scan walks raw addresses, which is what the extra columns are for, and
    // the rows land in a grid you are now watching fill.
    if (!getSelectedClient().registerConfig.advancedMode) clientZustand.setAdvancedMode(true)
    const uuid = selectedClientUuid()
    dataZustand.setScanProgress(uuid, 0)
    dropPendingScanRows(uuid)
    dataZustand.setRegisterData(uuid, [])

    const { address, scanLength, chunkSize, timeout } = scanRegistersZustand

    // Clamped where the request is built rather than left to the boundary. Read
    // configuration is off and the grid is empty by the time the boundary
    // answers, and `advancedMode` is persisted, so that write outlives the
    // launch.
    //
    // Address and Length each stop at 65535, so 60000 and 10000 name address
    // 69999, which `RegisterAddressSchema` refuses.
    //
    // The floors are here as well as on each field's blur, because Escape
    // closes the dialog and the field unmounts without one, leaving the
    // `Number('') === 0` of a cleared field in the store. A length of none
    // gives a range ending before it starts, which the schema takes and the
    // scan loop never enters.
    await window.api.scanRegisters({
      uuid: selectedClientUuid(),
      parameters: {
        addressRange: [
          address,
          Math.min(MAX_REGISTER_ADDRESS, address + Math.max(1, scanLength) - 1)
        ],
        length: Math.max(1, chunkSize),
        timeout
      }
    })
  }, [scanning])

  return <ScanStartStopButton scanning={scanning} scan={scan} testId="scan-start-stop-btn" />
})

//
//
// Scan registers button
const ScanRegisters = meme(() => {
  const open = useScanRegistersZustand((z) => z.open)

  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  const handleClose = useCallback(() => {
    if (getShownData().clientState.scanningRegisters) return
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
