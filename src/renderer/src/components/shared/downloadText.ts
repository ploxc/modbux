/**
 * Hands the user a file built from parts, through a Blob rather than
 * `downloadJson`'s data URL: a log's CSV is a line per sample, up to a
 * million, and a Blob takes them without encoding them into the URL.
 */
export const downloadText = (filename: string, parts: string[], type: string): void => {
  const url = URL.createObjectURL(new Blob(parts, { type }))
  const element = document.createElement('a')
  element.href = url
  element.download = filename
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
  URL.revokeObjectURL(url)
}
