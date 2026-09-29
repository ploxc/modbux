import {
  DEFAULT_LOG_CAPACITY,
  LogRun,
  LogSetting,
  LogStatus,
  LogStopReason,
  RegisterType
} from '@shared'

/** Where a sample came from: one register of one unit. */
export interface LogSeries {
  unit: string
  type: RegisterType
  address: number
}

/** One sample as the log hands it back. `error` is set on a read that failed. */
export interface LogSample extends LogSeries {
  time: number
  value: number
  error: string | undefined
}

/** What a sample shares with every other sample of its series and status. */
interface SampleMeta {
  series: LogSeries
  error: string | undefined
}

/** A sample's time and value, two doubles. */
const SAMPLE_BYTES = 16

/** The slots the log starts with, doubling from there until it reaches its capacity. */
const INITIAL_SLOTS = 1024

/** What an on-change register last kept, which the next read is measured against. */
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
  private _overwritten = 0

  private _metaByKey = new Map<string, SampleMeta>()
  private _seriesByKey = new Map<string, LogSeries>()
  /** What each on-change series kept last in this run. */
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
   * Every sample the log holds, oldest first. A method rather than an arrow,
   * because a generator has no arrow form.
   */
  *samples(): Generator<LogSample> {
    const tail = this._tail()
    const wrapped = tail > 0
    const segments: [number, number][] = wrapped
      ? [
          [tail, this._slots()],
          [0, this._head]
        ]
      : [[0, this._count]]
    for (const [from, to] of segments) {
      for (const [offset, { series, error }] of this._meta.slice(from, to).entries()) {
        const byte = (from + offset) * SAMPLE_BYTES
        yield {
          ...series,
          error,
          time: this._view.getFloat64(byte),
          value: this._view.getFloat64(byte + 8)
        }
      }
    }
  }

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

  /** Empty the log, and stop it if it runs. */
  clear = (): void => {
    this._head = 0
    this._count = 0
    this._overwritten = 0
    this._meta = []
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
      const kept = this._kept.get(meta.series)
      const same =
        kept !== undefined &&
        kept.error === error &&
        (error !== undefined || Math.abs(value - kept.value) <= setting.deadband)
      if (same) return
      this._kept.set(meta.series, { value, error })
    }
    this._push(time, value, meta)
  }

  status = (): LogStatus => ({
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
    const meta = { series: this._seriesOf(seriesKey, series), error }
    this._metaByKey.set(key, meta)
    return meta
  }

  /** One object per series, which every status of it shares and `_kept` is keyed by. */
  private _seriesOf = (key: string, series: LogSeries): LogSeries => {
    const known = this._seriesByKey.get(key)
    if (known) return known
    const own = { unit: series.unit, type: series.type, address: series.address }
    this._seriesByKey.set(key, own)
    return own
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
    this._view.setFloat64(slot * SAMPLE_BYTES, time)
    this._view.setFloat64(slot * SAMPLE_BYTES + 8, value)
    this._meta[slot] = meta
    this._head = (slot + 1) % this._slots()
    if (this._count < this._slots()) {
      this._count++
      return
    }
    if (this._overwritten === 0) this._onOverwriteStart()
    this._overwritten++
  }
}
