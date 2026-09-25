import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'

import './index.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import IconButton from '@mui/material/IconButton'
import { styled, ThemeProvider } from '@mui/material/styles'
import { theme } from './theme'
import { closeSnackbar, SnackbarProvider, MaterialDesignContent } from 'notistack'
import Close from '@mui/icons-material/Close'
import App from './App'
import { installMcpRelay } from './mcp/relay'

// Both windows answer the tool calls main sends them.
installMcpRelay()

const AUTO_HIDE_MS = 3000

const StyledMaterialDesignContent = styled(MaterialDesignContent)(() => ({
  // How long is left. notistack pauses its timer on hover and on window blur,
  // and only the first of those is reachable from CSS, so the bar and the timer
  // agree while the pointer is on the snackbar and drift while the window is in
  // the background.
  //
  // `persist` leaves no timer for a bar to be about, so a snackbar that never
  // hides passes `no-countdown`. Nothing passes it yet: the unit 0 warning is
  // the one that wants it.
  position: 'relative',
  overflow: 'hidden',
  '&::after': {
    content: '""',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    transformOrigin: 'left',
    backgroundColor: 'currentColor',
    opacity: 0.35,
    animation: `snackbar-countdown ${AUTO_HIDE_MS}ms linear forwards`
  },
  '&:hover::after': { animationPlayState: 'paused' },
  '&.no-countdown::after': { display: 'none' },
  '@keyframes snackbar-countdown': {
    from: { transform: 'scaleX(1)' },
    to: { transform: 'scaleX(0)' }
  },
  '&.notistack-MuiContent-success': {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.success.contrastText } }
  },
  '&.notistack-MuiContent-error': {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.error.contrastText } }
  },
  '&.notistack-MuiContent-warning': {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.warning.contrastText } }
  },
  '&.notistack-MuiContent-info': {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.info.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.info.contrastText } }
  },
  '&.notistack-MuiContent-default': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&.MuiIconButton-root': { svg: { fill: theme.palette.primary.contrastText } }
  }
}))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <SnackbarProvider
        maxSnack={3}
        {...{
          preventDuplicate: true,
          autoHideDuration: AUTO_HIDE_MS,
          Components: {
            error: StyledMaterialDesignContent,
            success: StyledMaterialDesignContent,
            warning: StyledMaterialDesignContent,
            info: StyledMaterialDesignContent,
            default: StyledMaterialDesignContent
          },
          action: (snackbarId) => (
            <IconButton data-testid="snackbar-close-btn" onClick={() => closeSnackbar(snackbarId)}>
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
