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
 * Every render is two passes. `preview_picks` makes the model draw the picks
 * instead of the insert, so the two come back as separate meshes the viewer
 * overlays. The upshot is that the first pass is always preview-free, which
 * means the STL on hand is always the printable one.
 */
import {
  designActions,
  designStore,
  type DesignState,
  type Slot,
} from './design-store'
import { MODEL_INCLUDES, MODEL_MAIN } from '@/model/model-source'
import { applyDesignToSource } from '@/model/apply-design'
import {
  friendlyRenderError,
  parseFitReport,
} from '@/model/fit-report'
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
  previewPicks: boolean,
): Promise<RenderOutcome> {
  const source = applyDesignToSource(MODEL_MAIN, { slots, previewPicks })
  return getOpenScadClient().render({
    source,
    includes: MODEL_INCLUDES,
    params: {},
  })
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

  const insert = await renderPass(state.slots, false)
  if (!isCurrent() || (!insert.ok && insert.aborted)) return superseded()

  const fit = parseFitReport(insert.stderr)

  if (!insert.ok) {
    const message = friendlyRenderError(insert.message, insert.stderr)
    designActions.setRenderError({
      requestId,
      message,
      stderr: insert.stderr,
      fit,
    })
    return { ok: false, requestId, message, stderr: insert.stderr }
  }

  let picksStl: Uint8Array | null = null
  let renderMs = insert.renderMs

  const picks = await renderPass(state.slots, true)
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
    stl: insert.bytes,
    picksStl,
    renderMs,
    stderr: insert.stderr,
    fit,
  })
  return {
    ok: true,
    requestId,
    renderMs,
    byteLength: insert.bytes.byteLength,
    stderr: insert.stderr,
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
