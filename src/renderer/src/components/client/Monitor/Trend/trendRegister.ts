import { applyConversion } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import { ClientUnit, isBooleanRegister, isNumberRegister, RegisterMapValue } from '@shared'
import { TrendEntry } from './trendPanel.zustand'

/** The mapping entry of the register a trend draws. */
export const mapValueOf = (units: ClientUnit[], entry: TrendEntry): RegisterMapValue | undefined =>
  units.find(({ uuid }) => uuid === entry.unit)?.registerMapping[entry.type][entry.address]

/** The register's address as its unit's address base writes it. */
export const addressOf = (units: ClientUnit[], entry: TrendEntry): number =>
  entry.address + Number(units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0')

/** Whether a register is drawn as a lane under the lines: a bit, or a bitmap's word. */
export const isLane = (entry: TrendEntry, mapValue: RegisterMapValue | undefined): boolean =>
  isBooleanRegister(entry.type) || mapValue?.dataType === 'bitmap'

/** A register's raw value as the grid converts it, and none where the conversion gives no number. */
export const convertOf =
  (entry: TrendEntry, mapValue: RegisterMapValue | undefined) =>
  (raw: number): number | undefined => {
    if (!isNumberRegister(entry.type)) return raw
    const converted = applyConversion(String(raw), mapValue?.dataType, mapValue?.conversion)
    return typeof converted === 'number' ? converted : undefined
  }
