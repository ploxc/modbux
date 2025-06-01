import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterData, getDummyRegisterData } from '@shared'
import { useCallback } from 'react'
import { SetAnchorProps } from '../ScanRegistersButton/ScanRegistersButton'
import Button from '@mui/material/Button'

const LoadDummyDataButton = meme(({ setAnchor }: SetAnchorProps) => {
  const disabled = useRootZustand((z) => z.clientState.connectState === 'connected')

  // Load dummy data for the configured register range so columns can be edited
  // without having to connect to the device or read registers
  const loadDummy = useCallback(() => {
    const state = useRootZustand.getState()
    const { address, length } = state.registerConfig
    const dataState = useDataZustand.getState()
    const dummyData: RegisterData[] = []

    let index = 0
    for (let register = address; register < address + length; register++) {
      dummyData[index] = getDummyRegisterData(register)
      index++
    }

    dataState.setRegisterData(dummyData)
    setAnchor(null)
  }, [])

  return (
    <Button sx={{ my: 1 }} variant="outlined" disabled={disabled} size="small" onClick={loadDummy}>
      Load Dummy Data
    </Button>
  )
})

export default LoadDummyDataButton
