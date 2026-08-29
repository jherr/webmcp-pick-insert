/**
 * Shared helpers for the MCP tool definitions in `./tools.ts`.
 */
import type { HistoryEntry, RenderState, Slot } from '@/store/design-store'
import type { FitReport } from '@/model/fit-report'
import { getPickType } from '@/model/pick-types'

export type ToolContent = { content: Array<{ type: 'text'; text: string }> }

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: unknown) => Promise<ToolContent>
}

/** Wrap any value as a successful MCP text response. */
export function ok(value: unknown): ToolContent {
  return {
    content: [
      {
        type: 'text',
        text:
          typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  }
}

/** Wrap an error message as a structured `{ ok: false, error }` payload. */
export function err(message: string): ToolContent {
  return ok({ ok: false, error: message })
}

/**
 * STL bytes can be megabytes. `btoa(String.fromCharCode(...bytes))` blows
 * the JS argument-list limit (~100k items) on real models, so we chunk the
 * buffer and accumulate the binary string before encoding.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))),
    )
  }
  return btoa(binary)
}

export function summarizeSlot(slot: Slot, index: number) {
  const type = getPickType(slot.pick)
  return {
    index,
    pick: slot.pick,
    label: type.label,
    thickness: slot.thickness,
    width: type.w,
    height: type.h,
    fitsShallowComb: type.fitsShallowComb,
  }
}

export function summarizeSlots(slots: Slot[]) {
  return slots.map((s, i) => summarizeSlot(s, i))
}

export function summarizeRender(render: RenderState, fit: FitReport | null) {
  return {
    status: render.status,
    requestId: render.requestId,
    // The tray and the comb are the whole insert between them, so their sum is
    // the size of the model on screen.
    byteLength:
      render.trayStl && render.combStl
        ? render.trayStl.byteLength + render.combStl.byteLength
        : null,
    renderMs: render.renderMs,
    error: render.error,
    fit: fit
      ? {
          footprint: fit.footprint,
          leanAsked: fit.leanAsked,
          leanUsed: fit.leanUsed,
          tallest: fit.tallest,
          leanNeeded: fit.leanNeeded,
          slotCount: fit.slots.length,
          throughSlots: fit.slots.filter((s) => s.through).map((s) => s.index),
          error: fit.error,
        }
      : null,
    stderr: render.stderr ? render.stderr.slice(0, 4000) : '',
  }
}

export function summarizeHistory(entries: HistoryEntry[], limit: number) {
  const slice = entries.slice(0, limit)
  return slice.map((e) => ({
    ts: e.ts,
    isoTs: new Date(e.ts).toISOString(),
    kind: e.kind,
    summary: e.summary,
  }))
}
