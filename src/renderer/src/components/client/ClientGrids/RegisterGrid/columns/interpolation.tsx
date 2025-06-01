import { ArrowRightAlt, Functions, Refresh } from '@mui/icons-material'
import { FormLabel, IconButton } from '@mui/material'
import Box from '@mui/material/Box'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField/TextField'
import { GridActionsCellItem } from '@mui/x-data-grid/components/cell/GridActionsCellItem'
import { useGridApiContext } from '@mui/x-data-grid/hooks/utils/useGridApiContext'
import { GridColDef } from '@mui/x-data-grid/models'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { useRootZustand } from '@renderer/context/root.zustand'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { DataType, RegisterData, RegisterLinearInterpolation, RegisterType } from '@shared'
import { deepEqual } from 'fast-equals'
import { forwardRef, RefObject, useCallback, useRef, useState } from 'react'
import { IMask, IMaskInput } from 'react-imask'

const defaultInterpolation: RegisterLinearInterpolation = { x1: '0', x2: '1', y1: '0', y2: '1' }

const isDefaultInterpolation = (interpolate: RegisterLinearInterpolation | undefined): boolean => {
  return interpolate === undefined || deepEqual(interpolate, defaultInterpolation)
}

const ValueInput = meme(
  forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
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
        onAccept={(value: any) => {
          set(value, true)
        }}
      />
    )
  })
)

interface InputFieldProps {
  interpolateKey: keyof RegisterLinearInterpolation
  value: string
  set: MaskSetFn
}

const InputField = meme(({ interpolateKey, value, set }: InputFieldProps) => {
  return (
    <TextField
      sx={{ maxWidth: 120 }}
      label={interpolateKey}
      size="small"
      value={value}
      slotProps={{
        input: {
          inputComponent: ValueInput as any,
          inputProps: maskInputProps({ set })
        }
      }}
    />
  )
})

interface Props {
  address: number
  open: boolean
  onClose: () => void
  actionCellRef: RefObject<HTMLDivElement>
  type: RegisterType
}

const useInterpolateValue = (
  key: keyof RegisterLinearInterpolation,
  type: RegisterType,
  address: number
) =>
  useRootZustand((z) => {
    const interpolate = z.registerMapping[type][address]?.interpolate
    return interpolate !== undefined ? interpolate[key] : defaultInterpolation[key]
  })

const InterpolationModal = ({ open, onClose, actionCellRef, type, address }: Props) => {
  const rect = actionCellRef.current?.getBoundingClientRect()

  const x1 = useInterpolateValue('x1', type, address)
  const x2 = useInterpolateValue('x2', type, address)
  const y1 = useInterpolateValue('y1', type, address)
  const y2 = useInterpolateValue('y2', type, address)

  const handleChange = useCallback(
    (key: keyof RegisterLinearInterpolation, value: string) => {
      const state = useRootZustand.getState()
      const interpolate: RegisterLinearInterpolation = state.registerMapping[type][address]
        ?.interpolate || { ...defaultInterpolation }
      state.setRegisterMapping(address, 'interpolate', { ...interpolate, [key]: value })
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
            left: rect?.left || 0,
            top: rect?.top || 0,
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
              color="primary"
              size="small"
              onClick={() => {
                useRootZustand
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

export const interpolationColumn = (type: RegisterType): GridColDef<RegisterData> => ({
  field: 'interpolation',
  type: 'actions',
  sortable: false,
  headerName: '',
  minWidth: 40,
  maxWidth: 40,

  getActions: ({ row, id }) => {
    const address = row.id
    const [open, setOpen] = useState(false)

    const actionCellRef = useRef<HTMLDivElement>(null)
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

    const dataType = useRootZustand((z) => z.registerMapping[type][address]?.dataType)
    const enabled = dataType && enabledDatatypes.includes(dataType)
    const isDefault = isDefaultInterpolation(
      useRootZustand.getState().registerMapping[type][address]?.interpolate
    )

    return row.isScanned
      ? []
      : [
          <>
            <GridActionsCellItem
              ref={actionCellRef}
              disabled={!enabled}
              icon={<Functions fontSize="small" />}
              title="Interpolation"
              label={''}
              onClick={() => {
                apiRef.current.selectRow(id, true, true)
                setOpen(true)
              }}
              color={isDefault ? undefined : 'primary'}
              sx={{ opacity: !enabled ? 0 : isDefault ? 0.2 : 1 }}
            />
            <InterpolationModal
              address={address}
              open={open}
              onClose={() => setOpen(false)}
              actionCellRef={actionCellRef}
              type={type}
            />
          </>
        ]
  }
})
