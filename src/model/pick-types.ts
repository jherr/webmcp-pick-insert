/**
 * Catalog of pick shapes the insert can hold.
 *
 * Dimensions mirror `pick_types` in altoids_pick_insert.scad (the geometric
 * source of truth). `fitsShallowComb` is false for shapes that force the
 * comb to steepen past the default 45° lean to clear the tin lid.
 */

export const PICK_TYPES = [
  {
    name: 'teardrop',
    label: 'Teardrop',
    w: 26,
    h: 30,
    fitsShallowComb: true,
  },
  {
    name: 'butterfly',
    label: 'Butterfly',
    w: 25,
    h: 29,
    fitsShallowComb: true,
  },
  {
    name: 'diamond',
    label: 'Diamond',
    w: 20,
    h: 25,
    fitsShallowComb: true,
  },
  {
    name: 'rounded_triangle',
    label: 'Rounded triangle',
    w: 29,
    h: 28,
    fitsShallowComb: false,
  },
  {
    name: 'triangle',
    label: 'Triangle',
    w: 30,
    h: 30,
    fitsShallowComb: false,
  },
] as const

export type PickTypeName = (typeof PICK_TYPES)[number]['name']

export const PICK_TYPE_NAMES = PICK_TYPES.map((t) => t.name)

export function isPickTypeName(value: unknown): value is PickTypeName {
  return (
    typeof value === 'string' &&
    (PICK_TYPE_NAMES as readonly string[]).includes(value)
  )
}

export function getPickType(name: PickTypeName) {
  const row = PICK_TYPES.find((t) => t.name === name)
  if (!row) throw new Error(`unknown pick type: ${name}`)
  return row
}

/** Common guitar-pick gauges in mm (Dunlop-style). */
export const THICKNESS_PRESETS = [0.5, 0.73, 0.88, 1.0, 1.14, 1.5] as const

export const DEFAULT_THICKNESS = 1.5
export const MIN_THICKNESS = 0.3
export const MAX_THICKNESS = 3.0
export const MAX_SLOTS = 16

export const DEFAULT_SLOTS: Array<{ pick: PickTypeName; thickness: number }> = [
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
  { pick: 'teardrop', thickness: 1.5 },
]
