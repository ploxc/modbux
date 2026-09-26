import { shownType, useClientZustand } from '@renderer/context/client.zustand'
import { RegisterType } from '@shared'
import { createContext, useContext } from 'react'

/**
 * The register type a section of the grid is about. With two types side by
 * side each section provides its own; outside a section there is none, and
 * the type the view acts on answers instead.
 */
export const SectionTypeContext = createContext<RegisterType | undefined>(undefined)

/** The register type of the section this is drawn in. */
export const useSectionType = (): RegisterType => {
  const section = useContext(SectionTypeContext)
  const shown = useClientZustand((z) => shownType(z))
  return section ?? shown
}
