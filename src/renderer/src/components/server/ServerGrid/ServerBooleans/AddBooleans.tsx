/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Box, Button, InputBaseComponentProps, Popover, TextField } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { BooleanRegisters } from '@shared'
import { ElementType, useCallback } from 'react'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

type SetAchorElFn = (anchorEl: HTMLDivElement | null, registerType: BooleanRegisters) => void

interface AddBooleansZustand {
  anchorEl: HTMLDivElement | null
  setAnchorEl: SetAchorElFn
  address: number
  setAddress: MaskSetFn
  registerType: BooleanRegisters
}

export const useAddBooleansZustand = create<AddBooleansZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    anchorEl: null,
    setAnchorEl: (anchorEl, registerType) =>
      set((state) => {
        ;(state.anchorEl as Parameters<SetAchorElFn>[0]) = anchorEl
        state.registerType = registerType
      }),
    address: 0,
    setAddress: (address) =>
      set((state) => {
        state.address = Number(address)
      }),
    registerType: 'coils'
  }))
)

const RangeField = meme(() => {
  const address = useAddBooleansZustand((z) => String(z.address))
  const setAddress = useAddBooleansZustand((z) => z.setAddress)
  return (
    <TextField
      data-testid="add-bool-address-input"
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setAddress })
        }
      }}
    />
  )
})

const AddBoolButton = meme(() => {
  const handleClick = useCallback(() => {
    const { registerType, address, setAddress } = useAddBooleansZustand.getState()
    useServerZustand.getState().addBools(registerType, Number(address))

    // Increment with 8 so you can just add more by keep clicking on the add button
    if (address + 8 <= 65535) setAddress(String(address + 8))
  }, [])

  return (
    <Button data-testid="add-bool-add-btn" size="small" onClick={handleClick}>
      Add
    </Button>
  )
})

const RemoveBoolButton = meme(() => {
  const handleClick = useCallback(() => {
    const { registerType, address, setAddress } = useAddBooleansZustand.getState()
    useServerZustand.getState().removeBool(registerType, Number(address))

    // Decrement with 8 so you can just remove more by keep clicking on the add button
    if (address - 8 >= 0) setAddress(String(address - 8))
  }, [])

  return (
    <Button data-testid="add-bool-remove-btn" size="small" onClick={handleClick}>
      Remove
    </Button>
  )
})

const AddBooleans = (): JSX.Element => {
  const anchorEl = useAddBooleansZustand((z) => z.anchorEl)
  const setAnchorEl = useAddBooleansZustand((z) => z.setAnchorEl)

  return (
    <Popover
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center'
      }}
      anchorEl={anchorEl}
      onClose={() => setAnchorEl(null, 'coils')}
      open={!!anchorEl}
    >
      <Box sx={{ display: 'flex', gap: 1, p: 1 }}>
        <RangeField />
        <AddBoolButton />
        <RemoveBoolButton />
      </Box>
    </Popover>
  )
}
export default AddBooleans
