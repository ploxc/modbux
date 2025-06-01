import Box from '@mui/material/Box'
import TransactionGrid from '@renderer/components/client/ClientGrids/TransactionGrid/TransactionGrid'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import RegisterGrid from './RegisterGrid/RegisterGrid'

const ClientGrids = () => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)

  return scanning ? null : (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        gap: 2
      }}
    >
      <RegisterGrid />
      {showLog && <TransactionGrid />}
    </Box>
  )
}

export default ClientGrids
