import { Menu, MoreVert } from '@mui/icons-material'
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
  FormGroup
} from '@mui/material'
import { meme } from '@renderer/components/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ConnectState } from '@shared'
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
  const advanced = useLayoutZustand((z) => z.advanced)
  const setAdvanced = useLayoutZustand((z) => z.setAdvanced)

  const show64bit = useLayoutZustand((z) => z.show64Bit)
  const setShow64Bit = useLayoutZustand((z) => z.setShow64Bit)

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
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

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
// Toggle swap
const ToggleSwapButton = () => {
  const swap = useRootZustand((z) => z.registerConfig.swap)
  const setSwap = useRootZustand((z) => z.setSwap)

  return (
    <ToggleButtonGroup
      sx={{ height: 29.5 }}
      size="small"
      exclusive
      color="primary"
      value={swap}
      onChange={(_, v) => setSwap(v)}
    >
      <ToggleButton value={false} sx={{ whiteSpace: 'nowrap' }}>
        No Swap
      </ToggleButton>
      <ToggleButton value={true}>Swap</ToggleButton>
    </ToggleButtonGroup>
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
        <ToggleSwapButton />
        <SettingPopover />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <ClearButton />
        <ShowLogButton />
        <MenuButton />
      </Box>
    </Box>
  )
})

export default RegisterGridToolbar
