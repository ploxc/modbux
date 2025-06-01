import { MaskSetFn } from '@renderer/context/root.zustand.types'

export interface MaskInputProps {
  set: MaskSetFn
}
export const maskInputProps = (props: MaskInputProps) => props
