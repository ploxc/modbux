import { describe, expect, it } from 'vitest'
import { wordOf, type RegisterDataWords } from '@shared'

const words: RegisterDataWords = {
  int16: -1,
  uint16: 65535,
  int32: -1,
  uint32: 4294967295,
  unix: '1970-01-01',
  float: 1.5,
  int64: -1n,
  uint64: 1n,
  double: 2.5,
  datetime: '2026-09-25',
  utf8: 'ab'
}

describe('wordOf', () => {
  it.each([
    ['float', 1.5],
    ['uint64', 1n],
    ['utf8', 'ab']
  ] as const)('reads the %s word', (dataType, word) => {
    expect(wordOf(words, dataType)).toBe(word)
  })

  it.each([['none'], ['bitmap'], [undefined]] as const)('has no word for %s', (dataType) => {
    expect(wordOf(words, dataType)).toBeUndefined()
  })

  it('has no word for a row that carries none', () => {
    expect(wordOf(undefined, 'float')).toBeUndefined()
  })
})
