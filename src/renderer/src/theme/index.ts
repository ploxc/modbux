// Brings the palette.DataGrid tokens into the type system.
import '@mui/x-data-grid/themeAugmentation'
import { createTheme } from '@mui/material'

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
    }
  }
})

// The Data Grid paints its own surfaces from palette.DataGrid. Left alone it
// lightens the whole grid in dark mode (color-mix of paper with white); pinning
// headerBg puts just the column headers back on the app background, leaving the
// rows and footer on the grid's own base.
export const theme = createTheme(base, {
  palette: {
    DataGrid: {
      headerBg: base.palette.background.default
    }
  }
})
