import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import CloseIcon from '@mui/icons-material/Close'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useEffect, useState } from 'react'

const FORCE_SHOW_BANNER = false // Set to true for testing

interface GitHubRelease {
  tag_name: string
  html_url: string
}

const UpdateBanner = meme((): JSX.Element | null => {
  const [showBanner, setShowBanner] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null)

  useEffect(() => {
    const checkForUpdates = async (): Promise<void> => {
      try {
        // Check if banner was dismissed in this session
        const dismissed = sessionStorage.getItem('updateBannerDismissed')
        if (dismissed && !FORCE_SHOW_BANNER) return

        // Fetch latest release from GitHub API
        const response = await fetch('https://api.github.com/repos/ploxc/modbux/releases/latest', {
          headers: {
            Accept: 'application/vnd.github.v3+json'
          }
        })

        if (!response.ok) {
          // If API call fails, silently fail (don't show banner)
          return
        }

        const release: GitHubRelease = await response.json()
        const latestTag = release.tag_name.replace(/^v/, '') // Remove 'v' prefix if present
        // Asked for directly rather than read off the root store, so the
        // banner stays testable on its own. The version cannot change while
        // the app runs, so a second read costs nothing.
        const currentVersion = await window.api.getAppVersion()

        // Compare versions
        if (FORCE_SHOW_BANNER || isNewerVersion(latestTag, currentVersion)) {
          setLatestVersion(latestTag)
          setReleaseUrl(release.html_url)
          setShowBanner(true)
        }
      } catch (error) {
        // Silently fail - don't show banner if anything goes wrong
        console.error('Failed to check for updates:', error)
      }
    }

    checkForUpdates()
  }, [])

  const handleDismiss = (): void => {
    setShowBanner(false)
    sessionStorage.setItem('updateBannerDismissed', 'true')
  }

  // Simple version comparison (assumes semver format)
  const isNewerVersion = (latest: string, current: string): boolean => {
    const latestParts = latest.split('.').map(Number)
    const currentParts = current.split('.').map(Number)

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const latestPart = latestParts[i] || 0
      const currentPart = currentParts[i] || 0

      if (latestPart > currentPart) return true
      if (latestPart < currentPart) return false
    }

    return false
  }

  if (!showBanner || !latestVersion || !releaseUrl) return null

  return (
    <Collapse in={showBanner} sx={{ position: 'relative', zIndex: 9999 }}>
      <Alert
        severity="warning"
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={handleDismiss}
            data-testid="update-banner-close"
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': {
            width: '100%'
          }
        }}
        data-testid="update-banner"
      >
        <AlertTitle>New version available</AlertTitle>
        Version {latestVersion} is now available.{' '}
        <Link
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{ fontWeight: 600 }}
          data-testid="update-banner-link"
        >
          Download latest release
        </Link>
      </Alert>
    </Collapse>
  )
})

export default UpdateBanner
