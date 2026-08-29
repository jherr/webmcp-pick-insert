/**
 * The three colors of a design: tray, comb, picks.
 *
 * Tray and comb are print colors. They are what the 3MF hands the slicer —
 * one filament each — and what the viewer shows, so the preview is the print.
 * The pick color is preview-only: the picks are never exported, they are
 * there to show what the slots are holding.
 *
 * Colors never reach OpenSCAD. Geometry does not depend on them, and routing
 * them through the source would invalidate the render signature on every
 * swatch drag. The SCAD file keeps its own `*_color` defaults for anyone
 * opening it directly; `DEFAULT_COLORS` mirrors them.
 */

export type ColorPart = 'tray' | 'comb' | 'picks'

export type PartColors = Record<ColorPart, string>

export const DEFAULT_COLORS: PartColors = {
  tray: '#2a5f7a',
  comb: '#c8442a',
  picks: '#ffb35c',
}

export const COLOR_PARTS: {
  part: ColorPart
  label: string
  hint: string
}[] = [
  {
    part: 'tray',
    label: 'Tray',
    hint: 'Floor and walls — the first filament of the two-color print',
  },
  {
    part: 'comb',
    label: 'Comb',
    hint: 'The slotted band that grips the picks — the second filament',
  },
  {
    part: 'picks',
    label: 'Picks',
    hint: 'Preview overlay only; the picks are not part of the print',
  },
]

export function isColorPart(value: unknown): value is ColorPart {
  return value === 'tray' || value === 'comb' || value === 'picks'
}

/**
 * Normalize a color to `#rrggbb` lowercase, or null if it is not one.
 *
 * The leading `#` is optional because the picker and a typed hex field both
 * emit one, while MCP callers often omit it. `#abc` shorthand is deliberately
 * not accepted: the hex field commits every valid keystroke, so expanding
 * three digits would rewrite `#eab` to `#eeaabb` under someone halfway through
 * typing `#eab308`.
 */
export function parseHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const hex = value.trim().replace(/^#/, '').toLowerCase()
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null
}

export function cloneColors(colors: PartColors): PartColors {
  return { tray: colors.tray, comb: colors.comb, picks: colors.picks }
}

export function summarizeColors(colors: PartColors): string {
  return COLOR_PARTS.map((c) => `${c.part} ${colors[c.part]}`).join(', ')
}
