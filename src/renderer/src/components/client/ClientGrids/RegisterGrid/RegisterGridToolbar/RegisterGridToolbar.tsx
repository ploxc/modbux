import { Box } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import PollButton from './PollButton/PollButton'
import ReadButton from './ReadButton/ReadButton'
import ToggleEndianButton from './ToggleEndianButton/ToggleEndianButton'
import TimeSettings from './TimeSettings/TimeSettings'
import ViewConfigButton from './ViewConfigButton/ViewConfigButton'
import LoadButton from './LoadButton/LoadButton'
import SaveButton from './SaveButton/SaveButton'
import ClearConfigButton from './ClearConfigButton/ClearConfigButton'
import ClearButton from './ClearButton/ClearButton'
import ShowLogButton from './ShowLogButton/ShowLogButton'
import MenuButton from './MenuButton/MenuButton'
import RawButton from './RawButton/RawButton'

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
        <TimeSettings />
        <RawButton />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Box sx={{ display: 'flex' }}>
          <ViewConfigButton />
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
