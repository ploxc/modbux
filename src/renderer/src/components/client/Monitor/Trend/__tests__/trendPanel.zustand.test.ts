// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { TREND_COLORS } from '@renderer/theme'
import { newClientUnit } from '@shared'
import { snapshotOf, TrendEntry, trendKey, useTrendPanelZustand } from '../trendPanel.zustand'

const entry = (address: number, uuid = 'client-a'): TrendEntry => ({
  uuid,
  unit: 'unit-1',
  type: 'holding_registers',
  address
})
const store = (): ReturnType<typeof useTrendPanelZustand.getState> =>
  useTrendPanelZustand.getState()
const colors = (): string[] => store().entries.map(({ color }) => color)

beforeEach(() =>
  useTrendPanelZustand.setState({ uuid: '', entries: [], anchor: null, view: undefined })
)

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

  it('stays open when the last register is taken out', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().remove(trendKey(entry(0)))

    expect(store().anchor).toBe(anchor)
    expect(store().entries).toEqual([])
  })

  it('keeps its registers once closed, and opens again as it was left', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().close()
    expect(store().anchor).toBeNull()

    store().open('client-a', anchor)
    expect(store().anchor).toBe(anchor)
    expect(store().entries.map(({ address }) => address)).toEqual([0])
  })

  it("opens empty for another client's log", () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().close()
    store().open('client-b', anchor)

    expect(store().entries).toEqual([])
    expect(store().uuid).toBe('client-b')
  })

  it('opens again when a register it holds is added while closed', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().close()
    store().add(entry(0), anchor)

    expect(store().anchor).toBe(anchor)
  })

  it('follows the log again on a new range, and once closed', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().setView({ from: 1, to: 2 })
    store().setRange('1h')
    expect(store().view).toBeUndefined()

    store().setView({ from: 1, to: 2 })
    store().close()
    expect(store().view).toBeUndefined()
  })

  it('follows the log again once its last register is taken out', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().setView({ from: 1, to: 2 })
    store().remove(trendKey(entry(0)))

    expect(store().view).toBeUndefined()
  })

  it('toggles a register in and out, with a free colour, and refuses one past the colours', () => {
    const anchor = document.createElement('div')
    store().open('client-a', anchor)
    expect(store().toggle(entry(0))).toBe(true)
    expect(store().toggle(entry(1))).toBe(true)
    expect(store().toggle(entry(0))).toBe(true)
    expect(store().entries.map(({ address, color }) => [address, color])).toEqual([
      [1, TREND_COLORS[1]]
    ])

    for (const address of [2, 3, 4, 5, 6, 7, 8]) store().toggle(entry(address))
    expect(store().toggle(entry(9))).toBe(false)
    expect(store().entries).toHaveLength(TREND_COLORS.length)
  })

  it('swaps colours with the register that holds the one picked', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().add(entry(1), anchor)
    store().setColor(trendKey(entry(0)), TREND_COLORS[1])

    expect(colors()).toEqual([TREND_COLORS[1], TREND_COLORS[0]])
  })

  it('gives a free colour without taking one from another register', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().add(entry(1), anchor)
    store().setColor(trendKey(entry(0)), TREND_COLORS[5])

    expect(colors()).toEqual([TREND_COLORS[5], TREND_COLORS[1]])
  })

  it('draws a register on the side it is set to, and on its own again with none', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().setSide(trendKey(entry(0)), 'right')
    expect(store().entries[0]?.side).toBe('right')

    store().setSide(trendKey(entry(0)), undefined)
    expect(store().entries[0]?.side).toBeUndefined()
  })

  it('takes out, when pruned, a register that no longer logs', () => {
    const unit = newClientUnit('unit-1', 1)
    unit.registerMapping.holding_registers = {
      0: { dataType: 'uint16', log: { mode: 'poll' } },
      1: { dataType: 'uint16' }
    }
    store().add(entry(0), document.createElement('div'))
    store().add(entry(1), document.createElement('div'))
    store().prune([unit])

    expect(store().entries.map(({ address }) => address)).toEqual([0])
  })

  it('follows the log again once pruned empty', () => {
    store().add(entry(1), document.createElement('div'))
    store().setView({ from: 1, to: 2 })
    store().prune([newClientUnit('unit-1', 1)])

    expect(store().view).toBeUndefined()
  })

  it('saves what it draws, and loads it back under its name', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().add(entry(1), anchor)
    store().setSide(trendKey(entry(1)), 'right')
    store().setRange('1h')
    store().setDrawAs('steps')
    const saved = snapshotOf(store(), 'Currents')
    expect(saved).toEqual({
      name: 'Currents',
      entries: [
        { unit: 'unit-1', type: 'holding_registers', address: 0, color: TREND_COLORS[0] },
        {
          unit: 'unit-1',
          type: 'holding_registers',
          address: 1,
          color: TREND_COLORS[1],
          side: 'right'
        }
      ],
      range: '1h',
      settings: { time: 'clock', drawAs: 'steps' }
    })

    store().startNew()
    expect(store()).toMatchObject({ name: undefined, entries: [], range: '10m' })

    store().load('client-a', saved)
    expect(store().name).toBe('Currents')
    expect(snapshotOf(store(), 'Currents')).toEqual(saved)
    expect(store().entries[0]?.uuid).toBe('client-a')
  })

  it('saves as it was after a side is held and set back to Auto', () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    const before = snapshotOf(store(), 'Currents')
    store().setAxisRange('left', { min: 0, max: 10 })
    store().setAxisRange('left', undefined)

    expect(snapshotOf(store(), 'Currents')).toStrictEqual(before)
  })

  it("forgets the name when it starts over with another client's register", () => {
    const anchor = document.createElement('div')
    store().add(entry(0), anchor)
    store().setName('Currents')
    store().add(entry(0, 'client-b'), anchor)

    expect(store().name).toBeUndefined()
  })
})
