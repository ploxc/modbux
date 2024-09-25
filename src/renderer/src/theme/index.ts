import { createTheme } from '@mui/material'

export const theme = createTheme({
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
      main: '#a10702'
    },
    info: {
      main: '#ccc'
    },
    success: {
      main: '#99c24d'
    }
  },
  components: {
    MuiButton: {
      defaultProps: { variant: 'contained' }
    }
  }
})
