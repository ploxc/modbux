import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { BaseDataType } from '@shared'
import { meme } from './meme'

interface Props {
  disabled?: boolean
  dataType: BaseDataType
  setDataType: (dataType: BaseDataType) => void
}

const DataTypeSelectInput = meme(({ disabled, dataType, setDataType }: Props) => {
  const labelId = 'data-type-select'
  return (
    <FormControl disabled={disabled} size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        data-testid="add-reg-type-select"
        size="small"
        labelId={labelId}
        value={dataType}
        label="Type"
        onChange={(e) => setDataType(e.target.value as BaseDataType)}
      >
        <MenuItem value={'int16'}>INT16</MenuItem>
        <MenuItem value={'uint16'}>UINT16</MenuItem>
        <MenuItem value={'int32'}>INT32</MenuItem>
        <MenuItem value={'uint32'}>UINT32</MenuItem>
        <MenuItem value={'float'}>FLOAT</MenuItem>

        <MenuItem value={'int64'}>INT64</MenuItem>
        <MenuItem value={'uint64'}>UINT64</MenuItem>
        <MenuItem value={'double'}>DOUBLE</MenuItem>

        <MenuItem value={'unix'}>UNIX</MenuItem>
        <MenuItem value={'datetime'}>DATETIME</MenuItem>
        <MenuItem value={'utf8'}>UTF-8</MenuItem>
      </Select>
    </FormControl>
  )
})

export default DataTypeSelectInput
