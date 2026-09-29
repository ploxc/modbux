import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { textMuted } from '@renderer/theme'
import { ClientUnit, loggedRegisterCount } from '@shared'

const NO_UNITS: ClientUnit[] = []

/** How many registers of the selected client log, in Monitor's toolbar. */
const LogCount = meme((): JSX.Element => {
  const logged = useClientZustand((z) =>
    loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  )
  return (
    <Box
      component="span"
      data-testid="log-count"
      sx={{ fontSize: 12, color: logged > 0 ? textMuted : 'text.disabled' }}
    >
      {logged === 0
        ? 'No register logs; set Log in Debug'
        : `${logged} ${logged === 1 ? 'register logs' : 'registers log'}`}
    </Box>
  )
})

export default LogCount
