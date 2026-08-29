/**
 * Design store — single source of truth for the Altoids pick insert.
 *
 * The SCAD model is a fixed bundled asset. The editable state is the list of
 * slots (pick shape + thickness) and the three part colors. Everything the
 * UI, the render controller, and the MCP tools touch lives here.
 */
import { Store } from '@tanstack/store'
import type { FitReport } from '@/model/fit-report'
import {
  DEFAULT_COLORS,
  cloneColors,
  isColorPart,
  parseHexColor,
  summarizeColors,
  type ColorPart,
  type PartColors,
} from '@/model/colors'
import {
  DEFAULT_SLOTS,
  DEFAULT_THICKNESS,
  MAX_SLOTS,
  MAX_THICKNESS,
  MIN_THICKNESS,
  type PickTypeName,
  isPickTypeName,
} from '@/model/pick-types'

export type Slot = {
  pick: PickTypeName
  thickness: number
}

export type RenderStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * The meshes on screen: one pass per part, so each can carry its own color.
 *
 * Tray and comb together are exactly the one-piece insert — they share
 * coincident faces and no volume. The printable single-mesh STL is not here:
 * it is rendered on demand at export time, the way the 3MF is.
 */
export type RenderState = {
  status: RenderStatus
  requestId: string | null
  /** The shell: floor and walls, slots cut. */
  trayStl: Uint8Array | null
  /** The slotted band standing on that floor. */
  combStl: Uint8Array | null
  /** The picks alone; null when the overlay pass failed. */
  picksStl: Uint8Array | null
  error: string | null
  stderr: string
  renderMs: number | null
}

export type HistoryKind = 'slot' | 'color' | 'render' | 'export' | 'load'

export type HistoryEntry = {
  ts: number
  kind: HistoryKind
  summary: string
}

export type DesignState = {
  slots: Slot[]
  colors: PartColors
  projectName: string
  render: RenderState
  history: HistoryEntry[]
  fit: FitReport | null
}

const HISTORY_LIMIT = 200

function cloneSlots(slots: Slot[]): Slot[] {
  return slots.map((s) => ({ pick: s.pick, thickness: s.thickness }))
}

const initialState: DesignState = {
  slots: cloneSlots(DEFAULT_SLOTS),
  colors: cloneColors(DEFAULT_COLORS),
  projectName: 'altoids-pick-insert',
  render: {
    status: 'idle',
    requestId: null,
    trayStl: null,
    combStl: null,
    picksStl: null,
    error: null,
    stderr: '',
    renderMs: null,
  },
  history: [],
  fit: null,
}

export const designStore = new Store<DesignState>(initialState)

function appendHistory(state: DesignState, entry: HistoryEntry): DesignState {
  const history = [entry, ...state.history].slice(0, HISTORY_LIMIT)
  return { ...state, history }
}

export function sanitizeProjectFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned || 'altoids-pick-insert'
}

export function clampThickness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THICKNESS
  return Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, value))
}

export function summarizeSlots(slots: Slot[]): string {
  return slots.map((s) => `${s.pick}@${s.thickness}mm`).join(', ')
}

function normalizeSlot(input: {
  pick: unknown
  thickness?: unknown
}): Slot | null {
  if (!isPickTypeName(input.pick)) return null
  const thickness =
    typeof input.thickness === 'number'
      ? clampThickness(input.thickness)
      : DEFAULT_THICKNESS
  return { pick: input.pick, thickness }
}

export const designActions = {
  setSlots(slots: Slot[]) {
    const next = slots.slice(0, MAX_SLOTS).map((s) => ({
      pick: s.pick,
      thickness: clampThickness(s.thickness),
    }))
    designStore.setState((state) =>
      appendHistory(
        { ...state, slots: next },
        {
          ts: Date.now(),
          kind: 'slot',
          summary: `set ${next.length} slots: ${summarizeSlots(next)}`,
        },
      ),
    )
  },

  addSlot(slot?: Partial<Slot>) {
    designStore.setState((state) => {
      if (state.slots.length >= MAX_SLOTS) return state
      const pick = isPickTypeName(slot?.pick)
        ? slot.pick
        : state.slots[state.slots.length - 1]?.pick ?? 'teardrop'
      const thickness = clampThickness(
        typeof slot?.thickness === 'number'
          ? slot.thickness
          : state.slots[state.slots.length - 1]?.thickness ?? DEFAULT_THICKNESS,
      )
      const next = [...state.slots, { pick, thickness }]
      return appendHistory(
        { ...state, slots: next },
        {
          ts: Date.now(),
          kind: 'slot',
          summary: `added slot ${next.length - 1}: ${pick} ${thickness}mm`,
        },
      )
    })
  },

  removeSlot(index: number) {
    designStore.setState((state) => {
      if (index < 0 || index >= state.slots.length) return state
      if (state.slots.length <= 1) return state
      const removed = state.slots[index]
      const next = state.slots.filter((_, i) => i !== index)
      return appendHistory(
        { ...state, slots: next },
        {
          ts: Date.now(),
          kind: 'slot',
          summary: `removed slot ${index}: ${removed.pick} ${removed.thickness}mm`,
        },
      )
    })
  },

  updateSlot(index: number, patch: Partial<Slot>) {
    designStore.setState((state) => {
      if (index < 0 || index >= state.slots.length) return state
      const current = state.slots[index]
      const pick = isPickTypeName(patch.pick) ? patch.pick : current.pick
      const thickness =
        typeof patch.thickness === 'number'
          ? clampThickness(patch.thickness)
          : current.thickness
      if (pick === current.pick && thickness === current.thickness) return state
      const next = state.slots.map((s, i) =>
        i === index ? { pick, thickness } : s,
      )
      return appendHistory(
        { ...state, slots: next },
        {
          ts: Date.now(),
          kind: 'slot',
          summary: `updated slot ${index}: ${pick} ${thickness}mm`,
        },
      )
    })
  },

  setAllThickness(thickness: number) {
    const t = clampThickness(thickness)
    designStore.setState((state) => {
      const next = state.slots.map((s) => ({ ...s, thickness: t }))
      return appendHistory(
        { ...state, slots: next },
        {
          ts: Date.now(),
          kind: 'slot',
          summary: `set all thickness to ${t}mm`,
        },
      )
    })
  },

  resetDesign() {
    designStore.setState((state) =>
      appendHistory(
        {
          ...state,
          slots: cloneSlots(DEFAULT_SLOTS),
          colors: cloneColors(DEFAULT_COLORS),
          fit: null,
        },
        {
          ts: Date.now(),
          kind: 'slot',
          summary: 'reset design to defaults',
        },
      ),
    )
  },

  setColor(part: ColorPart, value: string) {
    designActions.setColors({ [part]: value } as Partial<PartColors>)
  },

  /**
   * Set one or more part colors. Anything that is not a hex color is
   * ignored rather than rejected: a swatch drag fires continuously, and a
   * half-typed `#a` should leave the design alone, not error.
   */
  setColors(patch: Partial<PartColors>) {
    const next: Partial<PartColors> = {}
    for (const [part, value] of Object.entries(patch)) {
      if (!isColorPart(part)) continue
      const hex = parseHexColor(value)
      if (hex) next[part] = hex
    }
    if (Object.keys(next).length === 0) return

    designStore.setState((state) => {
      const colors = { ...state.colors, ...next }
      const changed = (Object.keys(next) as ColorPart[]).filter(
        (part) => colors[part] !== state.colors[part],
      )
      if (changed.length === 0) return state
      return appendHistory(
        { ...state, colors },
        {
          ts: Date.now(),
          kind: 'color',
          summary: changed
            .map((part) => `${part} color ${colors[part]}`)
            .join(', '),
        },
      )
    })
  },

  resetColors() {
    designStore.setState((state) =>
      appendHistory(
        { ...state, colors: cloneColors(DEFAULT_COLORS) },
        {
          ts: Date.now(),
          kind: 'color',
          summary: `reset colors to ${summarizeColors(DEFAULT_COLORS)}`,
        },
      ),
    )
  },

  setProjectName(name: string): string | null {
    const trimmed = name.trim()
    if (trimmed === '') return null
    let stored = trimmed
    designStore.setState((state) => {
      if (state.projectName === trimmed) {
        stored = state.projectName
        return state
      }
      return appendHistory(
        { ...state, projectName: trimmed },
        {
          ts: Date.now(),
          kind: 'load',
          summary: `renamed project to "${trimmed}"`,
        },
      )
    })
    return stored
  },

  setRenderStatus(status: RenderStatus, requestId: string | null) {
    designStore.setState((state) => ({
      ...state,
      render: { ...state.render, status, requestId },
    }))
  },

  setRenderResult(input: {
    requestId: string
    trayStl: Uint8Array
    combStl: Uint8Array
    picksStl: Uint8Array | null
    renderMs: number
    stderr: string
    fit: FitReport | null
  }) {
    designStore.setState((state) => {
      const next: DesignState = {
        ...state,
        fit: input.fit,
        render: {
          status: 'success',
          requestId: input.requestId,
          trayStl: input.trayStl,
          combStl: input.combStl,
          picksStl: input.picksStl,
          error: null,
          stderr: input.stderr,
          renderMs: input.renderMs,
        },
      }
      const bytes = input.trayStl.byteLength + input.combStl.byteLength
      return appendHistory(next, {
        ts: Date.now(),
        kind: 'render',
        summary: `render ok in ${input.renderMs.toFixed(0)}ms (${bytes} bytes)`,
      })
    })
  },

  setRenderError(input: {
    requestId: string
    message: string
    stderr: string
    fit: FitReport | null
  }) {
    designStore.setState((state) => {
      const next: DesignState = {
        ...state,
        fit: input.fit,
        render: {
          status: 'error',
          requestId: input.requestId,
          trayStl: null,
          combStl: null,
          picksStl: null,
          error: input.message,
          stderr: input.stderr,
          renderMs: null,
        },
      }
      return appendHistory(next, {
        ts: Date.now(),
        kind: 'render',
        summary: `render error: ${input.message.slice(0, 120)}`,
      })
    })
  },

  pushHistory(entry: Omit<HistoryEntry, 'ts'>) {
    designStore.setState((state) =>
      appendHistory(state, { ts: Date.now(), ...entry }),
    )
  },

  /** Validate and normalize a raw slot list from MCP / external input. */
  parseSlotsInput(
    raw: unknown,
  ): { ok: true; slots: Slot[] } | { ok: false; error: string } {
    if (!Array.isArray(raw)) {
      return { ok: false, error: 'slots must be an array' }
    }
    if (raw.length === 0) {
      return { ok: false, error: 'at least one slot is required' }
    }
    if (raw.length > MAX_SLOTS) {
      return { ok: false, error: `at most ${MAX_SLOTS} slots allowed` }
    }
    const slots: Slot[] = []
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i]
      if (Array.isArray(item) && item.length >= 1) {
        const slot = normalizeSlot({ pick: item[0], thickness: item[1] })
        if (!slot) {
          return {
            ok: false,
            error: `slot ${i}: unknown pick type ${JSON.stringify(item[0])}`,
          }
        }
        slots.push(slot)
        continue
      }
      if (item && typeof item === 'object') {
        const obj = item as { pick?: unknown; thickness?: unknown }
        const slot = normalizeSlot({
          pick: obj.pick,
          thickness: obj.thickness,
        })
        if (!slot) {
          return {
            ok: false,
            error: `slot ${i}: unknown pick type ${JSON.stringify(obj.pick)}`,
          }
        }
        slots.push(slot)
        continue
      }
      return {
        ok: false,
        error: `slot ${i}: expected {pick, thickness} or [pick, thickness]`,
      }
    }
    return { ok: true, slots }
  },
}

export type DesignActions = typeof designActions
