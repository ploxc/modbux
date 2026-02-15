// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import UpdateBanner from '../UpdateBanner'

// Mock window.api
const mockGetAppVersion = vi.fn()
// @ts-expect-error - Mocking window.api for tests
global.window.api = {
  getAppVersion: mockGetAppVersion
}

// Mock fetch
const mockFetch = vi.fn() as ReturnType<typeof vi.fn>
global.fetch = mockFetch as typeof fetch

describe('UpdateBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should not show banner when current version is up to date', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.4.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.4.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    })
  })

  it('should show banner when newer version is available', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    })

    expect(screen.getByText('New version available')).toBeInTheDocument()
    expect(screen.getByText(/Version 1.5.0 is now available/)).toBeInTheDocument()
    expect(screen.getByTestId('update-banner-link')).toHaveAttribute(
      'href',
      'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
    )
  })

  it('should handle version tags with v prefix', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByText(/Version 1.5.0 is now available/)).toBeInTheDocument()
    })
  })

  it('should handle version tags without v prefix', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: '1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByText(/Version 1.5.0 is now available/)).toBeInTheDocument()
    })
  })

  it('should correctly compare semver versions', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.9')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    })
  })

  it('should not show banner when current version is newer', async () => {
    mockGetAppVersion.mockResolvedValue('2.0.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    })
  })

  it('should dismiss banner when close button is clicked', async () => {
    const user = userEvent.setup()
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    })

    const closeButton = screen.getByTestId('update-banner-close')
    await user.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    })

    expect(sessionStorage.getItem('updateBannerDismissed')).toBe('true')
  })

  it('should not show banner after dismissal in same session', async () => {
    sessionStorage.setItem('updateBannerDismissed', 'true')
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    })
  })

  it('should not show banner when API call fails', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    })
  })

  it('should not show banner when fetch throws error', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockRejectedValue(new Error('Network error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
    })

    expect(consoleSpy).toHaveBeenCalledWith('Failed to check for updates:', expect.any(Error))

    consoleSpy.mockRestore()
  })

  it('should open link in new tab with security attributes', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      const link = screen.getByTestId('update-banner-link')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('should have correct alert severity', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.5.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      const alert = screen.getByTestId('update-banner')
      expect(alert).toHaveClass('MuiAlert-standardWarning')
    })
  })

  it('should correctly compare patch versions', async () => {
    mockGetAppVersion.mockResolvedValue('1.4.0')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.4.1',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.4.1'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    })
  })

  it('should correctly compare minor versions', async () => {
    mockGetAppVersion.mockResolvedValue('1.3.9')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.4.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v1.4.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    })
  })

  it('should correctly compare major versions', async () => {
    mockGetAppVersion.mockResolvedValue('1.9.9')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.0.0',
        html_url: 'https://github.com/ploxc/modbux/releases/tag/v2.0.0'
      })
    })

    render(<UpdateBanner />)

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument()
    })
  })
})
