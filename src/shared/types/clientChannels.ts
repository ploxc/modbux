import z from 'zod'
import {
  AddressGroup,
  AddressGroupResult,
  ClientState,
  ClientUnitSchema,
  ConnectionConfigSchema,
  RegisterConfigSchema,
  RegisterData,
  Transaction,
  WriteParametersSchema
} from './client'
import { RegisterType, RegisterTypeSchema } from './register'
import { ScanRegistersParametersSchema, ScanUnitIDParametersSchema, ScanUnitIDResult } from './scan'

/**
 * The uuid a client is addressed by.
 *
 * Main holds a client per uuid, and every client channel names the one it
 * drives: a channel without one would reach whichever client main guessed.
 */
export const ClientUuidSchema = z.string().min(1)

/**
 * A client to make, with the config a window holds for it. A client main holds
 * already takes the config too, except the connection it rides on, which stays
 * while it rides.
 */
export const ClientCreateSchema = z.object({
  uuid: ClientUuidSchema,
  connectionConfig: ConnectionConfigSchema.deepPartial(),
  registerConfig: RegisterConfigSchema.deepPartial(),
  units: z.array(ClientUnitSchema)
})
export type ClientCreate = z.infer<typeof ClientCreateSchema>

export const ClientConnectionConfigUpdateSchema = z.object({
  uuid: ClientUuidSchema,
  connectionConfig: ConnectionConfigSchema.deepPartial()
})
export type ClientConnectionConfigUpdate = z.infer<typeof ClientConnectionConfigUpdateSchema>

export const ClientRegisterConfigUpdateSchema = z.object({
  uuid: ClientUuidSchema,
  registerConfig: RegisterConfigSchema.deepPartial()
})
export type ClientRegisterConfigUpdate = z.infer<typeof ClientRegisterConfigUpdateSchema>

/**
 * Every unit a client talks to, replacing the ones main held. A unit's uuid
 * appears once: two entries under one uuid would be one unit read twice.
 */
export const ClientUnitsSchema = z.object({
  uuid: ClientUuidSchema,
  units: z
    .array(ClientUnitSchema)
    .refine((units) => new Set(units.map((unit) => unit.uuid)).size === units.length, {
      message: 'A unit appears twice'
    })
    .refine((units) => new Set(units.map((unit) => unit.unitId)).size === units.length, {
      message: 'A unit ID appears twice'
    })
})
export type ClientUnits = z.infer<typeof ClientUnitsSchema>

/** A unit of a client, by the unit's uuid. */
const UnitUuidSchema = z.string().min(1)

export const ClientReadConfigurationSchema = z.object({
  uuid: ClientUuidSchema,
  unit: UnitUuidSchema,
  readConfiguration: z.boolean()
})
export type ClientReadConfiguration = z.infer<typeof ClientReadConfigurationSchema>

/**
 * The register types of a client's units that are on screen. A poll reads
 * nothing else, so a grid nobody sees costs no request.
 */
/**
 * What of a client is on screen: the sections Debug shows, or the whole client
 * in Monitor, which reads every unit's configured groups whatever is scrolled
 * or folded.
 */
export const ClientVisibleSectionsSchema = z.object({
  uuid: ClientUuidSchema,
  sections: z.array(z.object({ unit: UnitUuidSchema, type: RegisterTypeSchema })),
  monitor: z.boolean()
})
export type ClientVisibleSections = z.infer<typeof ClientVisibleSectionsSchema>

/** One read of a unit's register type: its window, or its mapped groups. */
export const ClientReadSchema = z.object({
  uuid: ClientUuidSchema,
  unit: UnitUuidSchema,
  type: RegisterTypeSchema
})
export type ClientRead = z.infer<typeof ClientReadSchema>

export const ClientWriteSchema = z.object({
  uuid: ClientUuidSchema,
  unit: UnitUuidSchema,
  parameters: WriteParametersSchema
})
export type ClientWrite = z.infer<typeof ClientWriteSchema>

export const ClientScanUnitIdsSchema = z.object({
  uuid: ClientUuidSchema,
  parameters: ScanUnitIDParametersSchema
})
export type ClientScanUnitIds = z.infer<typeof ClientScanUnitIdsSchema>

export const ClientScanRegistersSchema = z.object({
  uuid: ClientUuidSchema,
  unit: UnitUuidSchema,
  type: RegisterTypeSchema,
  parameters: ScanRegistersParametersSchema
})
export type ClientScanRegisters = z.infer<typeof ClientScanRegistersSchema>

//
//
// What main pushes about a client, each naming the client it is about.
export interface ClientStateEvent {
  uuid: string
  clientState: ClientState
}

export interface RegisterDataEvent {
  uuid: string
  unit: string
  type: RegisterType
  registerData: RegisterData[]
  /** Whether the read was Monitor's, whose rows are kept apart from Debug's. */
  monitor: boolean
}

export interface AddressGroupsEvent {
  uuid: string
  unit: string
  type: RegisterType
  addressGroups: AddressGroup[]
  /** How each group went, at the index of its group. */
  results: AddressGroupResult[]
  /** Whether the read was Monitor's. */
  monitor: boolean
}

export interface TransactionEvent {
  uuid: string
  transaction: Transaction
}

export interface ScanUnitIdResultEvent {
  uuid: string
  result: ScanUnitIDResult
}

export interface ScanProgressEvent {
  uuid: string
  progress: number
}
