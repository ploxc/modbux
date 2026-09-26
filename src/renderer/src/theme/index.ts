// Brings the palette.DataGrid tokens into the type system.
import '@mui/x-data-grid/themeAugmentation'
import { createTheme } from '@mui/material/styles'

// The dialogs as drawn on the 3.0 dialogs canvas.
const dialogShade = 'rgba(0,0,0,0.62)'
const dialogBorder = '#303030'
const dialogText = '#b0b0b0'
const dialogBand = '#1b1b1b'
const dialogBandBorder = '#2a2a2a'
const dialogDanger = '#e0735f'

/** The round badge in front of a dialog's title, which the text indents past. */
export const DIALOG_ICON_SIZE = 36

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
      defaultProps: { variant: 'contained' }
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
