import { Box, Button, Popover, TextField } from '@mui/material'
import { maskInputProps } from '@renderer/components/types'
import UIntInput from '@renderer/components/UintInput'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { RegisterType } from '@shared'
import { useCallback } from 'react'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

type SetAchorElFn = (
  anchorEl: HTMLDivElement | null,
  registerType: RegisterType.Coils | RegisterType.DiscreteInputs
) => void

interface AddBooleansZustand {
  anchorEl: HTMLDivElement | null
  setAnchorEl: SetAchorElFn
  address: number
  setAddress: MaskSetFn
  registerType: RegisterType.Coils | RegisterType.DiscreteInputs
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
    registerType: RegisterType.Coils // // ...
  }))
)

const RangeField = () => {
  const address = useAddBooleansZustand((z) => String(z.address))
  const setAddress = useAddBooleansZustand((z) => z.setAddress)
  return (
    <TextField
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: setAddress })
        }
      }}
    />
  )
}

const AddBoolButton = () => {
  const handleClick = useCallback(() => {
    const { registerType, address, setAddress } = useAddBooleansZustand.getState()
    const { addBools } = useServerZustand.getState()

    addBools(registerType, Number(address))

    // Increment with 8 so you can just add more by keep clicking on the add button
    if (address + 8 <= 65535) setAddress(String(address + 8))
  }, [])

  return (
    <Button size="small" onClick={handleClick}>
      Add
    </Button>
  )
}

const RemoveBoolButton = () => {
  const handleClick = useCallback(() => {
    const { registerType, address, setAddress } = useAddBooleansZustand.getState()
    const { removeBool } = useServerZustand.getState()

    removeBool(registerType, Number(address))

    // Decrement with 8 so you can just remove more by keep clicking on the add button
    if (address - 8 >= 0) setAddress(String(address - 8))
  }, [])

  return (
    <Button size="small" onClick={handleClick}>
      Remove
    </Button>
  )
}

const AddBooleans = () => {
  const anchorEl = useAddBooleansZustand((z) => z.anchorEl)
  const setAnchorEl = useAddBooleansZustand((z) => z.setAnchorEl)

  return (
    <Popover
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'left'
      }}
      anchorEl={anchorEl}
      onClose={() => setAnchorEl(null, RegisterType.Coils)}
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
