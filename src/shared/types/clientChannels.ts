import z from 'zod'
import {
  AddressGroup,
  ClientState,
  ConnectionConfigSchema,
  RegisterConfigSchema,
  RegisterData,
  RegisterMappingSchema,
  Transaction,
  WriteParametersSchema
} from './client'
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
  registerConfig: RegisterConfigSchema.deepPartial()
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

export const ClientRegisterMappingSchema = z.object({
  uuid: ClientUuidSchema,
  registerMapping: RegisterMappingSchema
})
export type ClientRegisterMapping = z.infer<typeof ClientRegisterMappingSchema>

export const ClientReadConfigurationSchema = z.object({
  uuid: ClientUuidSchema,
  readConfiguration: z.boolean()
})
export type ClientReadConfiguration = z.infer<typeof ClientReadConfigurationSchema>

export const ClientWriteSchema = z.object({
  uuid: ClientUuidSchema,
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
  registerData: RegisterData[]
}

export interface AddressGroupsEvent {
  uuid: string
  addressGroups: AddressGroup[]
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
