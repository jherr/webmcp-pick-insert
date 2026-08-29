/**
 * Parser for OpenSCAD's OFF export.
 *
 * OFF is asked for rather than STL because it is already an indexed mesh:
 * a vertex list and faces that point into it, which is the shape a 3MF
 * `<mesh>` wants. Parsing binary STL instead would mean welding a soup of
 * float32 triangles back together and hoping the seams line up.
 *
 * Read a line at a time rather than as one token stream, because a face may
 * carry a trailing colour — the WASM build writes `3 340 342 343 157 203 81`
 * where the desktop build writes `3 340 342 343` — and there is no telling a
 * colour component from the next face's corner count without the line breaks.
 * Every writer puts one element on one line; the format permits wrapping, but
 * OpenSCAD has no reason to and does not.
 */

export type IndexedMesh = {
  /** Flat x,y,z triples. */
  vertices: number[]
  /** Flat triples of vertex indices. */
  triangles: number[]
}

export function parseOff(text: string): IndexedMesh {
  const lines: string[][] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line !== '') lines.push(line.split(/\s+/))
  }

  let at = 0
  const nextLine = (what: string): string[] => {
    if (at >= lines.length) throw new Error(`OFF ended early, expected ${what}`)
    return lines[at++]
  }

  const header = nextLine('the OFF header')
  if (header[0] !== 'OFF') throw new Error('not an OFF file')
  // `OFF 1070 2136 0` on one line, or `OFF` and then the counts on the next.
  const counts = header.length > 1 ? header.slice(1) : nextLine('element counts')
  const [vertexCount, faceCount] = counts.map(Number)
  if (!Number.isInteger(vertexCount) || !Number.isInteger(faceCount)) {
    throw new Error(`OFF header has no element counts: ${counts.join(' ')}`)
  }

  const vertices: number[] = []
  for (let v = 0; v < vertexCount; v++) {
    const line = nextLine(`vertex ${v}`)
    for (let k = 0; k < 3; k++) {
      const value = Number(line[k])
      if (!Number.isFinite(value)) {
        throw new Error(`OFF vertex ${v} is not three numbers: ${line.join(' ')}`)
      }
      vertices.push(value)
    }
  }

  const triangles: number[] = []
  for (let f = 0; f < faceCount; f++) {
    const line = nextLine(`face ${f}`)
    const corners = Number(line[0])
    if (!Number.isInteger(corners) || corners < 3) {
      throw new Error(`OFF face ${f} has no corner count: ${line.join(' ')}`)
    }
    const face: number[] = []
    for (let c = 0; c < corners; c++) {
      const index = Number(line[1 + c])
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
        throw new Error(`OFF face ${f} refers to vertex ${line[1 + c]}`)
      }
      face.push(index)
    }
    // Manifold hands OpenSCAD triangles, but the format allows polygons and a
    // 3MF mesh does not. Fan them: OFF faces are planar and convex.
    for (let c = 1; c < corners - 1; c++) {
      triangles.push(face[0], face[c], face[c + 1])
    }
  }

  if (triangles.length === 0) throw new Error('OFF has no faces')

  return { vertices, triangles }
}

/**
 * Signed volume, in the mesh's own units cubed. Positive means the faces wind
 * counter-clockwise seen from outside, which is what 3MF asks for; it doubles
 * as a cheap check that a mesh is closed and the right way out.
 */
export function meshVolume(mesh: IndexedMesh): number {
  const { vertices, triangles } = mesh
  let total = 0
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3
    const b = triangles[t + 1] * 3
    const c = triangles[t + 2] * 3
    const ax = vertices[a]
    const ay = vertices[a + 1]
    const az = vertices[a + 2]
    const bx = vertices[b]
    const by = vertices[b + 1]
    const bz = vertices[b + 2]
    const cx = vertices[c]
    const cy = vertices[c + 1]
    const cz = vertices[c + 2]
    total +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6
  }
  return total
}
