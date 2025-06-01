import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'

interface Props {
  label: string
  value: number
  setValue: (value: number) => void
}

const SliderComponent = ({ label, value, setValue }: Props) => {
  const labelWidth = 70
  const valueWidth = 25

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 1
      }}
    >
      <Typography color="primary" variant="overline" sx={{ width: labelWidth }}>
        {label}
      </Typography>
      <Box sx={{ px: 1, display: 'flex' }}>
        <Slider
          size="small"
          sx={{ width: 100 }}
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(_, v) => {
            const value = Array.isArray(v) ? v.at(0) : v
            if (value === undefined) return
            setValue(value)
          }}
        />
      </Box>
      <Typography color="primary" variant="overline" sx={{ textAlign: 'right', width: valueWidth }}>
        {value} s
      </Typography>
    </Box>
  )
}

export default SliderComponent
