import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useMcpZustand } from '@renderer/context/mcp.zustand'
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react'

const MIN_PORT = 1
const MAX_PORT = 65535

/** Whether the endpoint listens, where, and why not when it does not. */
const McpStatusLine = meme((): JSX.Element => {
  const listening = useMcpZustand((z) => z.status.listening)
  const error = useMcpZustand((z) => z.status.error)
  const port = useMcpZustand((z) => z.port)

  const text = listening
    ? `Listening on http://127.0.0.1:${port}/mcp`
    : (error ?? 'Off. Tick a box and create a token to let an assistant in.')

  return (
    <Typography
      data-testid="mcp-status"
      variant="body2"
      color={listening ? 'success.main' : error ? 'error.main' : 'text.secondary'}
    >
      {text}
    </Typography>
  )
})

const ReadCheckbox = meme((): JSX.Element => {
  const read = useMcpZustand((z) => z.access.read)
  const handleChange = useCallback((_: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    const mcpZustand = useMcpZustand.getState()
    void mcpZustand.setAccess('read', checked)
  }, [])

  return (
    <FormControlLabel
      control={<Checkbox data-testid="mcp-read-checkbox" checked={read} onChange={handleChange} />}
      label="Read: see clients, servers, mappings and the values the grid shows"
    />
  )
})

const OperateCheckbox = meme((): JSX.Element => {
  const operate = useMcpZustand((z) => z.access.operate)
  const handleChange = useCallback((_: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    const mcpZustand = useMcpZustand.getState()
    void mcpZustand.setAccess('operate', checked)
  }, [])

  return (
    <FormControlLabel
      control={
        <Checkbox data-testid="mcp-operate-checkbox" checked={operate} onChange={handleChange} />
      }
      label="Operate: connect, change settings, read and poll, as you would. Nothing is written to a device."
    />
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
    <TextField
      label="Port"
      size="small"
      value={draft}
      onChange={handleChange}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      sx={{ width: 120 }}
      slotProps={{ htmlInput: { 'data-testid': 'mcp-port-input', inputMode: 'numeric' } }}
    />
  )
})

/** Makes a token, and shows it once with the command that connects Claude Code. */
const TokenSection = meme((): JSX.Element => {
  const hasToken = useMcpZustand((z) => z.tokenHash !== undefined)
  const shownToken = useMcpZustand((z) => z.shownToken)
  const port = useMcpZustand((z) => z.port)

  const createToken = useMcpZustand.getState().createToken
  const handleCreate = useCallback((): void => void createToken(), [createToken])

  // A token is shown until the page is left, and not again.
  useEffect(() => (): void => useMcpZustand.getState().forgetShownToken(), [])

  const command = shownToken
    ? `claude mcp add --transport http modbux http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${shownToken}"`
    : ''
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command).catch(() => undefined)
  }, [command])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button data-testid="mcp-create-token-btn" variant="outlined" onClick={handleCreate}>
          {hasToken ? 'Replace token' : 'Create token'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          {hasToken
            ? 'Replacing it stops the old one at once.'
            : 'An assistant sends it with every request.'}
        </Typography>
      </Box>
      {shownToken && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2" color="warning.main">
            Shown once. Copy it now: Modbux keeps only its fingerprint.
          </Typography>
          <Box
            component="code"
            data-testid="mcp-connect-command"
            sx={{ p: 1, fontSize: 12, wordBreak: 'break-all', bgcolor: 'background.default' }}
          >
            {command}
          </Box>
          <Box>
            <Button data-testid="mcp-copy-command-btn" size="small" onClick={handleCopy}>
              Copy command
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
})

const McpSettings = meme(
  (): JSX.Element => (
    <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 760 }}>
      <Typography variant="h6">Assistants (MCP)</Typography>
      <Typography variant="body2" color="text.secondary">
        An assistant such as Claude connects over the Model Context Protocol, on this machine only.
        What it may do is set here for the whole app.
      </Typography>
      <McpStatusLine />
      <ReadCheckbox />
      <OperateCheckbox />
      <PortField />
      <TokenSection />
    </Paper>
  )
)

export default McpSettings
