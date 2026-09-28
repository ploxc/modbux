import { create } from 'zustand'

/** Whether the conversion script engine has loaded, which a cell showing a script's value reads. */
export const useScriptEngineZustand = create<{ ready: boolean }>(() => ({ ready: false }))
