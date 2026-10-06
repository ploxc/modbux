// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { TREND_COLORS } from '@renderer/theme'
import { newClientUnit } from '@shared'
import { DEFAULT_TREND_SETTINGS, HISTORY_GAP_MS } from '../trendData'
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

/** Monitor's grid room, which the trend opens in. */
let anchor: HTMLElement

beforeEach(() => {
  anchor = document.createElement('div')
  useTrendPanelZustand.setState({
    uuid: '',
    entries: [],
    anchor: null,
    view: undefined,
    room: anchor,
    mode: 'dock',
    openLanes: [],
    settings: DEFAULT_TREND_SETTINGS,
    selection: undefined,
    axisZoom: {},
    history: [],
    historyAt: 0
  })
})

describe('the trend store', () => {
  it('opens in the room and stays where it opened as registers are added', () => {
    store().add(entry(0))
    useTrendPanelZustand.setState({ room: document.createElement('div') })
    store().add(entry(2))

    expect(store().anchor).toBe(anchor)
    expect(store().entries.map(({ address }) => address)).toEqual([0, 2])
  })

  it('adds a register it draws already once', () => {
    store().add(entry(0))
    expect(store().add(entry(0))).toBe(true)

    expect(store().entries).toHaveLength(1)
  })

  it('gives each line a colour of its own, and a freed colour to the next line', () => {
    for (const address of [0, 1, 2]) store().add(entry(address))
    store().remove(trendKey(entry(1)))
    store().add(entry(3))

    expect(colors()).toEqual([TREND_COLORS[0], TREND_COLORS[2], TREND_COLORS[1]])
  })

  it('draws as many registers as there are colours, and refuses one more', () => {
    for (const address of TREND_COLORS.keys()) expect(store().add(entry(address))).toBe(true)

    expect(store().add(entry(99))).toBe(false)
    expect(store().entries).toHaveLength(TREND_COLORS.length)
  })

  it("starts over with a register of another client's log", () => {
    store().add(entry(0))
    store().add(entry(1))
    store().add(entry(5, 'client-b'))

    expect(store().entries.map(({ uuid, address, color }) => [uuid, address, color])).toEqual([
      ['client-b', 5, TREND_COLORS[0]]
    ])
  })

  it('stays open when the last register is taken out', () => {
    store().add(entry(0))
    store().remove(trendKey(entry(0)))

    expect(store().anchor).toBe(anchor)
    expect(store().entries).toEqual([])
  })

  it('keeps its registers once closed, and opens again as it was left', () => {
    store().add(entry(0))
    store().close()
    expect(store().anchor).toBeNull()

    store().open('client-a')
    expect(store().anchor).toBe(anchor)
    expect(store().entries.map(({ address }) => address)).toEqual([0])
  })

  it("opens empty for another client's log", () => {
    store().add(entry(0))
    store().close()
    store().open('client-b')

    expect(store().entries).toEqual([])
    expect(store().uuid).toBe('client-b')
  })

  it('stays closed with no room to open in, when Monitor is not on screen', () => {
    useTrendPanelZustand.setState({ room: null })
    store().add(entry(0))

    expect(store().anchor).toBeNull()
    expect(store().entries).toHaveLength(1)
  })

  it('opens again when a register it holds is added while closed', () => {
    store().add(entry(0))
    store().close()
    store().add(entry(0))

    expect(store().anchor).toBe(anchor)
  })

  it('follows the log again on a new range, and once closed', () => {
    store().add(entry(0))
    store().setView({ from: 1, to: 2 })
    store().setRange('1h')
    expect(store().view).toBeUndefined()

    store().setView({ from: 1, to: 2 })
    store().close()
    expect(store().view).toBeUndefined()
  })

  describe('paused', () => {
    const now = 50 * 60 * 1000
    const oldest = 30 * 60 * 1000

    it('holds the range it followed the log over, which stays pressed', () => {
      store().setRange('10m')
      store().pause(now, oldest)

      expect(store().view).toEqual({ from: now - 10 * 60 * 1000, to: now, pressed: 'range' })
    })

    it('holds the whole log from its oldest sample, and an empty log over the shortest range', () => {
      store().setRange('log')
      store().pause(now, oldest)
      expect(store().view).toEqual({ from: oldest, to: now, pressed: 'range' })

      store().setView(undefined)
      store().pause(now, undefined)
      expect(store().view).toEqual({ from: now - 10 * 60 * 1000, to: now, pressed: 'range' })
    })

    it('holds a second at least of a log that started less than a second ago', () => {
      store().setRange('log')
      store().pause(now, now - 200)

      expect(store().view).toEqual({ from: now - 1000, to: now, pressed: 'range' })
    })

    it('holds a trend following the log over its own length at that length, no range pressed', () => {
      store().setRange('1h')
      store().setView({ length: 90_000 })
      store().pause(now, oldest)

      expect(store().view).toEqual({ from: now - 90_000, to: now })
    })

    it('leaves a stretch zoomed to where it is', () => {
      store().setView({ from: 1000, to: 2000 })
      store().pause(now, oldest)

      expect(store().view).toEqual({ from: 1000, to: 2000 })
    })
  })

  it('follows the log again once its last register is taken out', () => {
    store().add(entry(0))
    store().setView({ from: 1, to: 2 })
    store().remove(trendKey(entry(0)))

    expect(store().view).toBeUndefined()
  })

  it('toggles a register in and out, with a free colour, and refuses one past the colours', () => {
    store().open('client-a')
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
    store().add(entry(0))
    store().add(entry(1))
    store().setColor(trendKey(entry(0)), TREND_COLORS[1])

    expect(colors()).toEqual([TREND_COLORS[1], TREND_COLORS[0]])
  })

  it('gives a free colour without taking one from another register', () => {
    store().add(entry(0))
    store().add(entry(1))
    store().setColor(trendKey(entry(0)), TREND_COLORS[5])

    expect(colors()).toEqual([TREND_COLORS[5], TREND_COLORS[1]])
  })

  it("holds each engineering unit's axis at its own range, and fits it again on Auto", () => {
    store().setAxisRange('A', { min: 0, max: 10 })
    store().setAxisRange('kW', { min: 1, max: 2 })
    expect(store().settings.axes).toEqual({ A: { min: 0, max: 10 }, kW: { min: 1, max: 2 } })

    store().setAxisRange('A', undefined)
    expect(store().settings.axes).toEqual({ kW: { min: 1, max: 2 } })
    store().setAxisRange('kW', undefined)
    expect(store().settings).not.toHaveProperty('axes')
  })

  it('takes out, when pruned, a register that no longer logs', () => {
    const unit = newClientUnit('unit-1', 1)
    unit.registerMapping.holding_registers = {
      0: { dataType: 'uint16', log: { mode: 'poll' } },
      1: { dataType: 'uint16' }
    }
    store().add(entry(0))
    store().add(entry(1))
    store().prune([unit])

    expect(store().entries.map(({ address }) => address)).toEqual([0])
  })

  it('follows the log again once pruned empty', () => {
    store().add(entry(1))
    store().setView({ from: 1, to: 2 })
    store().prune([newClientUnit('unit-1', 1)])

    expect(store().view).toBeUndefined()
  })

  it('saves what it draws, and loads it back under its name', () => {
    store().add(entry(0))
    store().add(entry(1))
    store().setAxisRange('A', { min: 0, max: 10 })
    store().setRange('1h')
    store().setDrawAs('steps')
    const saved = snapshotOf(store(), 'Currents')
    expect(saved).toEqual({
      name: 'Currents',
      entries: [
        { unit: 'unit-1', type: 'holding_registers', address: 0, color: TREND_COLORS[0] },
        { unit: 'unit-1', type: 'holding_registers', address: 1, color: TREND_COLORS[1] }
      ],
      range: '1h',
      settings: { axes: { A: { min: 0, max: 10 } }, time: 'clock', drawAs: 'steps' }
    })

    store().startNew()
    expect(store()).toMatchObject({ name: undefined, entries: [], range: '10m' })

    store().load('client-a', saved)
    expect(store().name).toBe('Currents')
    expect(snapshotOf(store(), 'Currents')).toEqual(saved)
    expect(store().entries[0]?.uuid).toBe('client-a')
  })

  it('saves as it was after an axis is held and set back to Auto', () => {
    store().add(entry(0))
    const before = snapshotOf(store(), 'Currents')
    store().setAxisRange('A', { min: 0, max: 10 })
    store().setAxisRange('A', undefined)

    expect(snapshotOf(store(), 'Currents')).toStrictEqual(before)
  })

  it("holds each engineering unit's plot at its own height, replaced and forgotten", () => {
    store().setPlotHeight('V', 200)
    store().setPlotHeight('', 150)
    store().setPlotHeight('V', 260)
    expect(store().settings.heights).toEqual({ V: 260, '': 150 })

    store().setPlotHeight('V', undefined)
    expect(store().settings.heights).toEqual({ '': 150 })
    store().setPlotHeight('', undefined)
    expect(store().settings).not.toHaveProperty('heights')
  })

  it('saves a held height, and saves as an untouched trend once it is forgotten', () => {
    store().add(entry(0))
    const before = snapshotOf(store(), 'Currents')
    expect(before.settings).not.toHaveProperty('heights')
    store().setPlotHeight('A', 300)
    expect(snapshotOf(store(), 'Currents').settings.heights).toEqual({ A: 300 })
    store().setPlotHeight('A', undefined)

    expect(snapshotOf(store(), 'Currents')).toStrictEqual(before)
  })

  it('hides a register, keeping its colour, and shows it again', () => {
    for (const address of [0, 1]) store().add(entry(address))
    store().toggleHidden(trendKey(entry(1)))
    expect(store().entries.map(({ hidden, color }) => [hidden, color])).toEqual([
      [undefined, TREND_COLORS[0]],
      [true, TREND_COLORS[1]]
    ])

    store().toggleHidden(trendKey(entry(1)))
    expect(store().entries[1]).not.toHaveProperty('hidden')
    store().toggleHidden(trendKey(entry(9)))
    expect(store().entries.map(({ hidden }) => hidden)).toEqual([undefined, undefined])
  })

  it('shows a register alone, and on the one already alone shows them all again', () => {
    for (const address of [0, 1, 2]) store().add(entry(address))
    store().toggleHidden(trendKey(entry(1)))
    const hiddenOf = (): boolean[] => store().entries.map(({ hidden }) => hidden === true)

    store().solo(trendKey(entry(1)))
    expect(hiddenOf()).toEqual([true, false, true])
    store().solo(trendKey(entry(0)))
    expect(hiddenOf()).toEqual([false, true, true])
    store().solo(trendKey(entry(0)))
    expect(hiddenOf()).toEqual([false, false, false])
  })

  it('shows them all again from a register alone because the others were hidden by hand', () => {
    for (const address of [0, 1]) store().add(entry(address))
    store().toggleHidden(trendKey(entry(1)))
    store().solo(trendKey(entry(0)))

    expect(store().entries.map(({ hidden }) => hidden === true)).toEqual([false, false])
  })

  it('shows a hidden register again when it is added, and leaves the others as they are', () => {
    for (const address of [0, 1]) store().add(entry(address))
    store().toggleHidden(trendKey(entry(0)))
    store().toggleHidden(trendKey(entry(1)))
    store().close()
    expect(store().add(entry(1))).toBe(true)

    expect(store().anchor).toBe(anchor)
    expect(store().entries.map(({ hidden }) => hidden === true)).toEqual([true, false])
  })

  it('loads a register saved as hidden: false as shown, and the trend as unchanged', () => {
    store().add(entry(0))
    const saved = snapshotOf(store(), 'Currents')
    const [first] = saved.entries
    if (first === undefined) throw new Error('The trend saved no register')
    store().load('client-a', { ...saved, entries: [{ ...first, hidden: false }] })

    expect(store().entries[0]).not.toHaveProperty('hidden')
    expect(snapshotOf(store(), 'Currents')).toStrictEqual(saved)
  })

  it('is not alone while it is hidden itself, so it shows it alone', () => {
    for (const address of [0, 1]) store().add(entry(address))
    store().toggleHidden(trendKey(entry(0)))
    store().toggleHidden(trendKey(entry(1)))
    store().solo(trendKey(entry(0)))

    expect(store().entries.map(({ hidden }) => hidden === true)).toEqual([false, true])
  })

  it('saves a hidden register as hidden, and a trend hiding nothing as one saved before', () => {
    for (const address of [0, 1]) store().add(entry(address))
    const before = snapshotOf(store(), 'Currents')
    expect(before.entries[0]).not.toHaveProperty('hidden')
    store().toggleHidden(trendKey(entry(1)))
    const saved = snapshotOf(store(), 'Currents')
    expect(saved.entries.map(({ hidden }) => hidden)).toEqual([undefined, true])

    store().startNew()
    store().load('client-a', saved)
    expect(store().entries.map(({ hidden }) => hidden === true)).toEqual([false, true])
    store().toggleHidden(trendKey(entry(1)))
    expect(snapshotOf(store(), 'Currents')).toStrictEqual(before)
  })

  describe('the selection', () => {
    const stretch = { from: 10, to: 20 }
    const selected = (): void => {
      store().add(entry(0))
      store().setSelection(stretch)
    }

    it('keeps a stretch, and lets it go on none', () => {
      selected()
      expect(store().selection).toEqual(stretch)
      store().setSelection(undefined)
      expect(store().selection).toBeUndefined()
    })

    it('stays through a zoom, a pan, a pause and a follow', () => {
      selected()
      store().setView({ from: 0, to: 30 })
      store().setView({ length: 5000 })
      store().setView({ from: 0, to: 30, pressed: 'range' })
      store().pause(1_000_000, 0)
      expect(store().selection).toEqual(stretch)
    })

    it.each([
      ['a range', (): void => store().setRange('1h')],
      ['Live', (): void => store().followRange()],
      [
        "the calendar's stretch",
        (): void => store().setView({ from: 0, to: 9, pressed: 'calendar' })
      ],
      ['a saved trend', (): void => store().load('client-a', snapshotOf(store(), 'Saved'))],
      ['New trend', (): void => store().startNew()],
      ['closing', (): void => store().close()],
      ["another client's register", (): void => void store().add(entry(0, 'client-b'))],
      ["another client's trend", (): void => store().open('client-b')]
    ])('goes on %s', (_name, action) => {
      selected()
      action()
      expect(store().selection).toBeUndefined()
    })

    it('stays when a zoom reaches the end of the log and follows it', () => {
      selected()
      store().setView(undefined)
      expect(store().selection).toEqual(stretch)
    })

    it("stays when the trend opens on its own client's register", () => {
      selected()
      store().add(entry(1))
      store().open('client-a')
      expect(store().selection).toEqual(stretch)
    })
  })

  describe('the history', () => {
    const first = { from: 0, to: 100 }
    const second = { from: 20, to: 60 }

    it('puts the view it leaves on the list, one step for a run closer together than the gap', () => {
      store().setView(first)
      store().pushHistory(1000)
      store().setView(second)
      store().pushHistory(1000 + HISTORY_GAP_MS - 1)
      store().setView({ from: 30, to: 50 })

      expect(store().history.map(({ view }) => view)).toEqual([first])
    })

    it('takes a step for each zoom further apart than the gap, and goes back one at a time', () => {
      store().setView(first)
      store().pushHistory(1000)
      store().setView(second)
      store().pushHistory(1000 + HISTORY_GAP_MS)
      store().setView({ from: 30, to: 50 })

      store().back()
      expect(store().view).toEqual(second)
      store().back()
      expect(store().view).toEqual(first)
      expect(store().history).toEqual([])
    })

    it('measures the gap from the last zoom of a run, not its first', () => {
      store().pushHistory(1000)
      store().pushHistory(1400)
      store().pushHistory(1800)
      expect(store().history).toHaveLength(1)
    })

    it('takes the axes back with the view', () => {
      store().setAxisZoom('V', { min: 1, max: 2 })
      store().pushHistory(1000)
      store().setAxisZoom('V', { min: 5, max: 6 })
      store().back()
      expect(store().axisZoom).toEqual({ V: { min: 1, max: 2 } })
    })

    it('does nothing back on an empty list', () => {
      store().setView(first)
      store().back()
      expect(store().view).toEqual(first)
    })

    it('takes a new step after going back, however soon', () => {
      store().pushHistory(1000)
      store().pushHistory(1000 + HISTORY_GAP_MS)
      store().back()
      store().pushHistory(1001 + HISTORY_GAP_MS)
      expect(store().history).toHaveLength(2)
    })

    it('takes a new step after it was emptied, however soon', () => {
      store().pushHistory(1000)
      store().followRange()
      store().pushHistory(1001)
      expect(store().history).toHaveLength(1)
    })

    it.each([
      ['a range', (): void => store().setRange('1h')],
      ['Live', (): void => store().followRange()],
      [
        "the calendar's stretch",
        (): void => store().setView({ from: 0, to: 9, pressed: 'calendar' })
      ],
      ['a saved trend', (): void => store().load('client-a', snapshotOf(store(), 'Saved'))],
      ['New trend', (): void => store().startNew()],
      ['closing', (): void => store().close()]
    ])('empties with the axes zoomed on %s', (_name, action) => {
      store().add(entry(0))
      store().setAxisZoom('V', { min: 1, max: 2 })
      store().pushHistory(1000)
      action()
      expect(store().history).toEqual([])
      expect(store().axisZoom).toEqual({})
    })
  })

  it('holds an axis zoomed per unit, and hands it back with none', () => {
    store().setAxisZoom('V', { min: 1, max: 2 })
    store().setAxisZoom('A', { min: 3, max: 4 })
    store().setAxisZoom('V', undefined)
    expect(store().axisZoom).toEqual({ A: { min: 3, max: 4 } })
  })

  it("forgets the name when it starts over with another client's register", () => {
    store().add(entry(0))
    store().setName('Currents')
    store().add(entry(0, 'client-b'))

    expect(store().name).toBeUndefined()
  })

  it('keeps where it is drawn when it closes', () => {
    store().add(entry(0))
    store().setMode('fill')
    store().close()
    store().open('client-a')

    expect(store().mode).toBe('fill')
  })

  it('keeps a bitmap opened into its bits from place to place, and closes it again', () => {
    store().add(entry(6))
    store().add(entry(7))
    store().toggleLane(trendKey(entry(6)))
    store().toggleLane(trendKey(entry(7)))
    store().setMode('dock')
    store().setMode('fill')

    expect(store().openLanes).toEqual([trendKey(entry(6)), trendKey(entry(7))])

    store().toggleLane(trendKey(entry(6)))

    expect(store().openLanes).toEqual([trendKey(entry(7))])
  })

  it('draws a bitmap taken out and added again closed, and keeps the others open', () => {
    store().add(entry(6))
    store().add(entry(7))
    store().toggleLane(trendKey(entry(6)))
    store().toggleLane(trendKey(entry(7)))
    store().remove(trendKey(entry(6)))
    store().add(entry(6))

    expect(store().openLanes).toEqual([trendKey(entry(7))])
  })

  it('draws a bitmap the units no longer log closed when it logs again', () => {
    store().add(entry(6))
    store().toggleLane(trendKey(entry(6)))
    store().prune([])
    store().add(entry(6))

    expect(store().openLanes).toEqual([])
  })

  it('opens the bitmaps of a loaded trend closed, and keeps those it still draws open', () => {
    store().add(entry(6))
    store().add(entry(7))
    store().toggleLane(trendKey(entry(6)))
    store().toggleLane(trendKey(entry(7)))
    store().load('client-a', snapshotOf({ ...store(), entries: [] }, 'Empty'))
    store().add(entry(6))
    expect(store().openLanes).toEqual([])

    store().toggleLane(trendKey(entry(6)))
    store().load('client-a', snapshotOf(store(), 'Six'))
    expect(store().openLanes).toEqual([trendKey(entry(6))])

    store().startNew()
    expect(store().openLanes).toEqual([])
  })

  it('draws a bitmap of another client closed', () => {
    store().add(entry(6))
    store().toggleLane(trendKey(entry(6)))
    store().add(entry(6, 'client-b'))
    store().add(entry(6))

    expect(store().openLanes).toEqual([])
  })

  it('opens for another client with every bitmap closed, and as it was for its own', () => {
    store().add(entry(6))
    store().toggleLane(trendKey(entry(6)))
    store().open('client-a')
    expect(store().openLanes).toEqual([trendKey(entry(6))])

    store().open('client-b')
    expect(store().openLanes).toEqual([])
  })

  it('opens again with every bitmap closed', () => {
    store().add(entry(6))
    store().toggleLane(trendKey(entry(6)))
    store().close()
    store().open('client-a')

    expect(store().openLanes).toEqual([])
  })
})
