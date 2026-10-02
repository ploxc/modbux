import { GridFilterModel } from '@mui/x-data-grid/models'
import { RegisterData } from '@shared'

const NO_BUFFER = new Uint8Array(0)

/**
 * The grid's rows for a skeleton from `skeletonOf`: every field a row needs,
 * with none of the values a read fills. A cell that shows a value reads it
 * from the store.
 */
export const skeletonRows = (skeleton: string): RegisterData[] =>
  skeleton === ''
    ? []
    : skeleton.split('\n').map((line) => {
        const [id = '', isScanned, groupIndex = ''] = line.split(' ')
        return {
          id: Number(id),
          isScanned: isScanned === '1',
          ...(groupIndex === '' ? {} : { groupIndex: Number(groupIndex) }),
          buffer: NO_BUFFER,
          hex: '',
          words: undefined,
          bit: false
        }
      })

/**
 * Whether a filter reads what a poll changes. Those need the rows with their
 * values, and a new list with every poll, or the grid filters on what it read
 * last. The internal filter reads the data type, which is the mapping's.
 */
export const filtersValues = ({ items }: GridFilterModel): boolean =>
  items.some(
    ({ field }) =>
      field === 'hex' || field === 'value' || field === 'raw' || field.startsWith('word_')
  )
