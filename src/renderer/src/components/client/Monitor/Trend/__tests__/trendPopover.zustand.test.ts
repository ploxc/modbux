// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { TREND_COLORS } from '@renderer/theme'
import { TrendEntry, trendKey, useTrendPopoverZustand } from '../trendPopover.zustand'

const entry = (address: number, uuid = 'client-a'): TrendEntry => ({
  uuid,
  unit: 'unit-1',
  type: 'holding_registers',
  address
})
const store = (): ReturnType<typeof useTrendPopoverZustand.getState> =>
  useTrendPopoverZustand.getState()
const colors = (): string[] => store().entries.map(({ color }) => color)

beforeEach(() => store().close())

describe('the trend store', () => {
  it('opens under the first anchor and stays there as registers are added', () => {
    const first = document.createElement('div')
    store().add(entry(0), first)
    store().add(entry(2), document.createElement('div'))

    expect(store().anchor).toBe(first)
    expect(store().entries.map(({ address }) => address)).toEqual([0, 2])
  })

  it('adds a register it draws already once', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    expect(store().add(entry(0), anchor)).toBe(true)

    expect(store().entries).toHaveLength(1)
  })

  it('gives each line a colour of its own, and a freed colour to the next line', () => {
    const anchor = document.createElement('div')
    for (const address of [0, 1, 2]) store().add(entry(address), anchor)
    store().remove(trendKey(entry(1)))
    store().add(entry(3), anchor)

    expect(colors()).toEqual([TREND_COLORS[0], TREND_COLORS[2], TREND_COLORS[1]])
  })

  it('draws as many registers as there are colours, and refuses one more', () => {
    const anchor = document.createElement('div')
    for (const address of TREND_COLORS.keys())
      expect(store().add(entry(address), anchor)).toBe(true)

    expect(store().add(entry(99), anchor)).toBe(false)
    expect(store().entries).toHaveLength(TREND_COLORS.length)
  })

  it("starts over with a register of another client's log", () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().add(entry(1), anchor)
    store().add(entry(5, 'client-b'), anchor)

    expect(store().entries.map(({ uuid, address, color }) => [uuid, address, color])).toEqual([
      ['client-b', 5, TREND_COLORS[0]]
    ])
  })

  it('closes when the last register is taken out', () => {
    store().add(entry(0), document.createElement('div'))
    store().remove(trendKey(entry(0)))

    expect(store().anchor).toBeNull()
  })
})
