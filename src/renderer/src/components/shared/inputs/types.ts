import { AsyncMaskSetFn, MaskSetFn } from '@renderer/context/client.zustand.types'

export interface MaskInputProps {
  /**
   * The mask inputs call this and discard what comes back, so a setter that
   * waits on the backend fits here too. Server `setPort` is the one that does.
   */
  set: MaskSetFn | AsyncMaskSetFn
  max?: number
}
export const maskInputProps = (props: MaskInputProps): MaskInputProps => props
