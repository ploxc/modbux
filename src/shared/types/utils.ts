export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<Exclude<T[K], undefined>> }
  : Exclude<T, undefined>

// ? type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
