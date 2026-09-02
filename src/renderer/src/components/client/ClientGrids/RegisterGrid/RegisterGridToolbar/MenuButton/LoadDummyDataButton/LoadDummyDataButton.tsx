import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { RegisterData, getDummyRegisterData } from '@shared'
import { useCallback } from 'react'
import { SetAnchorProps } from '../ScanRegistersButton/ScanRegistersButton'
import Button from '@mui/material/Button'

const LoadDummyDataButton = meme(({ setAnchor }: SetAnchorProps) => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')

  // Load dummy data for the configured register range so columns can be edited
  // without having to connect to the device or read registers
  const loadDummy = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    const { address, length } = clientZustand.registerConfig
    const dataZustand = useDataZustand.getState()
    const dummyData: RegisterData[] = []

    let index = 0
    for (let register = address; register < address + length; register++) {
      dummyData[index] = getDummyRegisterData(register)
      index++
    }

    dataZustand.setRegisterData(dummyData)
    setAnchor(null)
  }, [setAnchor])

  return (
    <Button
      sx={{ my: 1 }}
      variant="outlined"
      disabled={disabled}
      size="small"
      onClick={loadDummy}
      data-testid="load-dummy-data-btn"
    >
      Load Dummy Data
    </Button>
  )
})

export default LoadDummyDataButton
