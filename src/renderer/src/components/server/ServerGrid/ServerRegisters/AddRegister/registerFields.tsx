/**
 * What the register is: where it lives, how it is read, what it is called.
 */
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { ElementType } from 'react'
import DataTypeSelectInput from '@renderer/components/shared/inputs/DataTypeSelectInput'
import { AddressInput } from './maskedInputs'

export const AddressField = meme(() => {
  const address = useAddRegisterZustand((z) => String(z.address))
  const addressInUse = useAddRegisterZustand((z) => z.addressInUse)
  const addressFitError = useAddRegisterZustand((z) => z.addressFitError)
  const valid = useAddRegisterZustand((z) => z.valid.address)
  const setAddress = useAddRegisterZustand((z) => z.setAddress)

  return (
    <FormControl error={!valid}>
      <TextField
        data-testid="add-reg-address-input"
        error={!valid}
        label="Address"
        variant="outlined"
        size="small"
        sx={{ width: 90 }}
        value={address}
        slotProps={{
          input: {
            inputComponent: AddressInput as unknown as ElementType<
              InputBaseComponentProps,
              'input'
            >,
            inputProps: maskInputProps({ set: setAddress })
          }
        }}
      />
      {addressInUse && <FormHelperText>In use</FormHelperText>}
      {addressFitError && <FormHelperText>Data type does not fit at this address</FormHelperText>}
    </FormControl>
  )
})

//
//
//
//
// Data Type

export const DataTypeSelect = meme(() => {
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const setDataType = useAddRegisterZustand((z) => z.setDataType)
  return <DataTypeSelectInput dataType={dataType} setDataType={setDataType} />
})

//
//
//
//
// Comment

export const CommentField = meme(() => {
  const comment = useAddRegisterZustand((z) => z.comment)
  const setComment = useAddRegisterZustand((z) => z.setComment)

  return (
    <TextField
      data-testid="add-reg-comment-input"
      label="Comment"
      variant="outlined"
      size="small"
      value={comment}
      onChange={(e) => setComment(e.target.value)}
    />
  )
})
