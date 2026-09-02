import ArrowRightAlt from '@mui/icons-material/ArrowRightAlt'
import Functions from '@mui/icons-material/Functions'
import Refresh from '@mui/icons-material/Refresh'
import FormLabel from '@mui/material/FormLabel'
import IconButton from '@mui/material/IconButton'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Box from '@mui/material/Box'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import { useGridApiContext } from '@mui/x-data-grid'
import { GridActionsCellItem } from '@mui/x-data-grid/components'
import { GridColDef } from '@mui/x-data-grid/models'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { useClientZustand } from '@renderer/context/client.zustand'
import { MaskSetFn } from '@renderer/context/client.zustand.types'
import { DataType, RegisterData, RegisterLinearInterpolation, RegisterType } from '@shared'
import { deepEqual } from 'fast-equals'
import {
  ElementType,
  forwardRef,
  ReactElement,
  RefObject,
  useCallback,
  useRef,
  useState
} from 'react'
import { IMask, IMaskInput } from 'react-imask'

const defaultInterpolation: RegisterLinearInterpolation = { x1: '0', x2: '1', y1: '0', y2: '1' }

const isDefaultInterpolation = (interpolate: RegisterLinearInterpolation | undefined): boolean => {
  return interpolate === undefined || deepEqual(interpolate, defaultInterpolation)
}

const ValueInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      {...{
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => {
        set(value, true)
      }}
    />
  )
})

ValueInputForward.displayName = 'ValueInput'
const ValueInput = meme(ValueInputForward)

interface InputFieldProps {
  interpolateKey: keyof RegisterLinearInterpolation
  value: string
  set: MaskSetFn
}

const InputField = meme(({ interpolateKey, value, set }: InputFieldProps) => {
  return (
    <TextField
      data-testid={`interpolation-${interpolateKey}-field`}
      sx={{ maxWidth: 120 }}
      label={interpolateKey}
      size="small"
      value={value}
      slotProps={{
        input: {
          inputComponent: ValueInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set })
        }
      }}
    />
  )
})

interface InterpolationModalProps {
  address: number
  open: boolean
  onClose: () => void
  actionCellRef: RefObject<HTMLButtonElement>
  type: RegisterType
}

const useInterpolateValue = (
  key: keyof RegisterLinearInterpolation,
  type: RegisterType,
  address: number
): string =>
  useClientZustand((z) => {
    const interpolate = z.registerMapping[type][address]?.interpolate
    return interpolate !== undefined ? interpolate[key] : defaultInterpolation[key]
  })

const InterpolationModal = meme(
  ({ open, onClose, actionCellRef, type, address }: InterpolationModalProps) => {
    const rect = actionCellRef.current?.getBoundingClientRect()

    const x1 = useInterpolateValue('x1', type, address)
    const x2 = useInterpolateValue('x2', type, address)
    const y1 = useInterpolateValue('y1', type, address)
    const y2 = useInterpolateValue('y2', type, address)

    const handleChange = useCallback(
      (key: keyof RegisterLinearInterpolation, value: string) => {
        const clientZustand = useClientZustand.getState()
        const interpolate: RegisterLinearInterpolation = clientZustand.registerMapping[type][
          address
        ]?.interpolate || { ...defaultInterpolation }
        clientZustand.setRegisterMapping(address, 'interpolate', { ...interpolate, [key]: value })
      },
      [type, address]
    )

    return (
      open && (
        <Modal open={open} onClose={onClose} slotProps={{ backdrop: { sx: {} } }}>
          <Paper
            elevation={5}
            sx={{
              position: 'absolute',
              left: rect?.left ?? 0,
              top: rect?.top ?? 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              p: 2
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1 }}
            >
              <FormLabel color="primary">Linear Interpolation</FormLabel>
              <IconButton
                data-testid="interpolation-reset-btn"
                color="primary"
                size="small"
                onClick={() => {
                  useClientZustand
                    .getState()
                    .setRegisterMapping(address, 'interpolate', { ...defaultInterpolation })
                }}
              >
                <Refresh />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <InputField interpolateKey="x1" value={x1} set={(v) => handleChange('x1', v)} />
                <InputField interpolateKey="x2" value={x2} set={(v) => handleChange('x2', v)} />
              </Box>
              <ArrowRightAlt />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <InputField interpolateKey="y1" value={y1} set={(v) => handleChange('y1', v)} />
                <InputField interpolateKey="y2" value={y2} set={(v) => handleChange('y2', v)} />
              </Box>
            </Box>
          </Paper>
        </Modal>
      )
    )
  }
)

interface ActionProps {
  type: RegisterType
  address: number
}

const Action = meme(({ type, address }: ActionProps): JSX.Element => {
  const [open, setOpen] = useState(false)

  const actionCellRef = useRef<HTMLButtonElement>(null)
  const apiRef = useGridApiContext()

  const enabledDatatypes: DataType[] = [
    'double',
    'float',
    'int16',
    'int32',
    'int64',
    'uint16',
    'uint32',
    'uint64'
  ]

  const dataType = useClientZustand((z) => z.registerMapping[type][address]?.dataType)
  const enabled = dataType && enabledDatatypes.includes(dataType)
  const isDefault = isDefaultInterpolation(
    useClientZustand.getState().registerMapping[type][address]?.interpolate
  )

  return (
    <>
      <GridActionsCellItem
        data-testid={`interpolation-action-${address}`}
        ref={actionCellRef}
        disabled={!enabled}
        icon={<Functions fontSize="small" />}
        title="Interpolation"
        label={''}
        onClick={() => {
          apiRef.current.selectRow(address, true, true)
          setOpen(true)
        }}
        color={isDefault ? undefined : 'primary'}
        // x-data-grid v8 types its slots against a design-system-agnostic
        // interface, so baseIconButton takes style/className but not sx.
        style={{ opacity: !enabled ? 0 : isDefault ? 0.2 : 1 }}
      />

      <InterpolationModal
        address={address}
        open={open}
        onClose={() => setOpen(false)}
        actionCellRef={actionCellRef}
        type={type}
      />
    </>
  )
})

export const interpolationColumn = (type: RegisterType): GridColDef<RegisterData> => ({
  field: 'interpolation',
  type: 'actions',
  headerName: '',
  minWidth: 40,
  maxWidth: 40,

  getActions: ({ row }): ReactElement[] => {
    return row.isScanned
      ? []
      : [<Action key={`interpolation_action_${row.id}`} address={row.id} type={type} />]
  }
})
