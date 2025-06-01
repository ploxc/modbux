import z from 'zod'

const AppTypeSchema = z.enum(['client', 'server'])
export type AppType = z.infer<typeof AppTypeSchema>

export const PersistedLayoutZustandSchema = z.object({
  showLog: z.boolean(),
  appType: AppTypeSchema.optional()
})
export type PersistedLayoutZustand = z.infer<typeof PersistedLayoutZustandSchema>

export type LayoutZustand = {
  hideHomeButton: boolean
  homeShiftKeyDown: boolean
  setHomeShiftKeyDown: (down: boolean) => void
  setHideHomeButton: (hide: boolean) => void
  toggleShowLog: () => void
  setShowLog: (show: boolean) => void
  setAppType: (appType: AppType | undefined) => void
} & PersistedLayoutZustand
