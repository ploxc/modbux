import { Paper, Typography } from '@mui/material'
import { DataGrid, GridFooterContainer } from '@mui/x-data-grid'
import { useRootZustand } from '@renderer/context/root.zustand'
import useRegisterGridColumns from './_columns'
import RegisterGridToolbar from './RegisterGridToolbar/RegisterGridToolbar'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/meme'

//
//
//
//
// Footer
const Footer = meme(() => {
  const time = useRootZustand((z) => z.lastSuccessfulTransactionMillis)
  return (
    <GridFooterContainer sx={{ px: 1.5 }}>
      <Typography variant="caption" sx={{ opacity: 0.5 }}>
        Last transaction time:{' '}
        <strong>
          {time ? `${DateTime.fromMillis(time).toFormat('yyyy-MM-dd HH:mm:ss')}` : 'n/a'}
        </strong>
      </Typography>
    </GridFooterContainer>
  )
})

//
//
//
//
// DataGrid
const RegisterGridContent = () => {
  const registerData = useRootZustand((z) => z.registerData)
  const columns = useRegisterGridColumns()

  return (
    <DataGrid
      rows={registerData}
      columns={columns}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      hideFooterPagination
      editMode="cell"
      sx={(theme) => ({
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36
        },
        '& .MuiDataGrid-toolbarContainer': {
          background: theme.palette.background.default
        }
      })}
      localeText={{
        noRowsLabel: 'Connect and read to see registers'
      }}
      slots={{ toolbar: RegisterGridToolbar, footer: Footer }}
      //
      //
      // Row update
      processRowUpdate={(newRow, oldRow) => {
        const z = useRootZustand.getState()

        // Update datatype
        if (newRow['dataType'] && newRow['dataType'] !== oldRow['dataType']) {
          z.setRegisterMapping(newRow.id, 'dataType', newRow['dataType'])
        }

        // Update scaling factor
        // This will ignore zero too, if you don't want to ignore zero compare with undefined
        if (newRow['scalingFactor'] && newRow['scalingFactor'] !== oldRow['scalingFactor']) {
          const z = useRootZustand.getState()
          z.setRegisterMapping(newRow.id, 'scalingFactor', newRow['scalingFactor'])
        }

        // Update comment
        if (newRow['comment'] && newRow['comment'] !== oldRow['comment']) {
          const z = useRootZustand.getState()
          z.setRegisterMapping(newRow.id, 'comment', newRow['comment'])
        }

        return newRow
      }}
    />
  )
}

//
//
//
//
// DataGrid paper
const RegisterGrid = () => {
  return (
    <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0, height: '100%' }}>
      <RegisterGridContent />
    </Paper>
  )
}

export default RegisterGrid
