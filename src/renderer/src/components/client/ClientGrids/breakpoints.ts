/**
 * Where the client view gives things up as it narrows, in one place. A panel
 * or bar asks about its own width through a container query, so the same
 * number holds wherever the panel sits; only the sidebar asks about the window.
 */
export const BREAKPOINTS = {
  /** The unit bar: Load, Save, Clear config, Clear and Dummy Data fold into a ⋮ menu. */
  unitBarMenu: 840,
  /** The unit bar: byte order and the 32 and 64 bit columns fold into a menu of their own. */
  unitBarValues: 720,
  /** A register panel: Address and Length fold under Read, and the footer drops the date. */
  readWindow: 390,
  /** A register panel: the pages and the Poll label go. */
  pages: 250,
  /** A register panel: Read goes, and its read window with it. */
  read: 200,
  /** A register panel, by height: lower than this it folds to its head and footer. */
  gridHeight: 144,
  /** A bitmap's detail: its sixteen bits in two columns rather than four. */
  bitMapTwoColumns: 560
} as const

/** The window width at or below which the sidebar stays at its narrowest. */
export const NARROW_WINDOW = 1180

/** The `sx` key of the rules that hold while the container is `width` px wide or narrower. */
export const atOrBelow = (width: number): string => `@container (max-width: ${width}px)`

/** A register panel folded to its head (40), its footer (30) and the grid's edge above and below. */
export const FOLDED_PANEL_HEIGHT = 72
