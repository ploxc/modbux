import { deepEqual } from 'fast-equals'
import { memo } from 'react'

export const meme = <FC extends Parameters<typeof memo>[0]>(component: FC) =>
  memo(component, (prevProps: object, currentProps: object) => deepEqual(prevProps, currentProps))
