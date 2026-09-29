import variant from '@jitl/quickjs-singlefile-mjs-release-sync'
import {
  newQuickJSWASMModuleFromVariant,
  QuickJSContext,
  QuickJSHandle,
  shouldInterruptAfterDeadline
} from 'quickjs-emscripten-core'
import { useScriptEngineZustand } from './scriptEngine.zustand'
import { returnsEverywhere } from './returnsEverywhere'
import { SCRIPT_HELPERS } from './helpers'

/**
 * A conversion script runs in QuickJS, an engine of its own: it sees `raw`
 * and the JavaScript built-ins, and nothing of Modbux, the files or the
 * network. A call gets a few milliseconds and the engine a few megabytes, so
 * a loop that never ends or grows without bound is cut off rather than
 * holding the window.
 */
const CALL_MILLIS = 20
const MEMORY_BYTES = 8 * 1024 * 1024

let context: QuickJSContext | undefined

/**
 * The compiled function of each script, by its code, the most recent last.
 * Typing a script compiles every text it passes through, so the oldest go
 * once there are more than the grid and an open dialog use.
 */
const compiled = new Map<string, QuickJSHandle>()
const COMPILED_KEPT = 64

/**
 * Load the engine; every other call here answers nothing until it has. One
 * that fails to load leaves every script showing nothing, and says so.
 */
export const initScriptEngine = async (): Promise<void> => {
  if (context) return
  try {
    const quickJs = await newQuickJSWASMModuleFromVariant(variant)
    const runtime = quickJs.newRuntime()
    runtime.setMemoryLimit(MEMORY_BYTES)
    const vm = runtime.newContext()
    // The helpers every script can call, defined once as globals.
    vm.unwrapResult(vm.evalCode(SCRIPT_HELPERS.map(({ source }) => source).join('\n'))).dispose()
    context = vm
    useScriptEngineZustand.setState({ ready: true })
  } catch (error) {
    console.error('Conversion scripts unavailable', error)
  }
}

/** What a script that does not compile or run says, with the line it names. */
export interface ScriptError {
  message: string
  line?: number
}

/** The script as the body of a function of `raw`. */
const wrap = (code: string): string => `(function (raw) {\n${code}\n})`

/** The line of the script an error names, counted from the script's first line. */
const lineOf = (error: unknown): number | undefined => {
  const stack =
    typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stack') ?? '') : ''
  const match = /:(\d+)(?::\d+)?\)?\s*$/m.exec(stack)
  // The wrapper puts one line in front of the script.
  return match ? Number(match[1]) - 1 : undefined
}

const errorOf = (vm: QuickJSContext, handle: QuickJSHandle): ScriptError => {
  const error: unknown = vm.dump(handle)
  handle.dispose()
  const message =
    typeof error === 'object' && error !== null
      ? String(Reflect.get(error, 'message') ?? error)
      : String(error)
  return { message, line: lineOf(error) }
}

/** Compile the script, or answer why it does not. */
const compile = (vm: QuickJSContext, code: string): QuickJSHandle | ScriptError => {
  const cached = compiled.get(code)
  if (cached) {
    // Used again, so it moves to the recent end.
    compiled.delete(code)
    compiled.set(code, cached)
    return cached
  }
  const result = vm.evalCode(wrap(code))
  if (result.error) {
    // An unclosed bracket is found at the wrapper's closing line, after the
    // script: it belongs to the script's last line.
    const error = errorOf(vm, result.error)
    const last = code.split('\n').length
    return error.line === undefined ? error : { ...error, line: Math.min(error.line, last) }
  }
  compiled.set(code, result.value)
  for (const [old, handle] of compiled) {
    if (compiled.size <= COMPILED_KEPT) break
    compiled.delete(old)
    handle.dispose()
  }
  return result.value
}

const isError = (value: QuickJSHandle | ScriptError): value is ScriptError => 'message' in value

/**
 * Why the script cannot be saved: it does not compile, or a path through it
 * ends without returning a value, which is named at its last line. Undefined
 * when it can.
 */
export const scriptError = (code: string): ScriptError | undefined => {
  if (!context) return undefined
  const handle = compile(context, code)
  if (isError(handle)) return handle
  if (returnsEverywhere(code)) return undefined
  return { message: 'Not every path returns a value', line: code.split('\n').length }
}

/**
 * The number the script returns for `raw`, or its error. A return that is
 * not a finite number is an error too, because the grid shows numbers.
 */
export const runScript = (code: string, raw: number): number | ScriptError | undefined => {
  const vm = context
  if (!vm) return undefined
  const fn = compile(vm, code)
  if (isError(fn)) return fn
  vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + CALL_MILLIS))
  const argument = vm.newNumber(raw)
  const result = vm.callFunction(fn, vm.undefined, argument)
  argument.dispose()
  vm.runtime.removeInterruptHandler()
  if (result.error) return errorOf(vm, result.error)
  const value: unknown = vm.dump(result.value)
  result.value.dispose()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return { message: `The script returned ${String(value)}, not a number` }
}
