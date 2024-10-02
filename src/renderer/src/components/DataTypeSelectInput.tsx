import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { DataType } from '@shared'

interface Props {
  disabled?: boolean
  dataType: DataType
  setDataType: (dataType: DataType) => void
}

const DataTypeSelectInput = ({ disabled, dataType, setDataType }: Props) => {
  const labelId = 'data-type-select'
  return (
    <FormControl disabled={disabled} size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={dataType}
        label="Type"
        onChange={(e) => setDataType(e.target.value as DataType)}
      >
        <MenuItem value={DataType.Int16}>INT16</MenuItem>
        <MenuItem value={DataType.UInt16}>UINT16</MenuItem>
        <MenuItem value={DataType.Int32}>INT32</MenuItem>
        <MenuItem value={DataType.UInt32}>UINT32</MenuItem>
        <MenuItem value={DataType.Float}>FLOAT</MenuItem>

        <MenuItem value={DataType.Int64}>INT64</MenuItem>
        <MenuItem value={DataType.UInt64}>UINT64</MenuItem>
        <MenuItem value={DataType.Double}>DOUBLE</MenuItem>
      </Select>
    </FormControl>
  )
}
export default DataTypeSelectInput
