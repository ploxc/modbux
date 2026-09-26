// Brings the palette.DataGrid tokens into the type system.
import '@mui/x-data-grid/themeAugmentation'
import { createTheme } from '@mui/material/styles'

// Scale A has a large field, for the top bar; MUI's fields stop at medium.
declare module '@mui/material/TextField' {
  interface TextFieldPropsSizeOverrides {
    large: true
  }
}
declare module '@mui/material/InputBase' {
  interface InputBasePropsSizeOverrides {
    large: true
  }
}
declare module '@mui/material/FormControl' {
  interface FormControlPropsSizeOverrides {
    large: true
  }
}
declare module '@mui/material/InputLabel' {
  interface InputLabelPropsSizeOverrides {
    large: true
  }
}

// The dialogs as drawn on the 3.0 dialogs canvas.
const dialogShade = 'rgba(0,0,0,0.62)'
const dialogBorder = '#303030'
const dialogText = '#b0b0b0'
const dialogBand = '#1b1b1b'
const dialogBandBorder = '#2a2a2a'
const dialogDanger = '#e0735f'

/**
 * The one colour every border takes: fields, outlined and toggle buttons,
 * cards, dividers, and the data grids inside and out.
 */
export const lineColor = '#333333'

/** What a field's border turns to under the pointer. */
const lineHoverColor = '#4a4a4a'

/** The round badge in front of a dialog's title, which the text indents past. */
export const DIALOG_ICON_SIZE = 36

// Scale A on the client canvas's "Control sizes" artboard. Every Button,
// ToggleButton, IconButton and outlined field takes its height from its `size`;
// a Button carrying CUSTOM_SIZE keeps one of its own.
const controlSizes = {
  small: { height: 24, fontSize: 11.5, padding: 10, inset: 7, icon: 14 },
  medium: { height: 28, fontSize: 12.5, padding: 11, inset: 8, icon: 16 },
  large: { height: 32, fontSize: 13, padding: 13, inset: 10, icon: 18 }
} as const

type ControlSize = keyof typeof controlSizes

/** The class a Button carries to keep a size of its own, outside the scale. */
export const CUSTOM_SIZE = 'custom-size'

/** A Button whose only element child is an icon, beside the ripple every Button carries. */
const iconOnly = `&:not(.${CUSTOM_SIZE}):has(> .MuiSvgIcon-root):not(:has(> :not(.MuiSvgIcon-root, .MuiTouchRipple-root)))`

/** The label's line box; a resting label is centred on the field with it. */
const labelLineHeight = 16

/**
 * One style per size, as MUI's `variants` wants them. A field outside a
 * FormControl carries no size at all, so a missing size reads as medium.
 */
const bySize = (
  style: (size: (typeof controlSizes)[ControlSize]) => Record<string, unknown>
): {
  props: (props: { size?: string; ownerState?: { size?: string } }) => boolean
  style: Record<string, unknown>
}[] =>
  (Object.keys(controlSizes) as ControlSize[]).map((size) => ({
    props: (props) => (props.size ?? props.ownerState?.size ?? 'medium') === size,
    style: style(controlSizes[size])
  }))

const base = createTheme({
  motion: { reducedMotion: 'system' },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 1200,
      lg: 1600,
      xl: 1920
    }
    // Add your custom breakpoints
  },
  palette: {
    mode: 'dark',
    divider: lineColor,
    background: {
      default: '#181818',
      paper: '#1F1F1F'
    },
    primary: {
      main: '#5b9279'
    },
    secondary: {
      main: '#255048'
    },
    warning: {
      main: '#f9a620'
    },
    error: {
      main: '#CA0902'
    },
    info: {
      main: '#ccc'
    },
    success: {
      main: '#81bc57'
    }
  },
  components: {
    MuiButton: {
      defaultProps: { variant: 'contained' },
      styleOverrides: {
        root: {
          minWidth: 0,
          lineHeight: 1,
          textTransform: 'none',
          variants: bySize((size) => ({
            height: size.height,
            padding: `0 ${size.padding}px`,
            fontSize: size.fontSize,
            // A button holding nothing but an icon is a square.
            [iconOnly]: { width: size.height, padding: 0 },
            [`${iconOnly} > .MuiSvgIcon-root`]: { fontSize: size.icon }
          }))
        }
      }
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          lineHeight: 1,
          textTransform: 'none',
          borderColor: lineColor,
          variants: bySize((size) => ({
            height: size.height,
            padding: `0 ${size.inset}px`,
            // Most of its labels are acronyms in capitals, which read a step
            // larger than a Button's mixed case at the same size.
            fontSize: size.fontSize - 1,
            '& .MuiSvgIcon-root': { fontSize: size.icon }
          }))
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: 0,
          borderRadius: 4,
          variants: bySize((size) => ({
            width: size.height,
            height: size.height,
            '& .MuiSvgIcon-root': { fontSize: size.icon }
          }))
        }
      }
    },
    // A multiline field grows with its text, so only a single line takes a height.
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: lineColor },
        root: {
          [`&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiOutlinedInput-notchedOutline`]:
            { borderColor: lineHoverColor },
          variants: bySize((size) => ({
            fontSize: size.fontSize,
            '&:not(.MuiInputBase-multiline)': { height: size.height },
            '& .MuiInputBase-input:not(.MuiInputBase-inputMultiline)': {
              height: '100%',
              boxSizing: 'border-box',
              padding: `0 ${size.inset}px`
            },
            '& .MuiSelect-select': {
              display: 'flex',
              alignItems: 'center',
              minHeight: 0,
              paddingRight: size.inset + 24
            }
          }))
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          lineHeight: `${labelLineHeight}px`,
          variants: bySize((size) => ({
            fontSize: size.fontSize,
            '&.MuiInputLabel-outlined': {
              transform: `translate(${size.inset + 1}px, ${(size.height - labelLineHeight) / 2}px) scale(1)`
            },
            '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
              transform: `translate(${size.inset + 1}px, -${(labelLineHeight * 0.75) / 2}px) scale(0.75)`
            }
          }))
        }
      }
    },
    // The grid draws its outer edge and every row and column line in one variable.
    MuiDataGrid: {
      styleOverrides: {
        // The grid writes its variables in a <style> tag of its own, after this
        // one, so the override takes a second class to win.
        root: { '&&': { '--DataGrid-t-color-border-base': lineColor } }
      }
    },
    // A tooltip is drawn like a small dialog: the same surface, border and shadow.
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          background: theme.palette.background.paper,
          border: `1px solid ${dialogBorder}`,
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 400,
          lineHeight: '16px',
          color: '#e6e6e6'
        }),
        arrow: { color: dialogBorder }
      }
    },
    // Dialog gives its Paper elevation 24, which in dark mode Paper renders as a
    // 16.5% white overlay: a pale slab on a near-black app. The `background`
    // shorthand resets background-image.
    MuiDialog: {
      styleOverrides: {
        root: { '& .MuiBackdrop-root:not(.MuiBackdrop-invisible)': { background: dialogShade } },
        paper: ({ theme }) => ({
          background: theme.palette.background.paper,
          border: `1px solid ${dialogBorder}`,
          borderRadius: 8,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)'
        })
      }
    },
    // The icon and the title share one row, the title 1 px below centre.
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '24px 24px 0',
          fontSize: 17,
          fontWeight: 500,
          lineHeight: '24px',
          '& .dialog-title-text': { position: 'relative', top: 1, paddingRight: 8 }
        }
      }
    },
    // The text lines up under the title rather than under the icon, and keeps
    // 8 px more on the right. A dialog holding one paragraph sits it 4 px
    // closer to its title than one holding several.
    MuiDialogContent: {
      styleOverrides: {
        root: {
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: `14px 32px 24px ${24 + DIALOG_ICON_SIZE + 14}px`,
          '.MuiDialogTitle-root + &': { paddingTop: 14 },
          '.MuiDialogTitle-root + &:has(> .MuiDialogContentText-root:only-child)': {
            paddingTop: 10
          }
        }
      }
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: { margin: 0, fontSize: 13, lineHeight: '20px', color: dialogText }
      }
    },
    // The band the buttons sit in, set off from the message above it.
    MuiDialogActions: {
      defaultProps: { disableSpacing: true },
      styleOverrides: {
        root: {
          gap: 8,
          padding: 14,
          borderTop: `1px solid ${dialogBandBorder}`,
          background: dialogBand,
          '& .MuiButton-root': { height: 36, fontSize: 13, letterSpacing: '0.04em' },
          '& .MuiButton-text': { padding: '0 16px', color: '#e6e6e6' },
          '& .MuiButton-contained': { padding: '0 20px', color: '#141414' },
          '& .MuiButton-contained.MuiButton-colorError': { '--variant-containedBg': dialogDanger },
          '& .MuiButton-contained.Mui-disabled': { color: 'rgba(255,255,255,0.3)' }
        }
      }
    }
  }
})

// What the Data Grid lifts its rows to in dark mode, left alone:
// color-mix(in srgb, #1F1F1F 95%, #fff), which lands here. The panels behind the
// server lists sit on the same slab, and x-data-grid augments PaletteOptions but
// not Palette, so the value cannot be read back off the theme. It is named here
// instead, and both sides read the name.
export const gridSurface = '#2A2A2A'

/** The shadow a grid panel casts on the app background. */
export const panelShadow = '0 6px 20px rgba(0, 0, 0, 0.45)'

// headerBg puts just the column headers back on the app background. bg is the
// value the grid already computed, pinned so the panels can share it.
export const theme = createTheme(base, {
  palette: {
    DataGrid: {
      bg: gridSurface,
      headerBg: base.palette.background.default
    }
  }
})
