import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Refresh from '@mui/icons-material/Refresh'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  BaudRateSelect,
  ComOption,
  ComTextField,
  DataBitsSelect,
  ParitySelect,
  StopBitsSelect
} from '@renderer/components/shared/inputs/SerialPortInputs'
import { useClientZustand, selectedClient, selectedSession } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { isConnectionAddressGiven } from '@shared'
import { useSnackbar } from 'notistack'
import { MouseEvent, useCallback, useEffect, useState } from 'react'
import ArrowDropDown from '@mui/icons-material/ArrowDropDown'
import SettingsInputComponent from '@mui/icons-material/SettingsInputComponent'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import OutlinedInput from '@mui/material/OutlinedInput'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'

/** The class of the COM port input, which the top bar narrows. */
export const COM_INPUT = 'com-input'

//
//
// COM Port Input
const ComInput = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const com = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.com)
  const comValid = useClientZustand((z) => selectedSession(z).valid.com)
  const loading = useClientZustand((z) => z.serialPortsLoading)
  const ports = useClientZustand((z) => z.serialPorts)

  // Typing is valid only once it is not blank; picking from the list always is.
  const handleInputChange = useCallback((_event: unknown, value: string): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setCom(value, isConnectionAddressGiven(value))
  }, [])

  const handleChange = useCallback((_event: unknown, value: string | null): void => {
    if (!value) return
    const clientZustand = useClientZustand.getState()
    clientZustand.setCom(value, true)
  }, [])

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={ports.map((p) => p.path)}
      value={com}
      data-testid="rtu-com-input"
      onInputChange={handleInputChange}
      onChange={handleChange}
      // Fixed, so the top bar folds at the same width whatever ports are plugged in.
      className={COM_INPUT}
      sx={{ width: 160 }}
      renderInput={(params) => (
        <ComTextField {...params} comLabel="COM Port" comError={!comValid} comLoading={loading} />
      )}
      renderOption={(props, option) => {
        const manufacturer = ports.find((p) => p.path === option)?.manufacturer
        return <ComOption {...props} option={option} manufacturer={manufacturer} />
      }}
    />
  )
})

//
//
// COM Port Actions
const ComActions = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const com = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.com)
  const loading = useClientZustand((z) => z.serialPortsLoading)
  const validating = useClientZustand((z) => z.serialPortValidating)
  const { enqueueSnackbar } = useSnackbar()

  const onRefresh = (): void => {
    useClientZustand.getState().refreshSerialPorts()
  }

  // A diagnostic, and it says what it found in a snackbar. It wrote `valid.com`
  // as well, and that flag means something narrower: whether main was given
  // what the field holds. `validateSerialPort` answers no for any path
  // `getPorts()` does not enumerate, and a socat or other virtual pty is
  // connectable and never enumerated, so pressing this on one greyed Connect
  // with nothing but retyping the field to undo it.
  const onValidate = async (): Promise<void> => {
    if (!isConnectionAddressGiven(com)) return
    const result = await useClientZustand.getState().validateSerialPort(com)
    enqueueSnackbar({
      message: result.message,
      variant: result.valid ? 'success' : 'warning'
    })
  }

  return (
    <ToggleButtonGroup
      size="large"
      disabled={disabled}
      sx={{
        '& .MuiToggleButton-root:first-of-type': {
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: 'none'
        }
      }}
    >
      <ToggleButton
        value="refresh"
        onClick={onRefresh}
        disabled={disabled || loading}
        data-testid="rtu-refresh-btn"
        aria-label="Refresh COM ports"
        title="Refresh COM ports"
        sx={{ width: 32 }}
      >
        {loading ? <CircularProgress size={16} /> : <Refresh fontSize="small" />}
      </ToggleButton>
      <ToggleButton
        value="validate"
        onClick={onValidate}
        disabled={disabled || validating || !isConnectionAddressGiven(com)}
        data-testid="rtu-validate-btn"
        aria-label="Validate COM port"
        title="Validate COM port"
        sx={{ width: 32 }}
      >
        {validating ? <CircularProgress size={16} /> : <CheckCircleOutlined fontSize="small" />}
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
// COM Port (composite)
const Com = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )

  useEffect(() => {
    if (!disabled) useClientZustand.getState().refreshSerialPorts()
  }, [disabled])

  return (
    <Box sx={{ display: 'flex' }}>
      <ComInput />
      <ComActions />
    </Box>
  )
})

//
//
// Selects (thin wrappers over shared components)
const ClientBaudRateSelect = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const baudRate = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.options.baudRate)

  const setBaudRate = useClientZustand.getState().setBaudRate

  return <BaudRateSelect value={baudRate} onChange={setBaudRate} disabled={disabled} />
})

const ClientParitySelect = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const parity = useClientZustand(
    (z) => selectedClient(z).connectionConfig.rtu.options.parity ?? 'none'
  )

  const setParity = useClientZustand.getState().setParity

  return <ParitySelect value={parity} onChange={setParity} disabled={disabled} />
})

const ClientDataBitsSelect = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const dataBits = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.options.dataBits)

  const setDataBits = useClientZustand.getState().setDataBits

  return (
    <DataBitsSelect label="Data Bits" value={dataBits} onChange={setDataBits} disabled={disabled} />
  )
})

const ClientStopBitsSelect = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const stopBits = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.options.stopBits)

  const setStopBits = useClientZustand.getState().setStopBits

  return (
    <StopBitsSelect label="Stop Bits" value={stopBits} onChange={setStopBits} disabled={disabled} />
  )
})

/** The letter a parity is written with in a framing like 8N1. */
const PARITY_LETTERS = { none: 'N', even: 'E', odd: 'O' } as const

/**
 * The line settings as one field, `9600 · 8N1`, opening the four selects
 * under it. A popper rather than a popover: no backdrop, so a click on the
 * next field lands there and closes this one.
 */
/** The class of the serial field, which the top bar hides when it narrows. */
export const SERIAL_FIELD = 'serial-field'
/** The class of the button that opens the same settings instead. */
export const SERIAL_TOGGLE = 'serial-toggle'

const SerialSettings = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const baudRate = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.options.baudRate)
  const parity = useClientZustand(
    (z) => selectedClient(z).connectionConfig.rtu.options.parity ?? 'none'
  )
  const dataBits = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.options.dataBits)
  const stopBits = useClientZustand((z) => selectedClient(z).connectionConfig.rtu.options.stopBits)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.currentTarget
    setAnchor((open) => (open ? null : target))
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  return (
    // On mousedown: a select opens its menu on mousedown, so the click that
    // follows ends on the menu's backdrop and reaches the document, not this tree.
    <ClickAwayListener mouseEvent="onMouseDown" onClickAway={handleClose}>
      <Box>
        <IconButton
          className={SERIAL_TOGGLE}
          size="large"
          disabled={disabled}
          aria-label="Serial line settings"
          title={`Serial: ${baudRate} · ${dataBits}${PARITY_LETTERS[parity]}${stopBits}`}
          data-testid="rtu-serial-btn"
          onClick={handleOpen}
        >
          <SettingsInputComponent fontSize="small" />
        </IconButton>
        <FormControl size="large" className={SERIAL_FIELD} sx={{ width: 120 }} disabled={disabled}>
          <InputLabel shrink>Serial</InputLabel>
          <OutlinedInput
            readOnly
            notched
            label="Serial"
            value={`${baudRate} · ${dataBits}${PARITY_LETTERS[parity]}${stopBits}`}
            onClick={disabled ? undefined : handleOpen}
            endAdornment={<ArrowDropDown sx={{ color: 'action.active', mr: -0.75 }} />}
            inputProps={{ 'data-testid': 'rtu-serial-field', 'aria-label': 'Serial line settings' }}
            // The arrow follows the text, so the input keeps no padding before it.
            sx={{ cursor: 'pointer', '&& .MuiInputBase-input': { cursor: 'pointer', pr: 0 } }}
          />
        </FormControl>
        <Popper
          open={anchor !== null}
          anchorEl={anchor}
          placement="bottom-start"
          sx={(theme) => ({ zIndex: theme.zIndex.modal })}
        >
          <Paper
            sx={{
              mt: 1,
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              // One column: the four selects as wide as the narrowest baud rate needs.
              '& > .MuiFormControl-root > .MuiInputBase-root': { width: 90 }
            }}
            data-testid="rtu-serial-settings"
          >
            <ClientBaudRateSelect />
            <ClientParitySelect />
            <ClientDataBitsSelect />
            <ClientStopBitsSelect />
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  )
})

const RtuConfig = meme((): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'no-wrap', gap: 1 }}>
      <Com />
      <SerialSettings />
    </Box>
  )
})
export default RtuConfig
