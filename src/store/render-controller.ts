/**
 * Render controller — auto-renders the insert whenever the slots change.
 *
 * Design:
 *   - Subscribe to the store and compute a stable signature over the slots.
 *     Skip work when identical.
 *   - Debounce by 300ms so dragging a thickness slider collapses to one render.
 *   - Track a monotonic `requestId`; if a newer render starts before the
 *     previous one resolves, the older result is recognised as stale and
 *     dropped.
 *   - `renderNow()` skips the debounce — used by MCP.
 *
 * Every render is three passes, one per colored part: the tray, the comb, and
 * the picks. The model can only draw one of them at a time — `part` picks a
 * half of the insert, `preview_picks` swaps the insert for the picks — and
 * separate meshes are what the viewer needs to give each its own color.
 * Tray and comb share coincident faces and no volume, so on screen they read
 * as the one-piece insert, which is what the two-color print actually is.
 *
 * Neither the printable single-mesh STL nor the 3MF comes out of those passes:
 * `renderInsertStl()` and `renderThreeMf()` are their own renders, on demand,
 * because an export wants geometry the viewer has no use for.
 */
import {
  designActions,
  designStore,
  type DesignState,
  type Slot,
} from './design-store'
import { MODEL_INCLUDES, MODEL_MAIN } from '@/model/model-source'
import { applyDesignToSource, type ModelPart } from '@/model/apply-design'
import type { PartColors } from '@/model/colors'
import {
  friendlyRenderError,
  parseFitReport,
} from '@/model/fit-report'
import { meshVolume, parseOff } from '@/model/off-mesh'
import { buildThreeMf, type ThreeMfPart } from '@/model/three-mf'
import { getOpenScadClient } from '@/worker/worker-client'
import type { RenderOutcome } from '@/worker/worker-client'

const DEBOUNCE_MS = 300

let renderSeq = 0
let stopFn: (() => void) | null = null
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let lastSig: string | null = null

function designSignature(state: DesignState): string {
  return JSON.stringify(state.slots)
}

export type RenderOutcomeSummary =
  | {
      ok: true
      requestId: string
      renderMs: number
      byteLength: number
      stderr: string
    }
  | {
      ok: false
      requestId: string
      message: string
      stderr: string
    }
  | { ok: false; requestId: string; message: 'superseded'; stderr: '' }

function renderPass(
  slots: Slot[],
  options: { previewPicks?: boolean; part?: ModelPart } = {},
): Promise<RenderOutcome> {
  const source = applyDesignToSource(MODEL_MAIN, {
    slots,
    previewPicks: options.previewPicks ?? false,
    part: options.part,
  })
  return getOpenScadClient().render({
    source,
    includes: MODEL_INCLUDES,
    params: {},
  })
}

export type InsertStlOutcome =
  | { ok: true; bytes: Uint8Array; renderMs: number }
  | { ok: false; message: string }

/**
 * Render the one-piece insert: tray and comb unioned into a single solid.
 *
 * The viewer never wants this — it holds the two halves apart so it can color
 * them — but a plain STL has no way to say "two parts", so the printable file
 * has to be the union. Nothing is stored; the caller downloads it and it goes.
 */
export async function renderInsertStl(
  slots: Slot[] = designStore.state.slots,
): Promise<InsertStlOutcome> {
  const outcome = await renderPass(slots, { part: 'all' })
  if (!outcome.ok) {
    return {
      ok: false,
      message: outcome.aborted
        ? 'superseded'
        : friendlyRenderError(outcome.message, outcome.stderr),
    }
  }
  return { ok: true, bytes: outcome.bytes, renderMs: outcome.renderMs }
}

export type ThreeMfOutcome =
  | { ok: true; bytes: Uint8Array; renderMs: number; parts: string[] }
  | { ok: false; message: string }

/** Which part gets which filament, and what the slicer will call them. */
const THREE_MF_PARTS: { part: 'tray' | 'comb'; name: string }[] = [
  { part: 'tray', name: 'Tray' },
  { part: 'comb', name: 'Comb' },
]

/**
 * Render the two-color 3MF: the tray and the comb as two parts of one object.
 *
 * A pass per part, and OFF rather than STL, because the 3MF is assembled here
 * rather than by OpenSCAD — see `@/model/three-mf` for why. The viewer's own
 * tray and comb meshes cannot stand in: they are STL, a triangle soup with the
 * shared vertices thrown away, and the 3MF wants them indexed.
 */
export async function renderThreeMf(
  slots: Slot[] = designStore.state.slots,
  colors: PartColors = designStore.state.colors,
): Promise<ThreeMfOutcome> {
  const meshes: ThreeMfPart[] = []
  let renderMs = 0

  for (const { part, name } of THREE_MF_PARTS) {
    const color = colors[part]
    const source = applyDesignToSource(MODEL_MAIN, {
      slots,
      previewPicks: false,
      part,
    })
    const outcome = await getOpenScadClient().render({
      source,
      includes: MODEL_INCLUDES,
      params: {},
      format: 'off',
    })
    if (!outcome.ok) {
      return {
        ok: false,
        message: outcome.aborted
          ? 'superseded'
          : `${part}: ${friendlyRenderError(outcome.message, outcome.stderr)}`,
      }
    }
    renderMs += outcome.renderMs

    const mesh = parseOff(new TextDecoder().decode(outcome.bytes))
    // A part inside out, or open, would slice into nonsense. Cheap to notice
    // here, expensive to notice on the printer.
    if (meshVolume(mesh) <= 0) {
      return {
        ok: false,
        message: `${part} came back inside out or unclosed`,
      }
    }
    meshes.push({ name, color, mesh })
  }

  const bytes = await buildThreeMf(
    meshes,
    designStore.state.projectName || 'altoids-pick-insert',
  )
  return { ok: true, bytes, renderMs, parts: meshes.map((m) => m.name) }
}

async function performRender(): Promise<RenderOutcomeSummary> {
  const state = designStore.state

  renderSeq += 1
  const requestId = `r${renderSeq}`
  designActions.setRenderStatus('pending', requestId)

  const superseded = (): RenderOutcomeSummary => ({
    ok: false,
    requestId,
    message: 'superseded',
    stderr: '',
  })
  const isCurrent = () => designStore.state.render.requestId === requestId

  // The asserts and echoes the fit report is built from sit at the top level of
  // the model, so any pass reports them. The tray goes first and speaks for the
  // whole render.
  const tray = await renderPass(state.slots, { part: 'tray' })
  if (!isCurrent() || (!tray.ok && tray.aborted)) return superseded()

  const fit = parseFitReport(tray.stderr)

  const fail = (
    outcome: { message: string; stderr: string },
    part: string,
  ): RenderOutcomeSummary => {
    const message = `${part}: ${friendlyRenderError(outcome.message, outcome.stderr)}`
    designActions.setRenderError({
      requestId,
      message,
      stderr: outcome.stderr,
      fit,
    })
    return { ok: false, requestId, message, stderr: outcome.stderr }
  }

  if (!tray.ok) return fail(tray, 'tray')

  const comb = await renderPass(state.slots, { part: 'comb' })
  if (!isCurrent() || (!comb.ok && comb.aborted)) return superseded()
  if (!comb.ok) return fail(comb, 'comb')

  let picksStl: Uint8Array | null = null
  let renderMs = tray.renderMs + comb.renderMs

  const picks = await renderPass(state.slots, { previewPicks: true })
  if (!isCurrent() || (!picks.ok && picks.aborted)) return superseded()
  if (picks.ok) {
    picksStl = picks.bytes
    renderMs += picks.renderMs
  } else {
    // The overlay is decoration. Losing it is not worth failing a render
    // that produced a perfectly good insert.
    console.warn('[render-controller] pick preview pass failed', picks.message)
  }

  designActions.setRenderResult({
    requestId,
    trayStl: tray.bytes,
    combStl: comb.bytes,
    picksStl,
    renderMs,
    stderr: tray.stderr,
    fit,
  })
  return {
    ok: true,
    requestId,
    renderMs,
    byteLength: tray.bytes.byteLength + comb.bytes.byteLength,
    stderr: tray.stderr,
  }
}

function scheduleRender(): void {
  if (debounceHandle !== null) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => {
    debounceHandle = null
    performRender().catch((e) => {
      console.error('[render-controller] unexpected render failure', e)
    })
  }, DEBOUNCE_MS)
}

export function startRenderController(): () => void {
  if (stopFn) return stopFn

  lastSig = designSignature(designStore.state)

  const subscription = designStore.subscribe(() => {
    const sig = designSignature(designStore.state)
    if (sig === lastSig) return
    lastSig = sig
    scheduleRender()
  })

  stopFn = () => {
    subscription.unsubscribe()
    if (debounceHandle !== null) {
      clearTimeout(debounceHandle)
      debounceHandle = null
    }
    stopFn = null
  }

  scheduleRender()

  return stopFn
}

export function renderNow(): Promise<RenderOutcomeSummary> {
  if (debounceHandle !== null) {
    clearTimeout(debounceHandle)
    debounceHandle = null
  }
  return performRender()
}
