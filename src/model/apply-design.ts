/**
 * Rewrite design assignments into the bundled SCAD source.
 *
 * OpenSCAD's `-D` flag is unreliable for nested string/number lists
 * (the slots array). Writing the assignments into the source — matching
 * the file's own style, including a trailing comma on every list entry —
 * is the dependable path.
 */
import type { Slot } from '@/store/design-store'

export function formatSlotsBlock(slots: Slot[]): string {
  const lines = slots.map(
    (s) => `    ["${s.pick}", ${s.thickness}],`,
  )
  return `slots = [\n${lines.join('\n')}\n];`
}

export function applyDesignToSource(
  source: string,
  options: {
    slots: Slot[]
    previewPicks: boolean
  },
): string {
  let out = source

  const slotsBlock = formatSlotsBlock(options.slots)
  const slotsRe = /^slots\s*=\s*\[[\s\S]*?\];/m
  if (!slotsRe.test(out)) {
    throw new Error('could not find slots = [...] assignment in model source')
  }
  out = out.replace(slotsRe, slotsBlock)

  out = replaceBool(out, 'preview_picks', options.previewPicks)

  return out
}

function replaceBool(source: string, name: string, value: boolean): string {
  const re = new RegExp(`^${name}\\s*=\\s*(true|false)\\s*;`, 'm')
  if (!re.test(source)) {
    throw new Error(`could not find ${name} assignment in model source`)
  }
  return source.replace(re, `${name} = ${value};`)
}
