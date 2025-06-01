import { Edit } from '@mui/icons-material'
import { GridActionsColDef, useGridApiContext } from '@mui/x-data-grid'
import { GridActionsCellItem } from '@mui/x-data-grid/components'
import WriteModal from '@renderer/components/client/ClientGrids/RegisterGrid/columns/WriteModal/WriteModal'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterType, RegisterData } from '@shared'
import { useRef, useState } from 'react'

export const writeActionColumn = (type: RegisterType): GridActionsColDef<RegisterData> => ({
  field: 'actions',
  type: 'actions',
  sortable: false,
  headerName: '',
  minWidth: 40,
  maxWidth: 40,
  getActions: ({ row, id }) => {
    const address = row.id
    const [open, setOpen] = useState(false)

    const text = type === 'coils' ? 'Write Coil' : 'Write Register'
    const actionCellRef = useRef<HTMLDivElement>(null)
    const apiRef = useGridApiContext()

    const disabled = useRootZustand((z) => {
      return z.clientState.polling || z.clientState.connectState !== 'connected'
    })

    return row.isScanned
      ? []
      : [
          <>
            <GridActionsCellItem
              ref={actionCellRef}
              disabled={disabled}
              icon={<Edit fontSize="small" />}
              title={text}
              label={''}
              onClick={() => {
                apiRef.current.selectRow(id, true, true)
                setOpen(true)
              }}
              color="primary"
            />
            {open && (
              <WriteModal
                open={open}
                onClose={() => setOpen(false)}
                address={address}
                actionCellRef={actionCellRef}
                type={type}
              />
            )}
          </>
        ]
  }
})
