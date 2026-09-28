/**
 * The engineering units a register's unit field suggests, by quantity. The
 * field takes any text; these are what it offers while typing.
 */
const ENGINEERING_UNITS: Record<string, string[]> = {
  Voltage: ['V', 'mV', 'kV'],
  Current: ['A', 'mA', 'kA'],
  Power: ['W', 'kW', 'MW', 'VA', 'kVA', 'MVA', 'var', 'kvar', 'Mvar'],
  Energy: ['Wh', 'kWh', 'MWh', 'varh', 'kvarh', 'J', 'kJ', 'MJ', 'GJ'],
  Frequency: ['Hz', 'kHz', 'rpm'],
  Temperature: ['°C', '°F', 'K'],
  Pressure: ['bar', 'mbar', 'Pa', 'kPa', 'MPa', 'psi'],
  Flow: ['m³/h', 'l/s', 'l/min', 'l/h', 'kg/h'],
  Volume: ['m³', 'l'],
  Length: ['m', 'cm', 'mm'],
  Speed: ['m/s', 'km/h'],
  Mass: ['kg', 't'],
  Time: ['s', 'ms', 'min', 'h'],
  Ratio: ['%', 'ppm'],
  Resistance: ['Ω', 'kΩ']
}

/** Each suggested unit with the quantity it is listed under, in list order. */
export const ENGINEERING_UNIT_OPTIONS: { quantity: string; unit: string }[] = Object.entries(
  ENGINEERING_UNITS
).flatMap(([quantity, units]) => units.map((unit) => ({ quantity, unit })))
