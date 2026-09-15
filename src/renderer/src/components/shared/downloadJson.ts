/**
 * Hands the user a file, through the anchor a browser saves from.
 *
 * Both save buttons built the same seven DOM calls, each with its filename and
 * its `JSON.stringify` interleaved. The anchor is detached again because it is
 * the click that saves, not the element.
 */
export const downloadJson = (filename: string, json: string): void => {
  const element = document.createElement('a')
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(json))
  element.setAttribute('download', filename)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}
