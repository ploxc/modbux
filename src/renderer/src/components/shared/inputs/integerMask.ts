import { IMask } from 'react-imask'

/**
 * The mask a field takes when the value it carries is a whole number.
 *
 * `IMask.MaskedNumber` defaults to a scale of 2 and a radix of ',' with '.'
 * mapped onto it, so a field on the defaults accepts a decimal separator and
 * hands its setter a string `Number()` answers `NaN` to. A scale of 0 refuses
 * both separators, and the digits around one still arrive.
 *
 * The fields that do carry a fraction set their own scale and radix beside the
 * mask, and this is not for them.
 */
export const integerMask = { mask: IMask.MaskedNumber, scale: 0 }
