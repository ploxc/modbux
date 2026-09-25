/**
 * The part of `gif-encoder-2` (1.0.5, no types of its own) the presentation
 * scenes use to stitch their screenshots into a GIF.
 */
declare module 'gif-encoder-2' {
  export default class GIFEncoder {
    constructor(width: number, height: number)
    setDelay(milliseconds: number): void
    setRepeat(repeat: number): void
    start(): void
    addFrame(pixels: Uint8Array | Buffer): void
    finish(): void
    out: { getData(): Buffer }
  }
}
