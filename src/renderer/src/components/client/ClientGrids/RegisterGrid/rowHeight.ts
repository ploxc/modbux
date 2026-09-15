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

/**
 * The same figure the CSS rule needs, where no `densityFactor` is in hand.
 * It holds the row at its own height while the slot around it carries the
 * panel too.
 */
export const COMPACT_ROW_HEIGHT = ROW_HEIGHT * 0.7
