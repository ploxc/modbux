import Save from '@mui/icons-material/Save'
import IconButton from '@mui/material/IconButton'
import { downloadJson } from '@renderer/components/shared/downloadJson'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { CURRENT_CLIENT_CONFIG_VERSION, RegisterMapConfig, RegisterType } from '@shared'
import { snakeCase } from 'lodash'
import { useCallback } from 'react'

const SaveButton = meme(() => {
  const saveRegisterConfig = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    const { name } = clientZustand

    const registerMapping = structuredClone(clientZustand.registerMapping)
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
      version: CURRENT_CLIENT_CONFIG_VERSION,
      modbuxVersion,
      name,
      littleEndian: clientZustand.registerConfig.littleEndian,
      registerMapping
    }

    const {
      connectionConfig: { unitId }
    } = useClientZustand.getState()

    downloadJson(
      `modbux_client_${snakeCase(name)}_id${unitId}.json`,
      JSON.stringify(registerMapConfig, null, 2)
    )
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
