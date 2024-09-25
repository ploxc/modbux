import { Box, Button, Modal, TextField, Typography } from '@mui/material'
import { maskInputProps } from '@renderer/components/types'
import UIntInput from '@renderer/components/UintInput'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { RegisterType } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

type SetOpenFn = (
  open: boolean,
  registerType: RegisterType.Coils | RegisterType.DiscreteInputs
) => void

interface AddBooleansZustand {
  open: boolean
  setOpen: SetOpenFn
  address: number
  setAddress: MaskSetFn
  registerType: RegisterType.Coils | RegisterType.DiscreteInputs
}

export const useAddBooleansZustand = create<AddBooleansZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    open: false,
    setOpen: (open, registerType) =>
      set((state) => {
        state.open = open
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
  const type = useAddBooleansZustand((z) => z.registerType)
  const address = useAddBooleansZustand((z) => z.address)
  const addBool = useServerZustand((z) => z.addBools)

  return <Button onClick={() => addBool(type, Number(address))}>Add</Button>
}

const RemoveBoolButton = () => {
  const type = useAddBooleansZustand((z) => z.registerType)
  const address = useAddBooleansZustand((z) => z.address)
  const removeBool = useServerZustand((z) => z.removeBool)

  return <Button onClick={() => removeBool(type, Number(address))}>Remove</Button>
}

const AddBooleans = () => {
  const open = useAddBooleansZustand((z) => z.open)
  const setOpen = useAddBooleansZustand((z) => z.setOpen)
  return (
    <Modal open={open} onClose={() => setOpen(false, RegisterType.Coils)}>
      <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', p: 2 }}>
        <Typography variant="subtitle1">
          This will add/remove a range of 8 including the address provided.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <RangeField />
          <AddBoolButton />
          <RemoveBoolButton />
        </Box>
      </Box>
    </Modal>
  )
}
export default AddBooleans
