import { deepEqual } from 'fast-equals'
import { memo } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const meme = <T extends React.ComponentType<any> | React.ForwardRefExoticComponent<any>>(
  component: T
): React.MemoExoticComponent<T> =>
  memo(component, (prevProps, nextProps) => deepEqual(prevProps, nextProps))
