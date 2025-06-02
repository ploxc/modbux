import { Save } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterType } from '@shared'
import { useCallback } from 'react'

const SaveButton = meme(() => {
  const saveRegisterConfig = useCallback(() => {
    const z = useRootZustand.getState()
    const { registerMapping } = z

    const registerMappingKeys = Object.keys(registerMapping) as RegisterType[]
    registerMappingKeys.forEach((key) => {
      Object.keys(registerMapping[key]).forEach((register) => {
        if (registerMapping[key][register]?.dataType === 'none') {
          delete registerMapping[key][register]
        }
      })
    })

    const registerMappingJson = JSON.stringify(registerMapping, null, 2)

    const element = document.createElement('a')
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(registerMappingJson)
    )

    const {
      connectionConfig: {
        protocol,
        tcp: {
          host,
          options: { port }
        },
        unitId
      }
    } = useRootZustand.getState()

    const protocolText = protocol === 'ModbusTcp' ? '_tcp' : '_rtu'
    const ipText = protocol === 'ModbusTcp' ? `_${host.replace(/\./g, '_')}_${port}` : ''
    const idText = `_id${unitId}`

    const filename = `modbux${protocolText}${ipText}${idText}.json`

    element.setAttribute('download', filename)

    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }, [])

  return (
    <IconButton
      size="small"
      onClick={saveRegisterConfig}
      color="primary"
      title="save datatype, scaling and comment configuration to json file"
    >
      <Save fontSize="small" />
    </IconButton>
  )
})

export default SaveButton
