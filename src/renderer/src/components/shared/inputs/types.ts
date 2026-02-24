import { MaskSetFn } from '@renderer/context/root.zustand.types'

export interface MaskInputProps {
  set: MaskSetFn
  max?: number
}
export const maskInputProps = (props: MaskInputProps): MaskInputProps => props
