import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Delete from '@mui/icons-material/Delete'
import FileOpen from '@mui/icons-material/FileOpen'
import Save from '@mui/icons-material/Save'
import { meme } from '@renderer/components/shared/inputs/meme'

const NOT_YET = 'Client and workspace files are not there yet'

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

/** Load, Save and Clear of the workspace, and its name. No workspace exists yet, so all four are disabled. */
const WorkspaceBar = meme(() => (
  <>
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
    <Tooltip title={NOT_YET}>
      <Box sx={{ flexGrow: 1, minWidth: 140 }}>
        <TextField
          size="large"
          label="Workspace"
          disabled
          fullWidth
          value=""
          data-testid="workspace-name-input"
        />
      </Box>
    </Tooltip>
  </>
))

export default WorkspaceBar
