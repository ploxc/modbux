import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterType, ScanUnitIDResult } from '@shared'
import { useMemo } from 'react'
import { useScanUnitIdZustand } from './scanUnitIds.zustand'
import Box from '@mui/material/Box'

/**
 * What a unit ID did with one request.
 *
 * A refusal is not a silence. An exception reply means the unit is there and
 * talking, and it answered this particular question with no; nothing coming
 * back at all means there is no unit at that address. Both used to be red.
 */
export type ScanOutcome = 'answered' | 'refused' | 'silent' | 'unasked'

export const outcomeOf = (row: ScanUnitIDResult, type: RegisterType): ScanOutcome =>
  row.registerTypes.includes(type)
    ? 'answered'
    : row.refusedRegisterTypes.includes(type)
      ? 'refused'
      : row.requestedRegisterTypes.includes(type)
        ? 'silent'
        : 'unasked'

const OUTCOME_LABEL: Record<ScanOutcome, string> = {
  answered: 'OK',
  refused: 'EXCEPTION',
  silent: 'NO REPLY',
  unasked: ''
}

/** The class the grid paints the cell with. Styled where the grid is built. */
export const outcomeClass = (outcome: ScanOutcome): string =>
  outcome === 'unasked' ? '' : `scan-${outcome}`

const unitIdColumn: GridColDef<ScanUnitIDResult, number, number> = {
  field: 'id',
  headerName: 'Unit ID',
  hideable: false,
  width: 60,
  disableColumnMenu: true
}

const typeColumn = (registerType: RegisterType, name: string): GridColDef<ScanUnitIDResult> => ({
  field: registerType,
  headerName: name,
  disableColumnMenu: false,
  width: 100,
  // The whole cell carries the answer, so the value is the word in it. A
  // single select rather than free text: there are three answers a unit can
  // give, and the filter should offer those three rather than ask you to type
  // one. Nothing here is editable; the column type is for the filter.
  type: 'singleSelect',
  valueOptions: [
    { value: 'answered', label: OUTCOME_LABEL.answered },
    { value: 'refused', label: OUTCOME_LABEL.refused },
    { value: 'silent', label: OUTCOME_LABEL.silent }
  ],
  valueGetter: (_, row): ScanOutcome | null => {
    const outcome = outcomeOf(row, registerType)
    return outcome === 'unasked' ? null : outcome
  },
  cellClassName: ({ row }) => outcomeClass(outcomeOf(row, registerType))
})

const FUNCTION_CODE: Record<string, string> = {
  coils: 'FC1',
  discrete_inputs: 'FC2',
  holding_registers: 'FC3',
  input_registers: 'FC4'
}

const errorColumn: GridColDef<ScanUnitIDResult> = {
  field: 'errorMessage',
  headerName: 'Error',
  flex: 1,
  minWidth: 150,
  disableColumnMenu: true,
  renderCell: ({ value, row }) =>
    value === null ? null : (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {Object.entries(value).map(([type, message]) =>
          String(message).length === 0 ? null : (
            <Box
              key={type}
              // The same three states as the cells to the left, so a line here
              // and the cell it belongs to never disagree.
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                color:
                  outcomeOf(row, type as RegisterType) === 'refused'
                    ? theme.palette.warning.main
                    : theme.palette.error.main
              })}
            >
              <span>{FUNCTION_CODE[type]}:</span>
              <span>{String(message)}</span>
            </Box>
          )
        )}
      </Box>
    )
}

const useScanUnitIdColumns = (): GridColDef<ScanUnitIDResult>[] => {
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)

  return useMemo(() => {
    const newColumns = [unitIdColumn]

    if (registerTypes.includes('coils')) newColumns.push(typeColumn('coils', 'Coils'))
    if (registerTypes.includes('discrete_inputs'))
      newColumns.push(typeColumn('discrete_inputs', 'Inputs'))
    if (registerTypes.includes('input_registers'))
      newColumns.push(typeColumn('input_registers', 'Input Reg.'))
    if (registerTypes.includes('holding_registers'))
      newColumns.push(typeColumn('holding_registers', 'Holding'))

    newColumns.push(errorColumn)

    return newColumns
  }, [registerTypes])
}

export default useScanUnitIdColumns
