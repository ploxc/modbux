import { FileOpen, Save, Delete } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { useServerZustand } from '@renderer/context/server.zustand'
import { ServerRegisterEntry, ServerRegisters } from '@renderer/context/server.zustant.types'
import { DataType, RegisterType } from '@shared'
import { DateTime } from 'luxon'
import { useSnackbar } from 'notistack'
import { useRef, useState, useCallback } from 'react'

//
//
// Open button
const useOpen = () => {
  const openingRef = useRef(false)
  const [opening, setOpening] = useState(false)

  const { enqueueSnackbar } = useSnackbar()

  const open = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (openingRef.current) return
      openingRef.current = true
      setOpening(true)

      const state = useServerZustand.getState()

      const content = await file.text()
      try {
        const serverRegisters = JSON.parse(content) as ServerRegisters

        const coils = serverRegisters[RegisterType.Coils]
        const discreteInputs = serverRegisters[RegisterType.DiscreteInputs]
        const inputRegisters = serverRegisters[RegisterType.InputRegisters]
        const holdingRegisters = serverRegisters[RegisterType.HoldingRegisters]

        if (!coils || typeof coils !== 'object') throw new Error('No coils in the JSON file')
        if (!discreteInputs || typeof discreteInputs !== 'object')
          throw new Error('No discrete inputs in the JSON file')
        if (!inputRegisters || typeof inputRegisters !== 'object')
          throw new Error('No input registers in the JSON file')
        if (!holdingRegisters || typeof holdingRegisters !== 'object')
          throw new Error('No holding registers in the JSON file')

        const validateBooleans = (
          [address, value]: [string, boolean],
          type: 'coil' | 'discrete input'
        ) => {
          const addressNumber = Number(address)
          if (isNaN(addressNumber) || addressNumber < 0 || addressNumber > 0xffff)
            throw new Error(`Invalid ${type} address: ${address} at address ${address}`)
          if (typeof value !== 'boolean')
            throw new Error(`Invalid ${type} value: ${value} at address ${address}`)
        }

        const validateRegisters = (
          [address, register]: [string, ServerRegisterEntry],
          type: 'input register' | 'holding register'
        ) => {
          const addressNumber = Number(address)
          if (isNaN(addressNumber) || addressNumber < 0 || addressNumber > 0xffff)
            throw new Error(`Invalid ${type} address: ${address}`)

          const { value, params } = register
          if (typeof value !== 'number')
            throw new Error(`Invalid ${type} value: ${value} at address ${address}`)
          if (typeof params.address !== 'number' || addressNumber < 0 || addressNumber > 0xffff)
            throw new Error(`Invalid ${type} address: ${address} at address ${address}`)
          if (
            ![RegisterType.InputRegisters, RegisterType.HoldingRegisters].includes(
              params.registerType
            )
          )
            throw new Error(
              `Invalid ${type} register type: ${params.registerType} at address ${address}`
            )
          if (!Object.values(DataType).includes(params.dataType))
            throw new Error(`Invalid ${type} data type: ${params.dataType} at address ${address}`)
          if (typeof params.littleEndian !== 'boolean')
            throw new Error(
              `Invalid ${type} little endian: ${params.littleEndian} at address ${address}`
            )
          if (typeof params.comment !== 'string')
            throw new Error(`Invalid ${type} comment: ${params.comment} at address ${address}`)

          const validGenerator =
            typeof params.min === 'number' &&
            typeof params.max === 'number' &&
            typeof params.interval === 'number'
          const validValue = typeof params.value === 'number'

          if (!validGenerator && !validValue)
            throw new Error(`Invalid ${type} generator or value at address ${address}`)
        }

        Object.entries(coils).forEach((entry) => validateBooleans(entry, 'coil'))
        Object.entries(discreteInputs).forEach((entry) => validateBooleans(entry, 'discrete input'))
        Object.entries(inputRegisters).forEach((entry) =>
          validateRegisters(entry, 'input register')
        )
        Object.entries(holdingRegisters).forEach((entry) =>
          validateRegisters(entry, 'holding register')
        )

        state.replaceServerRegisters(serverRegisters)
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: `INVALID JSON: ${tError.message}` })
      }

      await window.api.restartServer()

      // Need to initialize the server again after opening the configuration
      // to synchronize the front with backend registers
      await state.init()

      openingRef.current = false
      setOpening(false)
    },
    [enqueueSnackbar]
  )

  return { opening, openingRef, open }
}

//
//
// Saving
const useSave = () => {
  const save = useCallback(() => {
    const z = useServerZustand.getState()
    const { serverRegisters } = z
    const serverRegistersJson = JSON.stringify(serverRegisters, null, 2)

    var element = document.createElement('a')
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(serverRegistersJson)
    )

    const filename = `modbux_server_config_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}.json`

    element.setAttribute('download', filename)
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }, [])

  return { save }
}

//
//
// Open save and clear the register configuration
const OpenSaveClear = () => {
  const { opening, open } = useOpen()
  const { save } = useSave()

  const clear = useCallback(() => {
    const serverState = useServerZustand.getState()
    serverState.resetBools(RegisterType.Coils)
    serverState.resetBools(RegisterType.DiscreteInputs)
    serverState.resetRegisters(RegisterType.HoldingRegisters)
    serverState.resetRegisters(RegisterType.InputRegisters)
  }, [])

  return (
    <Box sx={{ display: 'flex', ml: -1 }}>
      <div>
        {!opening && (
          <input
            accept="application/JSON"
            style={{ display: 'none' }}
            id="container-button-server-file"
            type="file"
            onChange={(e) => open(e.target.files?.[0])}
          />
        )}
        <label htmlFor="container-button-server-file">
          <IconButton
            color="primary"
            disabled={opening}
            component="span"
            title="load a modbux server configuration file"
          >
            <FileOpen />
          </IconButton>
        </label>
      </div>
      <IconButton color="primary" disabled={opening} onClick={save}>
        <Save />
      </IconButton>
      <IconButton color="primary" disabled={opening} onClick={clear}>
        <Delete />
      </IconButton>
    </Box>
  )
}

export default OpenSaveClear
