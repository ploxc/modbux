export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<Exclude<T[K], undefined>> }
  : Exclude<T, undefined>

/**
 * A snake_case name as the camelCase method `window.api` carries.
 *
 * This and `snakeToCamel` have to agree, and they do so only over names built
 * from lowercase segments: the type capitalises whatever follows an underscore,
 * while the function's `_([a-z])` leaves a digit or a capital where it stands.
 * A conformance rule holds `IPC_CHANNELS` to that shape, which is what makes the
 * cast inside `snakeToCamel` safe.
 */
export type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S

/**
 * The camelCase method name a snake_case channel becomes on `window.api`.
 *
 * The cast is what no compiler can do for a string replace, and it sits here
 * rather than at the call site so every caller is checked against it. It holds
 * for names of lowercase segments, which is the shape the conformance suite
 * requires of `IPC_CHANNELS`: `_([a-z])` leaves a digit or a capital where it
 * stands, and `CamelCase` would capitalise it.
 */
export function snakeToCamel<S extends string>(str: S): CamelCase<S> {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) as CamelCase<S>
}
