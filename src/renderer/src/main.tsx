import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'

import './index.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import { CssBaseline, IconButton } from '@mui/material'
import { styled, ThemeProvider } from '@mui/material/styles'
import { theme } from './theme'
import { closeSnackbar, SnackbarProvider, MaterialDesignContent } from 'notistack'
import { Close } from '@mui/icons-material'

const StyledMaterialDesignContent = styled(MaterialDesignContent)(() => ({
  '&.notistack-MuiContent-success': {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    '& .MuiIconButton-root': {
      svg: { fill: theme.palette.success.contrastText }
    }
  },
  '&.notistack-MuiContent-error': {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
    '& .MuiIconButton-root': {
      svg: { fill: theme.palette.error.contrastText }
    }
  },
  '&.notistack-MuiContent-warning': {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
    '& .MuiIconButton-root': {
      svg: { fill: theme.palette.warning.contrastText }
    }
  },
  '&.notistack-MuiContent-info': {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.info.contrastText,
    '& .MuiIconButton-root': {
      svg: { fill: theme.palette.info.contrastText }
    }
  },
  '&.notistack-MuiContent-default': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&.MuiIconButton-root': {
      svg: { fill: theme.palette.primary.contrastText }
    }
  }
}))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <SnackbarProvider
        {...{
          preventDuplicate: true,
          autoHideDuration: 6000,
          Components: {
            error: StyledMaterialDesignContent,
            success: StyledMaterialDesignContent,
            warning: StyledMaterialDesignContent,
            info: StyledMaterialDesignContent,
            default: StyledMaterialDesignContent
          },
          action: (snackbarId) => (
            <IconButton onClick={() => closeSnackbar(snackbarId)}>
              <Close />
            </IconButton>
          )
        }}
      >
        <CssBaseline />
        <App />
      </SnackbarProvider>
    </ThemeProvider>
  </React.StrictMode>
)
