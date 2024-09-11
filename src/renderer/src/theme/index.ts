import { createTheme } from '@mui/material'

export const theme = createTheme({
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
