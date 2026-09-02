import Save from '@mui/icons-material/Save'
import IconButton from '@mui/material/IconButton'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterMapConfig, RegisterType } from '@shared'
import { snakeCase } from 'lodash'
import { useCallback } from 'react'

const SaveButton = meme(() => {
  const saveRegisterConfig = useCallback(() => {
    const z = useRootZustand.getState()
    const { name } = z

    const registerMapping = structuredClone(z.registerMapping)
    const registerMappingKeys = Object.keys(registerMapping) as RegisterType[]
    registerMappingKeys.forEach((key) => {
      Object.keys(registerMapping[key]).forEach((register) => {
        if (registerMapping[key][register]?.dataType === 'none') {
          delete registerMapping[key][register]
        }
      })
    })

    // The store reads the version once at startup; it cannot change after that
    const modbuxVersion = useLayoutZustand.getState().version

    const registerMapConfig: RegisterMapConfig = {
      version: 2,
      modbuxVersion,
      name,
      littleEndian: z.registerConfig.littleEndian,
      registerMapping
    }

    const registerMappingJson = JSON.stringify(registerMapConfig, null, 2)

    const element = document.createElement('a')
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(registerMappingJson)
    )

    const {
      connectionConfig: { unitId }
    } = useRootZustand.getState()

    const idText = `_id${unitId}`

    const filename = `modbux_client_${snakeCase(name)}${idText}.json`

    element.setAttribute('download', filename)

    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }, [])

  return (
    <IconButton
      data-testid="save-config-btn"
      aria-label="Save configuration"
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
