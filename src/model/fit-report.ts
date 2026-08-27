/**
 * Parse OpenSCAD stderr from altoids_pick_insert.scad into a structured
 * fit report. The model is chatty via `echo` and its `assert` messages
 * are the friendliest error surface we have.
 */

export type SlotFit = {
  index: number
  pick: string
  thickness: number
  floor: number
  through: boolean
  topsOut: number
  grip: number
  gripMid: number | null
  fin: number | null
}

export type FitReport = {
  footprint: string | null
  leanAsked: number | null
  leanUsed: number | null
  tallest: string | null
  leanNeeded: number | null
  slots: SlotFit[]
  /** Friendly message extracted from an assert failure, if any. */
  error: string | null
  rawStderr: string
}

const FOOTPRINT_RE =
  /ECHO:\s*"footprint\s+([^"]+)"/
const LEAN_RE =
  /ECHO:\s*"lean asked\s+([\d.]+)\s+deg,\s*using\s+([\d.]+)\s+deg\s*\(the\s+(\w+)\s+needs\s+([\d.]+)\s+deg/
const SLOT_RE =
  /ECHO:\s*"slot\s+(\d+):\s+(\w+)\s+([\d.]+)mm,\s*x\s+[^,]+,\s*floor\s+([\d.]+)(\s*\(open\))?,\s*tops out at\s+([\d.]+),\s*grip\s+([\d.]+)(?:\s*\(([\d.]+)\s+mid\))?(?:,\s*fin\s+([\d.]+))?"/
const ASSERT_RE =
  /ERROR:\s*Assertion\s+'[^']*'\s+failed:\s*"([^"]+)"/
const ASSERT_BARE_RE = /ERROR:\s*Assertion\s+'([^']+)'\s+failed/

export function parseFitReport(stderr: string): FitReport {
  const report: FitReport = {
    footprint: null,
    leanAsked: null,
    leanUsed: null,
    tallest: null,
    leanNeeded: null,
    slots: [],
    error: null,
    rawStderr: stderr,
  }

  const fp = FOOTPRINT_RE.exec(stderr)
  if (fp) report.footprint = fp[1].trim()

  const lean = LEAN_RE.exec(stderr)
  if (lean) {
    report.leanAsked = Number(lean[1])
    report.leanUsed = Number(lean[2])
    report.tallest = lean[3]
    report.leanNeeded = Number(lean[4])
  }

  for (const m of stderr.matchAll(new RegExp(SLOT_RE.source, 'g'))) {
    report.slots.push({
      index: Number(m[1]),
      pick: m[2],
      thickness: Number(m[3]),
      floor: Number(m[4]),
      through: Boolean(m[5]),
      topsOut: Number(m[6]),
      grip: Number(m[7]),
      gripMid: m[8] != null ? Number(m[8]) : null,
      fin: m[9] != null ? Number(m[9]) : null,
    })
  }

  const assertMsg = ASSERT_RE.exec(stderr)
  if (assertMsg) {
    report.error = assertMsg[1]
  } else {
    const bare = ASSERT_BARE_RE.exec(stderr)
    if (bare) report.error = bare[1]
  }

  return report
}

/** Prefer the assert message over the generic exit-code string. */
export function friendlyRenderError(
  message: string,
  stderr: string,
): string {
  const report = parseFitReport(stderr)
  if (report.error) return report.error
  return message
}
