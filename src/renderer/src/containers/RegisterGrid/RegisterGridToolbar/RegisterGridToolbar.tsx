import { Delete, FileOpen, Menu, MoreVert, Save } from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Popover,
  Paper,
  Typography,
  Slider,
  ButtonProps,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Tooltip
} from '@mui/material'
import EndianTable from '@renderer/components/EndianTable'
import { meme } from '@renderer/components/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ConnectState, RegisterMapping, RegisterType } from '@shared'
import { DateTime } from 'luxon'
import { useSnackbar } from 'notistack'
import { useCallback, useRef, useState } from 'react'

//
//
//
//
// Read
const ReadButton = () => {
  const disabled = useRootZustand(
    (z) => z.clientState.connectState !== ConnectState.Connected || z.clientState.polling
  )

  const [reading, setReading] = useState(false)
  const readingRef = useRef(false)

  const setRegisterData = useRootZustand((z) => z.setRegisterData)

  // Read registers, prevent sending the command until the read is done
  const handleRead = useCallback(async () => {
    if (readingRef.current) return
    readingRef.current = true
    setReading(true)

    const registerData = await window.api.read()
    if (registerData) setRegisterData(registerData)

    readingRef.current = false
    setReading(false)
  }, [])

  const color: ButtonProps['color'] = reading ? 'warning' : 'primary'

  return (
    <Button disabled={disabled} color={color} size="small" variant="outlined" onClick={handleRead}>
      Read
    </Button>
  )
}

//
//
//
//
// Poll
const PollButton = () => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== ConnectState.Connected)

  const polling = useRootZustand((z) => z.clientState.polling)
  const togglePolling = useCallback(() => {
    polling ? window.api.stopPolling() : window.api.startPolling()
  }, [polling])

  const variant: ButtonProps['variant'] = polling ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = polling ? 'warning' : 'primary'

  return (
    <Button
      disabled={disabled}
      size="small"
      color={color}
      variant={variant}
      onClick={togglePolling}
    >
      Poll
    </Button>
  )
}

//
//
//
//
// Clear register Data
const ClearButton = () => {
  const disabled = useRootZustand((z) => z.registerData.length === 0 || z.clientState.polling)
  const setRegisterData = useRootZustand((z) => z.setRegisterData)

  const handleClear = useCallback(() => {
    setRegisterData([])
  }, [])

  return (
    <Button disabled={disabled} size="small" variant="outlined" onClick={handleClear}>
      Clear
    </Button>
  )
}

//
//
//
//
// Show log button
const ShowLogButton = () => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const toggleShowLog = useLayoutZustand((z) => z.toggleShowLog)

  const variant: ButtonProps['variant'] = showLog ? 'contained' : 'outlined'
  const text = showLog ? 'Hide Log' : 'Show Log'

  return (
    <Button size="small" variant={variant} onClick={toggleShowLog}>
      {text}
    </Button>
  )
}

//
//
//
//
// Menu with extra options
const MenuContent = () => {
  const advanced = useRootZustand((z) => z.registerConfig.advancedMode)
  const setAdvanced = useRootZustand((z) => z.setAdvancedMode)

  const show64bit = useRootZustand((z) => z.registerConfig.show64BitValues)
  const setShow64Bit = useRootZustand((z) => z.setShow64BitValues)

  return (
    <FormGroup>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={advanced}
            onChange={(e) => setAdvanced(e.target.checked)}
          />
        }
        label="Advanced mode"
      />
      <FormControlLabel
        disabled={!advanced}
        control={
          <Checkbox
            size="small"
            checked={show64bit}
            onChange={(e) => setShow64Bit(e.target.checked)}
          />
        }
        label="Show 64 bit values"
      />
    </FormGroup>
  )
}

// Menu button for extra options menu
const MenuButton = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

  const registers16Bit = [RegisterType.InputRegisters, RegisterType.HoldingRegisters].includes(type)
  if (!registers16Bit) return null

  return (
    <>
      <Button
        ref={buttonRef}
        size="small"
        variant={'outlined'}
        onClick={() => setAnchorEl(buttonRef.current)}
        sx={{ minWidth: 40 }}
      >
        <Menu />
      </Button>
      <Popover
        sx={{ mt: 1, background: 'transparent' }}
        slotProps={{ paper: { sx: { px: 2, py: 1 } } }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        <MenuContent />
      </Popover>
    </>
  )
}

//
//
//
//
// Slider component
interface SliderComponentProps {
  label: string
  value: number
  setValue: (value: number) => void
}
const SliderComponent = ({ label, value, setValue }: SliderComponentProps) => {
  const labelWidth = 70
  const valueWidth = 25

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 1
      }}
    >
      <Typography color="primary" variant="overline" sx={{ width: labelWidth }}>
        {label}
      </Typography>
      <Box sx={{ px: 1, display: 'flex' }}>
        <Slider
          size="small"
          sx={{ width: 100 }}
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(_, v) => {
            const value = Array.isArray(v) ? v.at(0) : v
            if (value === undefined) return
            setValue(value)
          }}
        />
      </Box>
      <Typography color="primary" variant="overline" sx={{ textAlign: 'right', width: valueWidth }}>
        {value} s
      </Typography>
    </Box>
  )
}

// Polling interval slider
const PollRate = () => {
  const value = useRootZustand((z) => Math.floor(z.registerConfig.pollRate / 1000))
  const setValue = useRootZustand((z) => z.setPollRate)

  return <SliderComponent label="Poll Rate" value={value} setValue={(v) => setValue(v * 1000)} />
}

// Read Timeout slider
const Timeout = () => {
  const value = useRootZustand((z) => Math.floor(z.registerConfig.timeout / 1000))
  const setValue = useRootZustand((z) => z.setTimeout)

  return <SliderComponent label="Timeout" value={value} setValue={(v) => setValue(v * 1000)} />
}

//
//
//
//
// Popover with sliders
const SettingPopover = meme(() => {
  const polling = useRootZustand((z) => z.clientState.polling)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(anchorEl ? null : event.currentTarget)
  }
  return (
    <Box sx={{ display: 'flex' }}>
      <IconButton disabled={polling} size="small" color="primary" onClick={handleOpenMenu}>
        <MoreVert />
      </IconButton>
      <Popover
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorEl={anchorEl}
        disablePortal={false}
      >
        <Paper elevation={3} sx={{ p: 1 }}>
          <PollRate />
          <Timeout />
        </Paper>
      </Popover>
    </Box>
  )
})

//
//
//
//
// Toggle endianness button
const ToggleEndianButton = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const littleEndian = useRootZustand((z) => z.registerConfig.littleEndian)
  const setLittleEndian = useRootZustand((z) => z.setLittleEndian)

  const registers16Bit = [RegisterType.InputRegisters, RegisterType.HoldingRegisters].includes(type)
  if (!registers16Bit) return null

  return (
    <Tooltip
      slotProps={{ tooltip: { sx: { background: 'transparent', m: 0 } } }}
      title={<EndianTable />}
      enterDelay={1000}
    >
      <ToggleButtonGroup
        sx={{ height: 29.5 }}
        size="small"
        exclusive
        color="primary"
        value={littleEndian}
        onChange={(_, v) => v !== null && setLittleEndian(v)}
      >
        <ToggleButton value={false} sx={{ whiteSpace: 'nowrap' }}>
          BE
        </ToggleButton>
        <ToggleButton value={true}>LE</ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  )
}

//
//
//
//
// Save register mapping configuration
const SaveButton = () => {
  const saveRegisterConfig = useCallback(() => {
    const z = useRootZustand.getState()
    const { registerMapping } = z
    const registerMappingJson = JSON.stringify(registerMapping, null, 2)

    var element = document.createElement('a')
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(registerMappingJson)
    )
    element.setAttribute(
      'download',
      `modbus_register_config_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}.json`
    )

    element.style.display = 'none'
    document.body.appendChild(element)

    element.click()

    document.body.removeChild(element)
  }, [])

  return (
    <IconButton
      size="small"
      onClick={saveRegisterConfig}
      color="primary"
      title="save datatype, scaling and comment configuration to json file"
    >
      <Save fontSize="small" />
    </IconButton>
  )
}

//
//
//
//
// Open register mapping configuration (load json file)
const LoadButton = () => {
  const openingRef = useRef(false)
  const [opening, setOpening] = useState(false)

  const replaceRegisterMapping = useRootZustand((z) => z.replaceRegisterMapping)
  const { enqueueSnackbar } = useSnackbar()

  const openConfig = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (openingRef.current) return
      openingRef.current = true
      setOpening(true)

      const content = await file.text()

      try {
        const registerMapping = JSON.parse(content) as RegisterMapping
        replaceRegisterMapping(registerMapping)
      } catch (error) {
        const tError = error as Error
        console.log(tError)
        enqueueSnackbar({ variant: 'error', message: `INVALID JSON: ${tError.message}` })
      }

      openingRef.current = false
      setOpening(false)
    },
    [replaceRegisterMapping, enqueueSnackbar]
  )

  return (
    <Box>
      <input
        accept="application/JSON"
        style={{ display: 'none' }}
        id="contained-button-file"
        type="file"
        onChange={(e) => openConfig(e.target.files?.[0])}
      />
      <label htmlFor="contained-button-file">
        <IconButton
          size="small"
          disabled={opening}
          color="primary"
          component="span"
          title="load a modbus json configuration file"
        >
          <FileOpen fontSize="small" />
        </IconButton>
      </label>
    </Box>
  )
}

//
//
//
//
// Clear data type, scaling and comment configuration
const ClearConfigButton = () => {
  const clearRegisterMapping = useRootZustand((z) => z.clearRegisterMapping)

  const [warn, setWarn] = useState(false)

  return (
    <IconButton
      size="small"
      onClick={clearRegisterMapping}
      color={warn ? 'error' : 'primary'}
      title="clear datatype, scaling and comment configuration"
      onMouseEnter={() => setWarn(true)}
      onMouseLeave={() => setWarn(false)}
    >
      <Delete fontSize="small" />
    </IconButton>
  )
}

//
//
//
//
// TOOLBAR
const RegisterGridToolbar = meme(() => {
  return (
    <Box
      sx={(theme) => ({
        pt: 1,
        px: 1,
        pb: 0.5,
        background: theme.palette.background.default,
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1
      })}
    >
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <PollButton />
        <ReadButton />
        <ToggleEndianButton />
        <SettingPopover />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Box sx={{ display: 'flex' }}>
          <LoadButton />
          <SaveButton />
          <ClearConfigButton />
        </Box>
        <ClearButton />
        <ShowLogButton />
        <MenuButton />
      </Box>
    </Box>
  )
})

export default RegisterGridToolbar
