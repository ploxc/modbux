import Save from '@mui/icons-material/Save'
import IconButton from '@mui/material/IconButton'
import { downloadJson } from '@renderer/components/shared/downloadJson'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { getSelectedClient, getSelectedUnit } from '@renderer/context/client.zustand'
import { CURRENT_CLIENT_CONFIG_VERSION, ClientDeviceConfig, RegisterType } from '@shared'
import { snakeCase } from 'lodash'
import { useCallback } from 'react'

const SaveButton = meme(() => {
  const saveRegisterConfig = useCallback(() => {
    const { name } = getSelectedClient()
    const unit = getSelectedUnit()

    const registerMapping = structuredClone(unit.registerMapping)
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

    const { unitId, littleEndian } = unit

    const deviceConfig: ClientDeviceConfig = {
      kind: 'client-device',
      version: CURRENT_CLIENT_CONFIG_VERSION,
      modbuxVersion,
      name,
      unitId,
      littleEndian,
      registerMapping
    }

    downloadJson(
      `modbux_client_${snakeCase(name)}_id${unitId}.json`,
      JSON.stringify(deviceConfig, null, 2)
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
