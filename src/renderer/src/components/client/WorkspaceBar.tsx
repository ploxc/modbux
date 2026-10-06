import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Delete from '@mui/icons-material/Delete'
import FileOpen from '@mui/icons-material/FileOpen'
import MoreVert from '@mui/icons-material/MoreVert'
import Save from '@mui/icons-material/Save'
import SettingsIcon from '@mui/icons-material/Settings'
import NavigationButtons from '@renderer/components/shared/NavigationButtons'
import SettingsButton from '@renderer/components/settings/SettingsButton'
import Settings from '@renderer/components/settings/Settings'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MouseEvent, RefObject, useCallback, useRef, useState } from 'react'

const NOT_YET = 'Client and workspace files are not there yet'

/** The class of Settings, Load, Save and Clear side by side, which the top bar hides when it narrows. */
export const WORKSPACE_INLINE = 'workspace-inline'
/** The class of the ⋮ that holds them instead. */
export const WORKSPACE_TOGGLE = 'workspace-toggle'
/** The class of the Workspace field, which the top bar moves into the ⋮ when it narrows further. */
export const WORKSPACE_NAME = 'workspace-name'

/** The Workspace field, disabled until a workspace exists. */
const WorkspaceNameField = meme(({ testId }: { testId: string }) => (
  <TextField size="large" label="Workspace" disabled fullWidth value="" data-testid={testId} />
))

// A disabled button fires no pointer events, so the tooltip listens on the span.
const WorkspaceFileButton = meme(
  ({ label, testId, icon }: { label: string; testId: string; icon: JSX.Element }) => (
    <Tooltip title={`${label}: ${NOT_YET.toLowerCase()}`}>
      <span>
        <IconButton size="large" disabled aria-label={label} data-testid={testId}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  )
)

/**
 * Settings, Load, Save and Clear as one ⋮ menu, for a top bar too narrow for
 * the four buttons, and the Workspace field at its top once the bar has hidden
 * it. The menu opens in a portal the bar's container query cannot reach, so it
 * asks the field whether it is shown as it opens.
 */
const WorkspaceMenu = meme(({ nameField }: { nameField: RefObject<HTMLElement | null> }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [nameFolded, setNameFolded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleOpen = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      setNameFolded(nameField.current?.offsetParent === null)
      setAnchor(event.currentTarget)
    },
    [nameField]
  )
  const handleClose = useCallback(() => setAnchor(null), [])
  const openSettings = useCallback(() => {
    setAnchor(null)
    setSettingsOpen(true)
  }, [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  return (
    <>
      <IconButton
        size="large"
        aria-label="Settings and workspace"
        data-testid="workspace-menu-btn"
        onClick={handleOpen}
      >
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={handleClose}>
        {nameFolded && (
          <Tooltip title={NOT_YET} placement="right">
            <Box sx={{ px: 2, pt: 1, pb: 1.5, width: 248 }}>
              <WorkspaceNameField testId="workspace-menu-name-input" />
            </Box>
          </Tooltip>
        )}
        <MenuItem data-testid="workspace-menu-settings" onClick={openSettings}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <Tooltip title={NOT_YET} placement="right">
          <span>
            <MenuItem data-testid="workspace-menu-load" disabled>
              <ListItemIcon>
                <FileOpen fontSize="small" />
              </ListItemIcon>
              Load workspace
            </MenuItem>
            <MenuItem data-testid="workspace-menu-save" disabled>
              <ListItemIcon>
                <Save fontSize="small" />
              </ListItemIcon>
              Save workspace
            </MenuItem>
            <MenuItem data-testid="workspace-menu-clear" disabled>
              <ListItemIcon>
                <Delete fontSize="small" />
              </ListItemIcon>
              Clear workspace
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>
      <Settings open={settingsOpen} onClose={closeSettings} />
    </>
  )
})

/**
 * The start of the top bar as one group: Home, Settings, the workspace's Load,
 * Save and Clear, and its name. No workspace exists yet, so the last four are
 * disabled. Narrow, Settings and the three files fold into a ⋮, and narrower
 * still, the name follows them.
 */
const WorkspaceBar = meme(() => {
  const nameField = useRef<HTMLDivElement>(null)
  return (
    // `&&` over the bar's own rule that its children do not shrink: this group
    // gives way, down to the Workspace field's minimum.
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        '&&': { flex: '1 1 0' },
        // The buttons keep their size; only the name gives way.
        '& > :not(:last-child)': { flexShrink: 0 }
      }}
    >
      <NavigationButtons other="server" />
      <Box className={WORKSPACE_INLINE} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SettingsButton testId="client-settings-btn" size="large" variant="outlined" />
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <WorkspaceFileButton
            label="Load workspace"
            testId="workspace-load-btn"
            icon={<FileOpen fontSize="small" />}
          />
          <WorkspaceFileButton
            label="Save workspace"
            testId="workspace-save-btn"
            icon={<Save fontSize="small" />}
          />
          <WorkspaceFileButton
            label="Clear workspace"
            testId="workspace-clear-btn"
            icon={<Delete fontSize="small" />}
          />
        </Box>
      </Box>
      <Box className={WORKSPACE_TOGGLE}>
        <WorkspaceMenu nameField={nameField} />
      </Box>
      <Tooltip title={NOT_YET}>
        <Box ref={nameField} className={WORKSPACE_NAME} sx={{ flex: '1 1 0', minWidth: 100 }}>
          <WorkspaceNameField testId="workspace-name-input" />
        </Box>
      </Tooltip>
    </Box>
  )
})

export default WorkspaceBar
