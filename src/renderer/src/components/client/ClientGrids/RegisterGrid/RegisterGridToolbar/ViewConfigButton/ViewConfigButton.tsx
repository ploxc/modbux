import { Visibility } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterData, dummyWords } from '@shared'
import { Buffer } from 'buffer'

export const showMapping = () => {
  const registerData: RegisterData[] = []
  const registerMapping = useRootZustand.getState().registerMapping
  const type = useRootZustand.getState().registerConfig.type

  Object.entries(registerMapping[type]).forEach(([addressString, m]) => {
    if (!m || m.dataType === 'none' || !m.dataType) return
    const address = parseInt(addressString, 10)

    const row: RegisterData = {
      id: address,
      buffer: Buffer.from([0, 0]),
      hex: '0000',
      words: { ...dummyWords },
      bit: false,
      isScanned: false
    }
    registerData.push(row)
  })

  useDataZustand.getState().setRegisterData(registerData)
}

const ViewConfigButton = () => {
  const disabled = useRootZustand(
    (z) => Object.keys(z.registerMapping[z.registerConfig.type]).length === 0
  )

  return (
    <IconButton
      disabled={disabled}
      size="small"
      onClick={showMapping}
      color="primary"
      title="view current datatype, scaling and comment configuration"
    >
      <Visibility fontSize="small" />
    </IconButton>
  )
}

export default ViewConfigButton
