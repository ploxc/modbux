/**
 * What a register row measures, and what an expanded bitmap row adds to it.
 *
 * `rowHeight` is the number the grid is given and `density="compact"` scales it
 * before laying a row out. MUI's own documentation states that density does not
 * reach a row with a variable height unless the caller applies it, and hands
 * `getRowHeight` the factor to apply, so the expanded row is built from
 * `ROW_HEIGHT * densityFactor`. A collapsed row measures 28 for the 40 below,
 * which is that factor at 0.7.
 *
 * `getRowHeight` returning 'auto' is the other documented way and does not fit:
 * it measures the row's cells, and the panel is a sibling of them rather than
 * inside one.
 */
export const ROW_HEIGHT = 40

/** What `density="compact"` scales by, and what `getRowHeight` is handed. */
const COMPACT_DENSITY_FACTOR = 0.7

/**
 * The same figure the CSS rule needs, where no `densityFactor` is in hand.
 * It holds the row at its own height while the slot around it carries the
 * panel too. Floored the way `useGridVirtualizer` floors its own base, so the
 * two cannot land half a pixel apart at a `rowHeight` the factor does not
 * divide.
 */
export const COMPACT_ROW_HEIGHT = Math.floor(ROW_HEIGHT * COMPACT_DENSITY_FACTOR)
