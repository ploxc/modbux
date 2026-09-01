import { FilterAltOff } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'
import {
  gridFilterActiveItemsSelector,
  gridFilterModelSelector,
  useGridApiContext,
  useGridSelector
} from '@mui/x-data-grid'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback } from 'react'

// The grid sets a filter of its own while read configuration is on, to keep
// rows without a data type out of the way. It carries this id so it can be told
// apart from what the user filtered on: it never lights the button up, and it
// survives a clear. Dropping it would fill the list with empty rows.
const INTERNAL_FILTER_ID = 1

const ClearFiltersButton = meme((): JSX.Element | null => {
  const apiRef = useGridApiContext()
  // Active items rather than the model: opening the filter panel already puts
  // an empty item in the model, and a form nobody has typed in yet is not a
  // filter the user would want a button to clear.
  const activeItems = useGridSelector(apiRef, gridFilterActiveItemsSelector)

  const handleClear = useCallback(() => {
    const filterModel = gridFilterModelSelector(apiRef)
    apiRef.current?.setFilterModel({
      ...filterModel,
      items: filterModel.items.filter((item) => item.id === INTERNAL_FILTER_ID)
    })
  }, [apiRef])

  const userFilters = activeItems.filter((item) => item.id !== INTERNAL_FILTER_ID)
  if (userFilters.length === 0) return null

  return (
    <IconButton
      data-testid="clear-filters-btn"
      aria-label="Clear filters"
      title="Clear filters"
      size="small"
      color="warning"
      onClick={handleClear}
    >
      <FilterAltOff />
    </IconButton>
  )
})

export default ClearFiltersButton
