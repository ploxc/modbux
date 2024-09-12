import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'

export const useRootZustand = create<
  RootZusand,
  [['zustand/persist', never], ['zustand/mutative', never]]
>(
  persist(
    mutative((set) => ({
      connectionConfig: window.api.connectionConfig,
      setPort: (port: number) =>
        set((state) => {
          state.connectionConfig.tcp.options.port = port
          window.api.updateConnectionConfig({ tcp: { options: { port } } })
        }),
      registerData: []
    })),
    { name: 'rootZustand' }
  )
)

useRootZustand.persist.clearStorage()
