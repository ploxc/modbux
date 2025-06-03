/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { RegisterType } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'

interface ServerGridZustand {
  collapse: { [key in RegisterType]: boolean }
  toggleCollapse: (type: RegisterType) => void
}

const useServerGridZustand = create<
  ServerGridZustand,
  [['zustand/persist', never], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      collapse: {
        coils: false,
        discrete_inputs: false,
        input_registers: false,
        holding_registers: false
      },
      toggleCollapse: (type) =>
        set((state) => {
          state.collapse[type] = !get().collapse[type]
        })
    })),
    { name: 'server-grid.zustand' }
  )
)

export default useServerGridZustand
