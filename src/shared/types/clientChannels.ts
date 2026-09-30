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
import { MAX_READ_BITS, RegisterAddressSchema } from './ranges'
import { ScanRegistersParametersSchema, ScanUnitIDParametersSchema, ScanUnitIDResult } from './scan'
import { LogSeriesSchema } from './log'

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
 * in Monitor, whose poll reads the configured groups of every unit.
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

/** One read of a group Monitor shows: its start and its length. */
export const ClientReadGroupSchema = z.object({
  uuid: ClientUuidSchema,
  unit: UnitUuidSchema,
  type: RegisterTypeSchema,
  group: z.tuple([RegisterAddressSchema, z.number().int().min(1).max(MAX_READ_BITS)])
})
export type ClientReadGroup = z.infer<typeof ClientReadGroupSchema>

/** Switch a client's logging on, after the samples its log holds or in an empty log. */
export const ClientStartLogSchema = z.object({
  uuid: ClientUuidSchema,
  append: z.boolean()
})
export type ClientStartLog = z.infer<typeof ClientStartLogSchema>

/** How many samples a client's log holds, each 16 bytes and a reference in main. */
export const ClientLogCapacitySchema = z.object({
  uuid: ClientUuidSchema,
  capacity: z.number().int().min(1000).max(10_000_000)
})
export type ClientLogCapacity = z.infer<typeof ClientLogCapacitySchema>

/**
 * A page of a client's log for an export: the registers it names, from the
 * sample with sequence `after` on, between `from` and `to` when given.
 */
const LogPageQuerySchema = z.object({
  after: z.number().int().min(0),
  limit: z.number().int().min(1).max(100_000),
  from: z.number().optional(),
  to: z.number().optional(),
  series: z.array(LogSeriesSchema)
})
export type LogPageQuery = z.infer<typeof LogPageQuerySchema>

export const ClientLogPageSchema = LogPageQuerySchema.extend({ uuid: ClientUuidSchema })
export type ClientLogPage = z.infer<typeof ClientLogPageSchema>

/**
 * Which of a register's samples a chart asks for: from `from` up to `to`, and
 * from the sequence `after` on, which a chart that moves live asks from the
 * end it was given. With a `step`, the samples in each `step` milliseconds
 * come back as the lowest and highest of them and the first failed read.
 */
const LogWindowQuerySchema = z.object({
  from: z.number(),
  to: z.number().optional(),
  after: z.number().int().min(0),
  step: z.number().positive().optional()
})
export type LogWindowQuery = z.infer<typeof LogWindowQuerySchema>

export const ClientLogWindowSchema = LogWindowQuerySchema.extend({
  uuid: ClientUuidSchema,
  series: LogSeriesSchema
})
export type ClientLogWindow = z.infer<typeof ClientLogWindowSchema>

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

/** The rows of one group Monitor read on its own, and how the read went. */
export interface GroupDataEvent {
  uuid: string
  unit: string
  type: RegisterType
  group: AddressGroup
  result: AddressGroupResult
  registerData: RegisterData[]
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
