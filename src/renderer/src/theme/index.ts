// Brings the palette.DataGrid tokens into the type system.
import '@mui/x-data-grid/themeAugmentation'
import { createTheme } from '@mui/material/styles'

const base = createTheme({
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
    // 16.5% white overlay -- a pale slab on a near-black app. The `background`
    // shorthand resets background-image; the elevation shadow survives it.
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({ background: theme.palette.background.default })
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
