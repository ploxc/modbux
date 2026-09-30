import {
  DEFAULT_LOG_CAPACITY,
  inSteps,
  LogPage,
  LogPoint,
  LogRun,
  LogSample,
  LogSeries,
  LogSetting,
  LogStatus,
  LogStopReason,
  LogWindow,
  LogWindowQuery
} from '@shared'

/** One series of the log, and how many samples of it the log holds. */
interface SeriesEntry {
  series: LogSeries
  held: number
}

/** What a sample shares with every other sample of its series and status. */
interface SampleMeta {
  entry: SeriesEntry
  error: string | undefined
}

/** A sample's time and value, two doubles. */
const SAMPLE_BYTES = 16

/** The slots the log starts with, doubling from there until it reaches its capacity. */
const INITIAL_SLOTS = 1024

/** What a register last kept, which its next on-change read is measured against. */
interface Kept {
  value: number
  error: string | undefined
}

/**
 * The samples one client took while it logged, in memory, the oldest
 * overwritten once `capacity` is reached.
 *
 * A sample's time and value sit in one buffer, and its series and error in a
 * `SampleMeta` shared by every sample that has the same, so a sample costs its
 * 16 bytes and one reference. A timeout is a sample with an error, rather than
 * a missing one.
 */
export class SessionLog {
  private _capacity: number
  private _buffer: ArrayBuffer
  private _view: DataView
  /** Each slot's meta, in the same ring as the buffer. */
  private _meta: SampleMeta[] = []

  /** The slot the next sample goes in. */
  private _head = 0
  private _count = 0
  /**
   * How many samples went in since the log was last cleared. A sample's
   * sequence is its place in that count, so it names the same sample while
   * older ones are overwritten.
   */
  private _pushed = 0
  private _overwritten = 0

  private _metaByKey = new Map<string, SampleMeta>()
  private _seriesByKey = new Map<string, SeriesEntry>()
  /** What each series kept last in this run, whichever mode kept it. */
  private _kept = new Map<LogSeries, Kept>()

  private _runs: LogRun[] = []
  private _onOverwriteStart: () => void

  constructor(onOverwriteStart: () => void, capacity = DEFAULT_LOG_CAPACITY) {
    this._onOverwriteStart = onOverwriteStart
    this._capacity = capacity
    this._buffer = new ArrayBuffer(0, { maxByteLength: capacity * SAMPLE_BYTES })
    this._view = new DataView(this._buffer)
  }

  /**
   * The samples the log holds, oldest first, after the first `skip` of them.
   * A method rather than an arrow, because a generator has no arrow form.
   */
  *samples(skip = 0): Generator<LogSample> {
    const tail = this._tail()
    const segments: [number, number][] =
      tail > 0
        ? [
            [tail, this._slots()],
            [0, this._head]
          ]
        : [[0, this._count]]
    let toSkip = skip
    for (const [from, to] of segments) {
      const start = Math.min(to, from + toSkip)
      toSkip -= start - from
      for (const [offset, { entry, error }] of this._meta.slice(start, to).entries()) {
        const byte = (start + offset) * SAMPLE_BYTES
        yield {
          ...entry.series,
          error,
          time: this._view.getFloat64(byte),
          value: this._view.getFloat64(byte + 8)
        }
      }
    }
  }

  /**
   * Up to `limit` of the samples `accept` takes, from the sample with sequence
   * `after` on, and the sequence to ask from next; none once the log is read
   * to its end. A sequence overwritten since starts at the oldest.
   */
  page = (after: number, accept: (sample: LogSample) => boolean, limit: number): LogPage => {
    const oldest = this._pushed - this._count
    let sequence = Math.max(after, oldest)
    const samples: LogSample[] = []
    for (const sample of this.samples(sequence - oldest)) {
      sequence++
      if (accept(sample)) samples.push(sample)
      if (samples.length === limit) return { samples, next: sequence }
    }
    return { samples, next: undefined }
  }

  /**
   * The samples of `series` from `from` up to `to` and from the sequence
   * `after` on, and the sequence to go on from: after the last sample the
   * log holds, or the first one past `to`. The log holds its samples in time
   * order, so the first is found by halving rather than by reading the
   * samples before it. A window of 10 minutes of one of 12
   * registers at the end of a full log of a million took 0.44 to 0.80 ms this
   * way, and 215 to 257 ms through `page`.
   *
   * With a `step`, the window comes back `inSteps`: each stretch of `step`
   * milliseconds as its lowest and highest value, its first failed read and
   * its newest sample. The whole of a full log of a million samples of 12
   * registers took 33 to 45 ms a register in 1,500 steps and answered 3,255
   * points rather than 83,333. A stepped window continued from its `end`
   * answers the stretch it ended in again, with only the samples since.
   */
  window = (
    series: LogSeries,
    { from, to = Number.POSITIVE_INFINITY, after, step }: LogWindowQuery
  ): LogWindow => {
    const end = this._pushed
    const wanted = this._seriesByKey.get(`${series.unit}|${series.type}|${series.address}`)
    if (wanted === undefined) return { points: [], end }
    const oldest = this._pushed - this._count
    const slots = this._slots()
    const tail = this._tail()
    const slotOf = (index: number): number => (tail + index) % slots
    const timeAt = (index: number): number => this._view.getFloat64(slotOf(index) * SAMPLE_BYTES)

    let low = Math.max(0, after - oldest)
    let high = this._count
    while (low < high) {
      const middle = (low + high) >>> 1
      if (timeAt(middle) < from) low = middle + 1
      else high = middle
    }

    const points: LogPoint[] = []
    const answer = (): LogPoint[] => (step === undefined ? points : inSteps(points, step))
    for (let index = low; index < this._count; index++) {
      const slot = slotOf(index)
      const byte = slot * SAMPLE_BYTES
      const time = this._view.getFloat64(byte)
      // Every series shares the ring's time order, so the first sample past
      // `to` of any series ends the window.
      if (time > to) return { points: answer(), end: oldest + index }
      const meta = this._meta[slot]
      if (meta?.entry !== wanted) continue
      points.push({ time, value: this._view.getFloat64(byte + 8), error: meta.error })
    }
    return { points: answer(), end }
  }

  /** The series the log holds a sample of, in the order the log first met each. */
  series = (): LogSeries[] =>
    [...this._seriesByKey.values()].filter(({ held }) => held > 0).map(({ series }) => series)

  get running(): boolean {
    const last = this._runs.at(-1)
    return last !== undefined && last.end === undefined
  }

  /** Start taking samples, after what the log holds. A log already running goes on. */
  start = (time: number): void => {
    if (this.running) return
    this._kept.clear()
    this._runs.push({ start: time })
  }

  /**
   * Hold `capacity` samples from here on. A smaller log keeps the newest of
   * what it holds, counts the rest as overwritten, and says so when it had
   * overwritten nothing before.
   */
  setCapacity = (capacity: number): void => {
    if (capacity === this._capacity) return
    const held = [...this.samples()]
    const pushed = this._pushed
    const kept = held.slice(Math.max(0, held.length - capacity))
    this._capacity = capacity
    this._buffer = new ArrayBuffer(0, { maxByteLength: capacity * SAMPLE_BYTES })
    this._view = new DataView(this._buffer)
    this._head = 0
    this._count = 0
    this._meta = []
    this._releaseAll()
    for (const { time, value, error, ...series } of kept) {
      this._push(time, value, this._metaOf(series, error))
    }
    const dropped = held.length - kept.length
    if (dropped > 0 && this._overwritten === 0) this._onOverwriteStart()
    this._overwritten += dropped
    this._pushed = pushed
  }

  /** Empty the log, and stop it if it runs. */
  clear = (): void => {
    this._head = 0
    this._count = 0
    this._pushed = 0
    this._overwritten = 0
    this._meta = []
    this._releaseAll()
    this._runs = []
  }

  /** Stop taking samples, and keep why for the gap that follows. */
  stop = (time: number, reason: LogStopReason): void => {
    const run = this._runs.at(-1)
    if (!run || run.end !== undefined) return
    run.end = time
    run.reason = reason
  }

  /**
   * Take one read of a register, as `setting` says: every read in poll mode.
   * In change mode the first read of a run, a read whose error differs from
   * the last one kept, and a value that moved past the deadband.
   */
  record = (
    series: LogSeries,
    setting: LogSetting,
    time: number,
    value: number,
    error: string | undefined
  ): void => {
    if (!this.running) return
    const meta = this._metaOf(series, error)
    if (setting.mode === 'change') {
      const kept = this._kept.get(meta.entry.series)
      const same =
        kept !== undefined &&
        kept.error === error &&
        (error !== undefined || Math.abs(value - kept.value) <= setting.deadband)
      if (same) return
    }
    this._kept.set(meta.entry.series, { value, error })
    this._push(time, value, meta)
  }

  status = (): Omit<LogStatus, 'enabled'> => ({
    running: this.running,
    samples: this._count,
    capacity: this._capacity,
    overwritten: this._overwritten,
    oldest: this._count === 0 ? undefined : this._view.getFloat64(this._tail() * SAMPLE_BYTES),
    runs: this._runs.map((run) => ({ ...run }))
  })

  private _slots = (): number => this._buffer.byteLength / SAMPLE_BYTES

  /** The slot of the oldest sample: the next one to be overwritten once the log is full. */
  private _tail = (): number => (this._count < this._slots() ? 0 : this._head)

  private _metaOf = (series: LogSeries, error: string | undefined): SampleMeta => {
    const seriesKey = `${series.unit}|${series.type}|${series.address}`
    const key = `${seriesKey}|${error ?? ''}`
    const known = this._metaByKey.get(key)
    if (known) return known
    const meta = { entry: this._entryOf(seriesKey, series), error }
    this._metaByKey.set(key, meta)
    return meta
  }

  /**
   * One entry per series, which every status of it shares; its series is the
   * one object `_kept` is keyed by.
   */
  private _entryOf = (key: string, series: LogSeries): SeriesEntry => {
    const known = this._seriesByKey.get(key)
    if (known) return known
    const own = {
      series: { unit: series.unit, type: series.type, address: series.address },
      held: 0
    }
    this._seriesByKey.set(key, own)
    return own
  }

  private _releaseAll = (): void => {
    for (const entry of this._seriesByKey.values()) entry.held = 0
  }

  private _push = (time: number, value: number, meta: SampleMeta): void => {
    if (this._count === this._slots() && this._slots() < this._capacity) {
      // Only a log that has not wrapped grows, so its samples run from slot 0.
      this._buffer.resize(
        Math.min(this._capacity, Math.max(INITIAL_SLOTS, this._slots() * 2)) * SAMPLE_BYTES
      )
      this._head = this._count
    }
    const slot = this._head
    // A slot holds a sample only once the log has wrapped onto it.
    const overwritten = this._meta[slot]
    if (overwritten) overwritten.entry.held--
    meta.entry.held++
    this._view.setFloat64(slot * SAMPLE_BYTES, time)
    this._view.setFloat64(slot * SAMPLE_BYTES + 8, value)
    this._meta[slot] = meta
    this._pushed++
    this._head = (slot + 1) % this._slots()
    if (this._count < this._slots()) {
      this._count++
      return
    }
    if (this._overwritten === 0) this._onOverwriteStart()
    this._overwritten++
  }
}
