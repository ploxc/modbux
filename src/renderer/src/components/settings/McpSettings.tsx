import ContentCopy from '@mui/icons-material/ContentCopy'
import Key from '@mui/icons-material/Key'
import WarningAmber from '@mui/icons-material/WarningAmber'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useMcpZustand } from '@renderer/context/mcp.zustand'
import SettingsSection, { SettingsCard, SettingsRow } from './SettingsSection'
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react'

const MIN_PORT = 1
const MAX_PORT = 65535

/** The chip's text, dot and tint for each state the endpoint can be in. */
const STATUS_LOOK = {
  listening: { color: '#b5dcc9', dot: '#81bc57', background: 'rgba(91,146,121,0.18)' },
  error: { color: '#ec9a8a', dot: '#e0735f', background: 'rgba(224,115,95,0.14)' },
  noToken: { color: '#f5c46e', dot: '#f9a620', background: 'rgba(249,166,32,0.12)' },
  off: { color: '#a3a3a3', dot: '#6b6b6b', background: '#2a2a2a' }
} as const

/** Whether the endpoint listens, where, and why not when it does not. */
const McpStatusChip = meme((): JSX.Element => {
  const listening = useMcpZustand((z) => z.status.listening)
  const error = useMcpZustand((z) => z.status.error)
  const enabled = useMcpZustand((z) => z.access.enabled)
  const hasToken = useMcpZustand((z) => z.tokenHash !== undefined)
  const port = useMcpZustand((z) => z.port)

  const state = listening ? 'listening' : error ? 'error' : enabled && !hasToken ? 'noToken' : 'off'
  const text = {
    listening: `Listening on 127.0.0.1:${port}`,
    error: error ?? '',
    noToken: 'Needs a token',
    off: 'Off'
  }[state]
  const look = STATUS_LOOK[state]

  return (
    <Box
      component="span"
      data-testid="mcp-status"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        height: 24,
        px: 1.25,
        borderRadius: 3,
        fontSize: 12,
        color: look.color,
        background: look.background
      }}
    >
      <Box
        component="span"
        sx={{ width: 7, height: 7, borderRadius: '50%', background: look.dot, flexShrink: 0 }}
      />
      {text}
    </Box>
  )
})

/** The endpoint's on and off, which lets an assistant see everything once it is on. */
const EnabledSwitch = meme((): JSX.Element => {
  const enabled = useMcpZustand((z) => z.access.enabled)
  const handleChange = useCallback((_: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    const mcpZustand = useMcpZustand.getState()
    void mcpZustand.setAccess('enabled', checked)
  }, [])

  return (
    <SettingsRow
      title="Enable"
      description="An assistant can connect, and sees clients, servers, mappings and the values the grid shows."
      control={
        <Switch
          data-testid="mcp-enabled-switch"
          checked={enabled}
          onChange={handleChange}
          slotProps={{ input: { 'aria-label': 'Enable the MCP connector' } }}
        />
      }
    />
  )
})

const OperateCheckbox = meme((): JSX.Element => {
  const operate = useMcpZustand((z) => z.access.operate)
  const enabled = useMcpZustand((z) => z.access.enabled)
  const handleChange = useCallback((_: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    const mcpZustand = useMcpZustand.getState()
    void mcpZustand.setAccess('operate', checked)
  }, [])

  return (
    <Box sx={{ opacity: enabled ? 1 : 0.45 }}>
      <SettingsRow
        title="Operate"
        description="Connect, change settings, read and poll, as you would. Nothing is written to a device."
        control={
          <Checkbox
            data-testid="mcp-operate-checkbox"
            checked={operate}
            disabled={!enabled}
            onChange={handleChange}
            slotProps={{ input: { 'aria-label': 'Operate' } }}
          />
        }
      />
    </Box>
  )
})

/** The port, taken on blur or Enter, and put back when it is not one. */
const PortField = meme((): JSX.Element => {
  const port = useMcpZustand((z) => z.port)
  const [draft, setDraft] = useState(String(port))
  useEffect(() => setDraft(String(port)), [port])

  const commit = useCallback(() => {
    const value = Number(draft)
    if (!Number.isInteger(value) || value < MIN_PORT || value > MAX_PORT) {
      setDraft(String(useMcpZustand.getState().port))
      return
    }
    const mcpZustand = useMcpZustand.getState()
    if (value !== mcpZustand.port) void mcpZustand.setPort(value)
  }, [draft])

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    []
  )
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') commit()
    },
    [commit]
  )

  return (
    <SettingsRow
      title="Port"
      description="127.0.0.1 only. An assistant on another machine cannot connect."
      control={
        <TextField
          size="small"
          value={draft}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          sx={{ width: 88 }}
          slotProps={{
            htmlInput: {
              'data-testid': 'mcp-port-input',
              'aria-label': 'Port',
              inputMode: 'numeric',
              style: { fontFamily: 'monospace' }
            }
          }}
        />
      }
    />
  )
})

/** Makes a token, replacing the one before. */
const TokenRow = meme((): JSX.Element => {
  const hasToken = useMcpZustand((z) => z.tokenHash !== undefined)

  const createToken = useMcpZustand.getState().createToken
  const handleCreate = useCallback((): void => void createToken(), [createToken])

  return (
    <SettingsRow
      title="Token"
      description="An assistant sends it with every request. A new one stops the old one at once."
      control={
        <Button
          data-testid="mcp-create-token-btn"
          variant="outlined"
          size="small"
          startIcon={<Key />}
          onClick={handleCreate}
        >
          {hasToken ? 'Replace token' : 'Create token'}
        </Button>
      }
    />
  )
})

/** The token just made, shown once with the command that connects Claude Code. */
const ShownToken = meme((): JSX.Element | null => {
  const shownToken = useMcpZustand((z) => z.shownToken)
  const port = useMcpZustand((z) => z.port)

  // A token is shown until the settings close, and not again.
  useEffect(() => (): void => useMcpZustand.getState().forgetShownToken(), [])

  const command = shownToken
    ? `claude mcp add --transport http modbux http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${shownToken}"`
    : ''
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command).catch(() => undefined)
  }, [command])
  // A client set up by hand needs the token without the command around it.
  const handleCopyToken = useCallback(() => {
    navigator.clipboard.writeText(shownToken ?? '').catch(() => undefined)
  }, [shownToken])

  if (!shownToken) return null

  return (
    <Box
      sx={{
        border: '1px solid rgba(249,166,32,0.45)',
        background: 'rgba(249,166,32,0.07)',
        borderRadius: 1.5,
        px: 2,
        py: 1.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, color: '#f5c46e' }}>
        <WarningAmber sx={{ fontSize: 16 }} />
        Shown once. Copy it now: Modbux keeps only its fingerprint.
      </Box>
      <Box
        component="code"
        data-testid="mcp-connect-command"
        sx={{
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 1,
          px: 1.5,
          py: 1.25,
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: '18px',
          color: '#d4d4d4',
          wordBreak: 'break-all'
        }}
      >
        {command}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          data-testid="mcp-copy-command-btn"
          variant="text"
          size="small"
          startIcon={<ContentCopy />}
          onClick={handleCopy}
        >
          Copy command
        </Button>
        <Button
          data-testid="mcp-copy-token-btn"
          variant="text"
          size="small"
          startIcon={<ContentCopy />}
          onClick={handleCopyToken}
        >
          Copy token
        </Button>
      </Box>
    </Box>
  )
})

const McpSettings = meme(
  (): JSX.Element => (
    <SettingsSection title="Assistants (MCP)" summary={<McpStatusChip />} testId="mcp-section-btn">
      <Box component="p" sx={{ m: 0, pr: 1, fontSize: 13, lineHeight: '19px', color: '#a3a3a3' }}>
        An assistant such as Claude connects over the Model Context Protocol, on this machine only.
        What it may do is set here for the whole app.
      </Box>
      <SettingsCard>
        <EnabledSwitch />
        <OperateCheckbox />
      </SettingsCard>
      <SettingsCard>
        <PortField />
        <TokenRow />
      </SettingsCard>
      <ShownToken />
    </SettingsSection>
  )
)

export default McpSettings
