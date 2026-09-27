/**
 * The window and what is laid out in it, for working on the layout itself:
 * every element carrying a `data-testid`, where it sits and how big it is, and
 * whether its content is wider than it, which is how a clipped field shows.
 */
export const inspectLayout = (): unknown => ({
  window: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio
  },
  elements: Array.from(document.querySelectorAll<HTMLElement>('[data-testid]')).map((element) => {
    const box = element.getBoundingClientRect()
    return {
      testId: element.dataset.testid,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      takesSpace: box.width > 0 && box.height > 0,
      overflows: element.scrollWidth > element.clientWidth
    }
  })
})
