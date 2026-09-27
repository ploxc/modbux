// Brings the palette.DataGrid tokens into the type system.
import '@mui/x-data-grid/themeAugmentation'
import '@mui/x-date-pickers/themeAugmentation'
import { alpha, createTheme } from '@mui/material/styles'

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

/** The outlined primary button on the client canvas: a dim green edge, pale green text. */
const outlinedPrimaryBorder = '#3f5f50'
const outlinedPrimaryText = '#9fd0b8'

/**
 * The client view's surfaces, darkest first: the app's ground is
 * `background.default`, a card (the tab container, the sidebar, the ground
 * between panels) is `background.paper`, a bar on a card is `barSurface`, and
 * a section is `gridSurface`.
 */
export const barSurface = '#242424'

/** The text of a chosen menu item, on its green tint. */
const menuSelectedText = '#b5dcc9'

/** Text that is chosen or selected, and text that sits back. */
export const textBright = '#e6e6e6'
export const textMuted = '#9a9a9a'

/** The switch as the client canvas draws it: a 28 by 16 track, a 12 px knob. */
const switchTrackOff = '#444444'
const switchKnobOn = '#f2f2f2'

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
          })),
          '&.MuiButton-outlinedPrimary:not(.Mui-disabled)': {
            borderColor: outlinedPrimaryBorder,
            color: outlinedPrimaryText
          }
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
    // Shaped as the "AntSwitch" customization example in the MUI docs: every
    // rule sits on the root, after the `small` variant's, so both sizes take it.
    MuiSwitch: {
      styleOverrides: {
        root: ({ theme }) => ({
          width: 28,
          height: 16,
          padding: 0,
          display: 'flex',
          '& .MuiSwitch-switchBase': {
            padding: 2,
            color: textMuted,
            '&:hover': { background: 'transparent' },
            '&.Mui-checked': {
              transform: 'translateX(12px)',
              color: switchKnobOn,
              '& + .MuiSwitch-track': { opacity: 1, background: theme.palette.primary.main }
            },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.4 }
          },
          '& .MuiSwitch-thumb': { width: 12, height: 12, borderRadius: 6, boxShadow: 'none' },
          '& .MuiSwitch-track': {
            borderRadius: 8,
            opacity: 1,
            background: switchTrackOff,
            boxSizing: 'border-box'
          }
        })
      }
    },
    // A label beside a switch takes the medium control's text, and the space the
    // switch no longer pads around itself.
    MuiFormControlLabel: {
      styleOverrides: {
        root: {
          '&:has(.MuiSwitch-root)': {
            marginLeft: 0,
            marginRight: 0,
            gap: 8,
            '& .MuiFormControlLabel-label': { fontSize: controlSizes.medium.fontSize }
          }
        }
      }
    },
    // Menus and dropdowns, variant A on the client canvas's "Menus" artboard.
    MuiMenu: {
      styleOverrides: {
        list: { padding: 4, display: 'flex', flexDirection: 'column', gap: 1 }
      }
    },
    // Every popover, a menu's included, takes the dialogs' surface, edge and
    // radius. The `background` shorthand drops the elevation overlay that
    // lifted it to #383838.
    MuiPopover: {
      styleOverrides: {
        paper: ({ theme }) => ({
          background: theme.palette.background.paper,
          border: `1px solid ${dialogBorder}`,
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        })
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 28,
          height: 28,
          padding: `0 ${controlSizes.medium.padding - 1}px`,
          gap: 8,
          borderRadius: 4,
          fontSize: controlSizes.medium.fontSize,
          color: textBright,
          '&:hover': { background: gridSurface },
          '&.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible': {
            background: alpha(theme.palette.primary.main, 0.16),
            color: menuSelectedText
          },
          '&.MuiDivider-root + &, & + .MuiDivider-root': { marginTop: 0 }
        })
      }
    },
    // An icon in a menu item sits the item's own 8 px gap from its text.
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          '.MuiMenuItem-root > &': {
            minWidth: 0,
            color: 'inherit',
            '& .MuiSvgIcon-root': { fontSize: 16 }
          }
        }
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: { '.MuiMenu-list > &': { margin: '3px 0' } }
      }
    },
    // Page arrows 20 px wide, so their 16 px icons sit 4 px apart.
    MuiTablePagination: {
      styleOverrides: {
        actions: { marginLeft: 10, '& .MuiIconButton-root': { width: 20 } }
      }
    },
    // A multiline field grows with its text, so only a single line takes a height.
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: lineColor },
        root: {
          [`&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiOutlinedInput-notchedOutline`]:
            { borderColor: lineHoverColor },
          // MUI colours a disabled outline from its own, more specific rule.
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: lineColor },
          variants: bySize((size) => ({
            fontSize: size.fontSize,
            '&:not(.MuiInputBase-multiline)': { height: size.height },
            '& .MuiInputBase-input:not(.MuiInputBase-inputMultiline)': {
              height: '100%',
              boxSizing: 'border-box',
              padding: `0 ${size.inset}px`
            },
            // The notch opens 2 px either side of the floated label, which
            // sits at the inset plus one. A field without a label carries a
            // legend too, its span the `notranslate` zero-width space, which
            // padded would open a 4 px gap in the top border.
            '& .MuiOutlinedInput-notchedOutline': { paddingLeft: size.inset - 2 },
            '& .MuiOutlinedInput-notchedOutline legend > span:not(.notranslate)': {
              padding: '0 2px'
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
    // The date pickers draw their own outlined input, which the rule above
    // does not reach.
    MuiPickersOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: lineColor },
        root: {
          [`&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiPickersOutlinedInput-notchedOutline`]:
            { borderColor: lineHoverColor },
          '&.Mui-disabled .MuiPickersOutlinedInput-notchedOutline': { borderColor: lineColor }
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
              // One pixel below centre on the outline, which reads as centred.
              transform: `translate(${size.inset + 1}px, -${(labelLineHeight * 0.75) / 2 - 1}px) scale(0.75)`
            }
          }))
        }
      }
    },
    // The grid draws its outer edge and every row and column line in one variable.
    MuiDataGrid: {
      // One page size for every grid, so the footer offers page switching alone:
      // with a single option the pagination draws no rows-per-page select.
      defaultProps: { pageSizeOptions: [100] },
      styleOverrides: {
        // The grid writes its variables in a <style> tag of its own, after this
        // one, so the override takes a second class to win.
        root: { '&&': { '--DataGrid-t-color-border-base': lineColor } },
        footerContainer: {
          minHeight: 30,
          height: 30,
          overflow: 'hidden',
          // The pagination brings a toolbar of its own, taller than the footer.
          '& .MuiTablePagination-toolbar': { minHeight: 30, height: 30 }
        }
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
