import z from 'zod'

const AppTypeSchema = z.enum(['client', 'server'])
export type AppType = z.infer<typeof AppTypeSchema>

export const PersistedLayoutZustandSchema = z.object({
  showLog: z.boolean(),
  appType: AppTypeSchema.optional()
})
export type PersistedLayoutZustand = z.infer<typeof PersistedLayoutZustandSchema>

export type LayoutZustand = {
  /** The running app's own version, read once at startup. Not the client's. */
  version: string
  setVersion: (version: string) => void
  hideHomeButton: boolean
  homeShiftKeyDown: boolean
  showClientRawValues: boolean
  /** Whether the register grid keeps filling while a scan runs. */
  showGridWhileScanning: boolean
  toggleShowClientRawValues: () => void
  setHomeShiftKeyDown: (down: boolean) => void
  setHideHomeButton: (hide: boolean) => void
  toggleShowLog: () => void
  toggleShowGridWhileScanning: () => void
  setShowLog: (show: boolean) => void
  setAppType: (appType: AppType | undefined) => void
} & PersistedLayoutZustand
