/**
 * WebMCP tools for the Altoids pick insert configurator.
 *
 * Domain-shaped surface: list pick types, edit the slot list and the part
 * colors, render, export. The SCAD source itself is not editable.
 */
import {
  designActions,
  designStore,
  sanitizeProjectFileName,
  summarizeSlots as summarizeSlotsText,
} from '@/store/design-store'
import {
  renderInsertStl,
  renderNow,
  renderThreeMf,
} from '@/store/render-controller'
import {
  COLOR_PARTS,
  parseHexColor,
  type PartColors,
} from '@/model/colors'
import {
  MAX_SLOTS,
  MAX_THICKNESS,
  MIN_THICKNESS,
  PICK_TYPES,
  isPickTypeName,
  type PickTypeName,
} from '@/model/pick-types'
import {
  bytesToBase64,
  err,
  ok,
  summarizeHistory,
  summarizeRender,
  summarizeSlots,
  type ToolDefinition,
} from './tool-helpers'

function asObject(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  return {}
}

function designSnapshot() {
  const state = designStore.state
  return {
    projectName: state.projectName,
    slots: summarizeSlots(state.slots),
    colors: state.colors,
    render: summarizeRender(state.render, state.fit),
  }
}

const get_design: ToolDefinition = {
  name: 'get_design',
  description:
    'Return the current Altoids pick insert design: slots (shape + thickness), part colors, project name, render status, and fit report.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    return ok(designSnapshot())
  },
}

const list_pick_types: ToolDefinition = {
  name: 'list_pick_types',
  description:
    'List the five available guitar pick shapes with dimensions (mm) and whether they force a steeper comb lean to clear the tin lid.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    return ok({
      pickTypes: PICK_TYPES.map((t) => ({
        name: t.name,
        label: t.label,
        widthMm: t.w,
        heightMm: t.h,
        fitsShallowComb: t.fitsShallowComb,
        note: t.fitsShallowComb
          ? 'Fits the default 45° comb.'
          : 'Steepens the whole comb lean so the pick clears the closed lid.',
      })),
      thicknessRangeMm: { min: MIN_THICKNESS, max: MAX_THICKNESS },
      maxSlots: MAX_SLOTS,
    })
  },
}

const set_slots: ToolDefinition = {
  name: 'set_slots',
  description:
    'Replace the entire slot list. Each slot is {pick, thickness} or [pick, thickness]. Pick must be one of the names from list_pick_types.',
  inputSchema: {
    type: 'object',
    properties: {
      slots: {
        type: 'array',
        description: 'New slot list (1–16 entries)',
        minItems: 1,
        maxItems: MAX_SLOTS,
      },
    },
    required: ['slots'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const parsed = designActions.parseSlotsInput(a.slots)
    if (!parsed.ok) return err(parsed.error)
    designActions.setSlots(parsed.slots)
    return ok({ ok: true, ...designSnapshot() })
  },
}

const add_slot: ToolDefinition = {
  name: 'add_slot',
  description:
    'Append one slot. Defaults to the last slot’s shape/thickness (or teardrop 1.5mm).',
  inputSchema: {
    type: 'object',
    properties: {
      pick: {
        type: 'string',
        description: 'Pick shape name from list_pick_types',
      },
      thickness: {
        type: 'number',
        description: `Pick thickness in mm (${MIN_THICKNESS}–${MAX_THICKNESS})`,
        minimum: MIN_THICKNESS,
        maximum: MAX_THICKNESS,
      },
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    if (designStore.state.slots.length >= MAX_SLOTS) {
      return err(`at most ${MAX_SLOTS} slots allowed`)
    }
    if (a.pick !== undefined && !isPickTypeName(a.pick)) {
      return err(`unknown pick type: ${JSON.stringify(a.pick)}`)
    }
    if (
      a.thickness !== undefined &&
      (typeof a.thickness !== 'number' || !Number.isFinite(a.thickness))
    ) {
      return err('thickness must be a finite number')
    }
    designActions.addSlot({
      pick: a.pick as PickTypeName | undefined,
      thickness:
        typeof a.thickness === 'number' ? a.thickness : undefined,
    })
    return ok({ ok: true, ...designSnapshot() })
  },
}

const remove_slot: ToolDefinition = {
  name: 'remove_slot',
  description: 'Remove a slot by 0-based index. At least one slot must remain.',
  inputSchema: {
    type: 'object',
    properties: {
      index: {
        type: 'integer',
        description: '0-based slot index',
        minimum: 0,
      },
    },
    required: ['index'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const index = a.index
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      return err('index must be an integer')
    }
    if (designStore.state.slots.length <= 1) {
      return err('at least one slot is required')
    }
    if (index < 0 || index >= designStore.state.slots.length) {
      return err(`index ${index} out of range`)
    }
    designActions.removeSlot(index)
    return ok({ ok: true, ...designSnapshot() })
  },
}

const update_slot: ToolDefinition = {
  name: 'update_slot',
  description: 'Update pick shape and/or thickness for one slot by index.',
  inputSchema: {
    type: 'object',
    properties: {
      index: { type: 'integer', minimum: 0 },
      pick: { type: 'string' },
      thickness: {
        type: 'number',
        minimum: MIN_THICKNESS,
        maximum: MAX_THICKNESS,
      },
    },
    required: ['index'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const index = a.index
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      return err('index must be an integer')
    }
    if (index < 0 || index >= designStore.state.slots.length) {
      return err(`index ${index} out of range`)
    }
    if (a.pick !== undefined && !isPickTypeName(a.pick)) {
      return err(`unknown pick type: ${JSON.stringify(a.pick)}`)
    }
    if (
      a.thickness !== undefined &&
      (typeof a.thickness !== 'number' || !Number.isFinite(a.thickness))
    ) {
      return err('thickness must be a finite number')
    }
    designActions.updateSlot(index, {
      pick: a.pick as PickTypeName | undefined,
      thickness:
        typeof a.thickness === 'number' ? a.thickness : undefined,
    })
    return ok({ ok: true, ...designSnapshot() })
  },
}

const set_all_thickness: ToolDefinition = {
  name: 'set_all_thickness',
  description: 'Set every slot to the same pick thickness (mm).',
  inputSchema: {
    type: 'object',
    properties: {
      thickness: {
        type: 'number',
        minimum: MIN_THICKNESS,
        maximum: MAX_THICKNESS,
      },
    },
    required: ['thickness'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    if (typeof a.thickness !== 'number' || !Number.isFinite(a.thickness)) {
      return err('thickness must be a finite number')
    }
    designActions.setAllThickness(a.thickness)
    return ok({ ok: true, ...designSnapshot() })
  },
}

const colorSchema = {
  type: 'string',
  description: 'Hex color such as "#2a5f7a"; the leading "#" is optional',
  pattern: '^#?[0-9a-fA-F]{6}$',
}

const set_colors: ToolDefinition = {
  name: 'set_colors',
  description:
    'Set the tray, comb, and/or pick color. Tray and comb are the two filaments the exported 3MF asks the slicer for; the pick color is preview-only, since the picks are never exported. Colors do not affect geometry, so this repaints without re-rendering.',
  inputSchema: {
    type: 'object',
    properties: {
      tray: colorSchema,
      comb: colorSchema,
      picks: colorSchema,
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const patch: Partial<PartColors> = {}
    for (const { part } of COLOR_PARTS) {
      if (a[part] === undefined) continue
      const hex = parseHexColor(a[part])
      if (!hex) {
        return err(
          `${part}: expected a hex color like "#2a5f7a", got ${JSON.stringify(a[part])}`,
        )
      }
      patch[part] = hex
    }
    if (Object.keys(patch).length === 0) {
      return err('set at least one of tray, comb, picks')
    }
    designActions.setColors(patch)
    return ok({ ok: true, ...designSnapshot() })
  },
}

const reset_colors: ToolDefinition = {
  name: 'reset_colors',
  description: 'Restore the default tray, comb, and pick colors.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    designActions.resetColors()
    return ok({ ok: true, ...designSnapshot() })
  },
}

const reset_design: ToolDefinition = {
  name: 'reset_design',
  description:
    'Reset the whole design: the default nine teardrop picks at 1.5mm, and the default colors.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    designActions.resetDesign()
    return ok({ ok: true, ...designSnapshot() })
  },
}

const render: ToolDefinition = {
  name: 'render',
  description:
    'Force an immediate OpenSCAD render of the current design. Returns render metadata and fit report (not the STL bytes).',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    const outcome = await renderNow()
    if (!outcome.ok && outcome.message === 'superseded') {
      return err('render was superseded by a newer request')
    }
    return ok({
      ok: outcome.ok,
      ...(!outcome.ok ? { error: outcome.message } : {}),
      ...designSnapshot(),
    })
  },
}

const get_render_status: ToolDefinition = {
  name: 'get_render_status',
  description:
    'Snapshot of the latest render: status, timing, byte length, fit report, and any error.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    const state = designStore.state
    return ok(summarizeRender(state.render, state.fit))
  },
}

const export_stl: ToolDefinition = {
  name: 'export_stl',
  description:
    'Return the printable one-piece STL as base64: the tray and the comb unioned into a single solid, with no preview geometry. Rendered fresh on every call, because the mesh on screen is the two halves held apart for coloring. A plain STL carries no color — use export_3mf for the two-filament file. Optionally truncate the base64 for inspection.',
  inputSchema: {
    type: 'object',
    properties: {
      truncateBase64: {
        type: 'integer',
        description: 'If set, only return this many base64 characters',
        minimum: 0,
      },
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const outcome = await renderInsertStl()
    if (!outcome.ok) {
      return err(
        outcome.message === 'superseded'
          ? 'export render was superseded'
          : outcome.message,
      )
    }
    const stl = outcome.bytes
    const projectName =
      designStore.state.projectName || 'altoids-pick-insert'
    const fileName = `${sanitizeProjectFileName(projectName)}.stl`
    let base64 = bytesToBase64(stl)
    const truncated =
      typeof a.truncateBase64 === 'number' && a.truncateBase64 >= 0
    if (truncated) {
      base64 = base64.slice(0, a.truncateBase64 as number)
    }
    designActions.pushHistory({
      kind: 'export',
      summary: `exported ${fileName} (${stl.byteLength} bytes)`,
    })
    return ok({
      ok: true,
      fileName,
      byteLength: stl.byteLength,
      base64,
      truncated,
      slots: summarizeSlotsText(designStore.state.slots),
    })
  },
}

const export_3mf: ToolDefinition = {
  name: 'export_3mf',
  description:
    'Return the two-color 3MF as base64: the slotted comb and the surrounding tray as two separate objects in one file, so a slicer can print each in a different filament. Rendered fresh on every call.',
  inputSchema: {
    type: 'object',
    properties: {
      truncateBase64: {
        type: 'integer',
        description: 'If set, only return this many base64 characters',
        minimum: 0,
      },
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const outcome = await renderThreeMf()
    if (!outcome.ok) {
      return err(
        outcome.message === 'superseded'
          ? '3MF export render was superseded'
          : outcome.message,
      )
    }
    const projectName =
      designStore.state.projectName || 'altoids-pick-insert'
    const fileName = `${sanitizeProjectFileName(projectName)}.3mf`
    let base64 = bytesToBase64(outcome.bytes)
    const truncated =
      typeof a.truncateBase64 === 'number' && a.truncateBase64 >= 0
    if (truncated) {
      base64 = base64.slice(0, a.truncateBase64 as number)
    }
    designActions.pushHistory({
      kind: 'export',
      summary: `exported ${fileName} (${outcome.bytes.byteLength} bytes, comb + tray)`,
    })
    return ok({
      ok: true,
      fileName,
      byteLength: outcome.bytes.byteLength,
      objects: ['tray (floor, wall, thumb scallop)', 'comb (slotted centre)'],
      base64,
      truncated,
      slots: summarizeSlotsText(designStore.state.slots),
    })
  },
}

const get_project_name: ToolDefinition = {
  name: 'get_project_name',
  description: 'Read the project name and the sanitized STL filename.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    const name = designStore.state.projectName || 'altoids-pick-insert'
    return ok({
      name,
      fileName: `${sanitizeProjectFileName(name)}.stl`,
    })
  },
}

const set_project_name: ToolDefinition = {
  name: 'set_project_name',
  description: 'Rename the project (becomes the exported STL filename).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'New project name' },
    },
    required: ['name'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    if (typeof a.name !== 'string') return err('name must be a string')
    const stored = designActions.setProjectName(a.name)
    if (stored === null) return err('name must be non-empty')
    return ok({
      ok: true,
      name: stored,
      fileName: `${sanitizeProjectFileName(stored)}.stl`,
    })
  },
}

const get_history: ToolDefinition = {
  name: 'get_history',
  description: 'Recent design/render/export actions (most recent first).',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = asObject(args)
    const limit =
      typeof a.limit === 'number' && Number.isFinite(a.limit)
        ? Math.min(200, Math.max(1, Math.floor(a.limit)))
        : 50
    return ok({
      total: designStore.state.history.length,
      entries: summarizeHistory(designStore.state.history, limit),
    })
  },
}

export const tools: ToolDefinition[] = [
  get_design,
  list_pick_types,
  set_slots,
  add_slot,
  remove_slot,
  update_slot,
  set_all_thickness,
  set_colors,
  reset_colors,
  reset_design,
  render,
  get_render_status,
  export_stl,
  export_3mf,
  get_project_name,
  set_project_name,
  get_history,
]
