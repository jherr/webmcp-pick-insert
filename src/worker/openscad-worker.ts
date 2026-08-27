/// <reference lib="webworker" />

/**
 * OpenSCAD WASM worker — runs the official playground Manifold build
 * (`src/vendor/openscad/`) off the main thread and exposes a tiny
 * request/response protocol (see `./protocol.ts`).
 *
 * Lifecycle:
 *   1. First `render` request lazily boots the WASM factory.
 *   2. The source is written to `/input.scad`, optional sibling includes
 *      are written next to it so `include <pick_profiles.scad>` resolves,
 *      parameter overrides become `-D Name=Value` flags, and `callMain`
 *      runs OpenSCAD CLI with `--backend=manifold` and `-o /output.{stl|off|svg}`.
 *   3. The output bytes are read back and `postMessage`d as a
 *      transferable `Uint8Array` (zero-copy hand-off to the main thread).
 *
 * `callMain` is single-shot in this WASM build, so the main-thread
 * client (`worker-client.ts`) terminates this worker after every render.
 * That's why the boot promises are nulled out on rejection — a fresh
 * worker should never inherit a poisoned cache.
 *
 * Assets are imported with `?url` (not `public/`) because Nitro/Vite's
 * public static serving corrupts files larger than 64KB.
 */
import type { WorkerRequest, WorkerResponse } from './protocol'
import openscadJsUrl from '../vendor/openscad/openscad.js?url'
import openscadWasmUrl from '../vendor/openscad/openscad.wasm?url'

const ctx: DedicatedWorkerGlobalScope = self as never

/** Minimal surface of the official OpenSCAD playground Emscripten module. */
type OpenSCADModule = {
  callMain(args: string[]): number
  FS: {
    writeFile(path: string, data: string | ArrayBufferView): void
    readFile(path: string, opts?: { encoding: 'utf8' | 'binary' }): string | Uint8Array
    unlink(path: string): void
  }
}

type OpenSCADFactory = (opts: {
  noInitialRun?: boolean
  print?: (text: string) => void
  printErr?: (text: string) => void
  locateFile?: (path: string, prefix: string) => string
}) => Promise<OpenSCADModule>

let openscadPromise: Promise<OpenSCADModule> | null = null
const stderrBuffer: string[] = []

function clearStderr() {
  stderrBuffer.length = 0
}

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer)
}

async function loadOpenSCADFactory(): Promise<OpenSCADFactory> {
  const mod = await import(/* @vite-ignore */ openscadJsUrl)
  const factory = (mod as { default?: OpenSCADFactory }).default
  if (typeof factory !== 'function') {
    throw new Error('OpenSCAD WASM module did not export a default factory')
  }
  return factory
}

async function getOpenSCAD(): Promise<OpenSCADModule> {
  if (!openscadPromise) {
    const p = (async () => {
      const OpenSCAD = await loadOpenSCADFactory()
      return OpenSCAD({
        noInitialRun: true,
        locateFile: (path) => {
          if (path.endsWith('.wasm')) return openscadWasmUrl
          return path
        },
        print: (text) => {
          stderrBuffer.push(text)
        },
        printErr: (text) => {
          stderrBuffer.push(text)
        },
      })
    })()
    // Don't cache a permanently-rejected promise — let the next caller retry.
    p.catch(() => {
      if (openscadPromise === p) openscadPromise = null
    })
    openscadPromise = p
  }
  return openscadPromise
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatParamValue(v)).join(',')}]`
  }
  return JSON.stringify(value)
}

/**
 * Translate the override map into OpenSCAD CLI flags. The defaults stay
 * baked into the source file; we only override values that diverge.
 */
function buildDFlags(params: Record<string, unknown>): string[] {
  const flags: string[] = []
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    flags.push('-D', `${name}=${formatParamValue(value)}`)
  }
  return flags
}

async function handleRender(req: Extract<WorkerRequest, { type: 'render' }>) {
  const start = performance.now()
  clearStderr()

  let openscad: OpenSCADModule
  try {
    openscad = await getOpenSCAD()
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: e instanceof Error ? e.message : String(e),
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  const fs = openscad.FS
  const inputPath = '/input.scad'
  const ext = req.format === 'stl' ? 'stl' : req.format === 'off' ? 'off' : 'svg'
  const outputPath = `/output.${ext}`

  try {
    fs.writeFile(inputPath, req.source)
    if (req.includes) {
      for (const [name, text] of Object.entries(req.includes)) {
        // Write next to /input.scad so `include <name>` resolves.
        fs.writeFile(`/${name}`, text)
      }
    }
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: `Failed to write source: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  // Best-effort: clear previous output
  try {
    fs.unlink(outputPath)
  } catch {
    // ignore
  }

  post({ id: req.id, type: 'render-progress', phase: 'compile' })

  // Manifold is required for hull()-based pick-outline slot cutters;
  // CGAL Nef aborts those hulls and exports an uncut shell.
  // Match openscad-playground: backend + explicit binary STL when exporting STL.
  const args = [
    inputPath,
    '-o',
    outputPath,
    '--backend=manifold',
    ...(ext === 'stl' ? ['--export-format=binstl'] : []),
    ...buildDFlags(req.params),
  ]

  let exitCode: number
  try {
    exitCode = openscad.callMain(args)
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: e instanceof Error ? e.message : String(e),
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  if (exitCode !== 0) {
    post({
      id: req.id,
      type: 'render-error',
      message: `OpenSCAD exited with code ${exitCode}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  post({ id: req.id, type: 'render-progress', phase: 'export' })

  let bytes: Uint8Array
  try {
    const data = fs.readFile(outputPath, { encoding: 'binary' })
    bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBufferLike)
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: `Failed to read output: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  const renderMs = performance.now() - start
  const transferable = bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : []

  post(
    {
      id: req.id,
      type: 'render-result',
      bytes,
      renderMs,
      stderr: stderrBuffer.join('\n'),
    },
    transferable,
  )
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  if (msg.type === 'render') {
    void handleRender(msg)
  } else if (msg.type === 'ping') {
    post({ id: msg.id, type: 'pong' })
  } else if (msg.type === 'parse' || msg.type === 'cancel') {
    // Cancel is handled by terminating the worker from the main thread.
    // Parse is currently a main-thread concern.
  }
}

post({ id: 'boot', type: 'ready' })
