import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand, dataOf } from '@renderer/context/data.zustand'
import {
  getSelectedClient,
  useClientZustand,
  selectedClientUuid
} from '@renderer/context/client.zustand'
import { RegisterData, getDummyRegisterData } from '@shared'
import { useCallback } from 'react'
import type { SetAnchorProps } from './MenuButton'
import Button from '@mui/material/Button'

const LoadDummyDataButton = meme(({ setAnchor }: SetAnchorProps) => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useDataZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )

  // Load dummy data for the configured register range so columns can be edited
  // without having to connect to the device or read registers
  const loadDummy = useCallback(() => {
    const { address, length } = getSelectedClient().registerConfig
    const dataZustand = useDataZustand.getState()
    const dummyData: RegisterData[] = []

    let index = 0
    for (let register = address; register < address + length; register++) {
      dummyData[index] = getDummyRegisterData(register)
      index++
    }

    dataZustand.setRegisterData(selectedClientUuid(), dummyData)
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
