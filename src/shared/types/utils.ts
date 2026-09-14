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

// ? type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
