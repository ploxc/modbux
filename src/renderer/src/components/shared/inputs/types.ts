import { MaskSetFn } from '@renderer/context/client.zustand.types'

export interface MaskInputProps {
  set: MaskSetFn
  max?: number
}
export const maskInputProps = (props: MaskInputProps): MaskInputProps => props
