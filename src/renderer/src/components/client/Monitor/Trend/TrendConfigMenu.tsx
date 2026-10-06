import Check from '@mui/icons-material/Check'
import ExpandMore from '@mui/icons-material/ExpandMore'
import ShowChart from '@mui/icons-material/ShowChart'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { textMuted } from '@renderer/theme'
import { SavedTrend } from '@shared'
import { downloadBlob } from '@renderer/components/shared/downloadText'
import { deepEqual } from 'fast-equals'
import snakeCase from 'lodash/snakeCase'
import { DateTime } from 'luxon'
import { enqueueSnackbar } from 'notistack'
import { ChangeEvent, MouseEvent, useCallback, useState } from 'react'
import { snapshotOf, useTrendPanelZustand } from './trendPanel.zustand'

const NO_TRENDS: SavedTrend[] = []

/** What a trend no canvas can hold, or none drawn, says to Copy and Save as image. */
const NO_IMAGE = 'No image of the trend could be made: it is too large, or not drawn'

/** What the name dialog is asked for: a name to save under, or a new name for a saved trend. */
type Naming = { kind: 'save-as' } | { kind: 'rename'; from: string }

/** A menu item acting on the saved trend of `name`. */
const NamedItem = meme(
  ({
    name,
    label,
    testId,
    onPick
  }: {
    name: string
    label: string
    testId: string
    onPick: (name: string) => void
  }): JSX.Element => {
    const handleClick = useCallback(() => onPick(name), [name, onPick])
    return (
      <MenuItem data-testid={testId} onClick={handleClick} sx={{ fontSize: 12.5 }}>
        {label}
      </MenuItem>
    )
  }
)

/** A saved trend in the menu: ticked while it is the one drawn, and a press draws it. */
const SavedItem = meme(
  ({
    trend,
    current,
    onLoad
  }: {
    trend: SavedTrend
    current: boolean
    onLoad: (trend: SavedTrend) => void
  }): JSX.Element => {
    const handleClick = useCallback(() => onLoad(trend), [trend, onLoad])
    return (
      <MenuItem
        data-testid={`trend-saved-${trend.name}`}
        selected={current}
        onClick={handleClick}
        sx={{ gap: 1, fontSize: 12.5 }}
      >
        <Box sx={{ width: 16, display: 'flex' }}>
          {current && <Check sx={{ fontSize: 16, color: 'success.main' }} />}
        </Box>
        <Box component="span" sx={{ flexGrow: 1 }}>
          {trend.name}
        </Box>
        <Box component="span" sx={{ fontSize: 11.5, color: textMuted }}>
          {trend.entries.length} {trend.entries.length === 1 ? 'register' : 'registers'}
        </Box>
      </MenuItem>
    )
  }
)

/**
 * The trend's title: the name it was saved under, and a menu of the trends
 * saved with its client. A saved trend draws its registers, range and
 * settings again; Save keeps what the trend draws now under its name, Save
 * as under a new one, and Rename, Delete and New trend do as they say.
 */
const TrendConfigMenu = meme((): JSX.Element => {
  const uuid = useTrendPanelZustand((z) => z.uuid)
  const name = useTrendPanelZustand((z) => z.name)
  const entries = useTrendPanelZustand((z) => z.entries)
  const range = useTrendPanelZustand((z) => z.range)
  const settings = useTrendPanelZustand((z) => z.settings)
  const clientName = useClientZustand((z) => z.clients[uuid]?.name)
  const trends = useClientZustand((z) => z.clients[uuid]?.trends ?? NO_TRENDS)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [naming, setNaming] = useState<Naming>()
  const [draft, setDraft] = useState('')
  /** The saved trend Delete asks about, while it asks. */
  const [deleting, setDeleting] = useState<string>()

  const saved = trends.find((trend) => trend.name === name)
  const changed =
    name !== undefined && !deepEqual(snapshotOf({ entries, range, settings }, name), saved)
  const trimmed = draft.trim()
  // Renaming a trend to its own name takes nothing from another.
  const taken =
    trends.some((trend) => trend.name === trimmed) &&
    !(naming?.kind === 'rename' && naming.from === trimmed)

  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])
  const handleLoad = useCallback(
    (trend: SavedTrend) => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.load(uuid, trend)
      // A register that stopped logging since it was saved is not drawn.
      trendPanelZustand.prune(useClientZustand.getState().clients[uuid]?.units ?? [])
      setAnchor(null)
    },
    [uuid]
  )
  const handleSaveAs = useCallback(() => {
    setDraft('')
    setNaming({ kind: 'save-as' })
    setAnchor(null)
  }, [])
  // A trend with no name yet asks for one.
  const handleSave = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    if (trendPanelZustand.name === undefined) {
      handleSaveAs()
      return
    }
    const clientZustand = useClientZustand.getState()
    clientZustand.saveTrend(uuid, snapshotOf(trendPanelZustand, trendPanelZustand.name))
    setAnchor(null)
  }, [uuid, handleSaveAs])
  const handleRename = useCallback((from: string) => {
    setDraft(from)
    setNaming({ kind: 'rename', from })
    setAnchor(null)
  }, [])
  // Delete asks first, as removing a unit does.
  const handleDelete = useCallback((saved: string) => {
    setDeleting(saved)
    setAnchor(null)
  }, [])
  const handleKeep = useCallback(() => setDeleting(undefined), [])
  const handleConfirmDelete = useCallback(() => {
    if (deleting === undefined) return
    const clientZustand = useClientZustand.getState()
    clientZustand.deleteTrend(uuid, deleting)
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.setName(undefined)
    setDeleting(undefined)
  }, [uuid, deleting])
  // The image is taken once the menu is closed, of the trend as it is drawn.
  const handleCopyImage = useCallback(async () => {
    setAnchor(null)
    const blob = await useTrendPanelZustand.getState().image()
    if (blob === null) {
      enqueueSnackbar({ variant: 'error', message: NO_IMAGE })
      return
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      enqueueSnackbar({ variant: 'error', message: 'The image did not reach the clipboard' })
    }
  }, [])
  const handleSaveImage = useCallback(async () => {
    setAnchor(null)
    const trendPanelZustand = useTrendPanelZustand.getState()
    const blob = await trendPanelZustand.image()
    if (blob === null) {
      enqueueSnackbar({ variant: 'error', message: NO_IMAGE })
      return
    }
    const stamp = DateTime.now().toFormat('yyyyMMdd_HHmmss')
    downloadBlob(
      `modbux_trend_${snakeCase(trendPanelZustand.name ?? '') || 'trend'}_${stamp}.png`,
      blob
    )
  }, [])
  const handleNew = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.startNew()
    setAnchor(null)
  }, [])
  const handleDraft = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value)
  }, [])
  const handleCancelName = useCallback(() => setNaming(undefined), [])
  const handleConfirmName = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    const clientZustand = useClientZustand.getState()
    if (naming?.kind === 'rename') clientZustand.renameTrend(uuid, naming.from, trimmed)
    else clientZustand.saveTrend(uuid, snapshotOf(trendPanelZustand, trimmed))
    trendPanelZustand.setName(trimmed)
    setNaming(undefined)
  }, [naming, uuid, trimmed])

  return (
    <>
      <Button
        size="small"
        color="inherit"
        endIcon={<ExpandMore sx={{ color: 'text.disabled' }} />}
        data-testid="trend-config-btn"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={handleOpen}
        sx={{
          textTransform: 'none',
          fontWeight: 500,
          fontSize: 12.5,
          px: 0.75,
          minWidth: 0,
          '&:hover': { bgcolor: 'transparent' }
        }}
      >
        <Box
          component="span"
          sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {name ?? 'Trend'}
        </Box>
        {changed && (
          <Box component="span" data-testid="trend-changed" sx={{ ml: 0.5, color: textMuted }}>
            ·
          </Box>
        )}
      </Button>
      <Menu
        open={anchor !== null}
        anchorEl={anchor}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 260 } } }}
      >
        <Box sx={{ px: 2, pt: 0.5, pb: 0.75, fontSize: 11, color: textMuted }}>
          Saved for {clientName || 'Unnamed client'}
        </Box>
        {trends.length === 0 && (
          <Box sx={{ px: 2, pb: 0.75, fontSize: 12, color: textMuted }}>None yet</Box>
        )}
        {trends.map((trend) => (
          <SavedItem
            key={trend.name}
            trend={trend}
            current={trend.name === name}
            onLoad={handleLoad}
          />
        ))}
        <Divider />
        <MenuItem
          data-testid="trend-save-btn"
          disabled={name !== undefined && !changed}
          onClick={handleSave}
          sx={{ fontSize: 12.5 }}
        >
          Save
        </MenuItem>
        <MenuItem data-testid="trend-save-as-btn" onClick={handleSaveAs} sx={{ fontSize: 12.5 }}>
          Save as…
        </MenuItem>
        {saved && (
          <NamedItem
            name={saved.name}
            label="Rename…"
            testId="trend-rename-btn"
            onPick={handleRename}
          />
        )}
        {saved && (
          <NamedItem
            name={saved.name}
            label="Delete"
            testId="trend-delete-btn"
            onPick={handleDelete}
          />
        )}
        <Divider />
        <MenuItem
          data-testid="trend-copy-image-btn"
          onClick={handleCopyImage}
          sx={{ fontSize: 12.5 }}
        >
          Copy as image
        </MenuItem>
        <MenuItem
          data-testid="trend-save-image-btn"
          onClick={handleSaveImage}
          sx={{ fontSize: 12.5 }}
        >
          Save as image…
        </MenuItem>
        <Divider />
        <MenuItem data-testid="trend-new-btn" onClick={handleNew} sx={{ fontSize: 12.5 }}>
          New trend
        </MenuItem>
      </Menu>
      <Dialog open={deleting !== undefined} onClose={handleKeep} maxWidth="xs" fullWidth>
        <DialogHeading icon={<DeleteOutlined />} tone="error">
          Delete the trend {deleting}?
        </DialogHeading>
        <DialogContent>
          <DialogContentText>
            Its registers, range and settings go. The log keeps every sample.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button data-testid="trend-delete-cancel-btn" variant="text" onClick={handleKeep}>
            Keep it
          </Button>
          <Button
            data-testid="trend-delete-confirm-btn"
            color="error"
            onClick={handleConfirmDelete}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={naming !== undefined} onClose={handleCancelName} maxWidth="xs" fullWidth>
        <DialogHeading icon={<ShowChart />} tone="success">
          {naming?.kind === 'rename' ? 'Rename the trend' : 'Save the trend as'}
        </DialogHeading>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={draft}
            onChange={handleDraft}
            error={taken}
            helperText={taken ? 'A trend of this client has this name' : ' '}
            slotProps={{ htmlInput: { 'data-testid': 'trend-name-input' } }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button data-testid="trend-name-cancel-btn" variant="text" onClick={handleCancelName}>
            Cancel
          </Button>
          <Button
            data-testid="trend-name-confirm-btn"
            disabled={trimmed === '' || taken}
            onClick={handleConfirmName}
          >
            {naming?.kind === 'rename' ? 'Rename' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
})

export default TrendConfigMenu
