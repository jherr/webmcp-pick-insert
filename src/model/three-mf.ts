/**
 * Minimal 3MF writer: several meshes, each its own color, in one file.
 *
 * Why hand-rolled rather than `openscad -o out.3mf`: the WASM builds are
 * compiled without the 3MF exporter (they answer "Export to 3MF format was
 * not enabled when building the application", exit 0, and leave a zero-byte
 * file). Assembling the package here is a few hundred lines of ZIP and XML
 * and, unlike the exporter, it lets us say how the parts relate.
 *
 * How the parts relate: each mesh becomes an `<object>` carrying its own base
 * material, and the build lists one `<item>` per object. This is the shape
 * OpenSCAD's own exporter produces for a multi-object model, and slicers know
 * it: they load the objects together and offer to treat them as one object
 * with a part each, which is what per-filament assignment wants.
 *
 * The tidier-looking alternative — one object gathering the meshes as
 * `<components>`, one item in the build — is a trap. OpenSCAD's own
 * lib3mf-backed importer reads such a file back a millimetre higher in Z than
 * it was written, with or without an explicit identity transform on each
 * component. A reader that quietly moves a part is worse than no structure at
 * all, so the parts stay separate objects.
 *
 * A 3MF is an OPC package, i.e. a ZIP of three files: the content types, a
 * relationship pointing at the model, and the model itself.
 */
import type { IndexedMesh } from './off-mesh'

export type ThreeMfPart = {
  name: string
  /** `#rrggbb`; alpha is added for the 3MF's `#rrggbbaa`. */
  color: string
  mesh: IndexedMesh
}

const MODEL_PATH = '3D/3dmodel.model'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Target="/${MODEL_PATH}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Fixed-point with the trailing zeros trimmed. Micrometre resolution is three
 * orders of magnitude finer than anything a nozzle can do, and formatting this
 * way — rather than with `String(v)` — keeps exponent notation, which not every
 * 3MF reader parses, out of the file.
 */
function formatCoord(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`cannot write ${value} as a 3MF coordinate`)
  }
  const text = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return text === '-0' ? '0' : text
}

function normalizeColor(color: string): string {
  const hex = color.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`expected a #rrggbb color, got ${color}`)
  }
  return `#${hex.toUpperCase()}FF`
}

function meshXml(mesh: IndexedMesh): string {
  const { vertices, triangles } = mesh
  const out: string[] = ['   <mesh>\n    <vertices>\n']
  for (let v = 0; v < vertices.length; v += 3) {
    out.push(
      `     <vertex x="${formatCoord(vertices[v])}" y="${formatCoord(vertices[v + 1])}" z="${formatCoord(vertices[v + 2])}"/>\n`,
    )
  }
  out.push('    </vertices>\n    <triangles>\n')
  for (let t = 0; t < triangles.length; t += 3) {
    out.push(
      `     <triangle v1="${triangles[t]}" v2="${triangles[t + 1]}" v3="${triangles[t + 2]}"/>\n`,
    )
  }
  out.push('    </triangles>\n   </mesh>\n')
  return out.join('')
}

function modelXml(parts: ThreeMfPart[], title: string): string {
  // Ids are arbitrary but have to be unique: 1 is the material group, then one
  // mesh object per part.
  const materialsId = 1
  const firstObjectId = 2

  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n')
  out.push(
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
  )
  out.push(` <metadata name="Title">${escapeXml(title)}</metadata>\n`)
  out.push(' <metadata name="Application">altoids-pick-insert</metadata>\n')
  out.push(' <resources>\n')

  out.push(`  <basematerials id="${materialsId}">\n`)
  for (const part of parts) {
    out.push(
      `   <base name="${escapeXml(part.name)}" displaycolor="${normalizeColor(part.color)}"/>\n`,
    )
  }
  out.push('  </basematerials>\n')

  parts.forEach((part, index) => {
    out.push(
      `  <object id="${firstObjectId + index}" name="${escapeXml(part.name)}" type="model" pid="${materialsId}" pindex="${index}">\n`,
    )
    out.push(meshXml(part.mesh))
    out.push('  </object>\n')
  })

  out.push(' </resources>\n')
  out.push(' <build>\n')
  parts.forEach((part, index) => {
    out.push(
      `  <item objectid="${firstObjectId + index}" partnumber="${escapeXml(part.name)}"/>\n`,
    )
  })
  out.push(' </build>\n')
  out.push('</model>\n')
  return out.join('')
}

// ------------------------------------------------------------------- ZIP ---

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

type ZipEntry = {
  name: string
  data: Uint8Array
  crc: number
  /** 0 stored, 8 deflated. */
  method: number
  uncompressedSize: number
}

async function zipEntry(name: string, text: string): Promise<ZipEntry> {
  const raw = new TextEncoder().encode(text)
  const crc = crc32(raw)
  const deflated = await deflateRaw(raw)
  if (deflated && deflated.length < raw.length) {
    return {
      name,
      data: deflated,
      crc,
      method: 8,
      uncompressedSize: raw.length,
    }
  }
  return { name, data: raw, crc, method: 0, uncompressedSize: raw.length }
}

/**
 * ZIP with no extras: no data descriptors, no zip64, no timestamps. Sizes are
 * known up front, so every local header is complete when it is written.
 */
function writeZip(entries: ZipEntry[]): Uint8Array {
  const names = entries.map((e) => new TextEncoder().encode(e.name))
  const localSize = entries.reduce(
    (sum, e, i) => sum + 30 + names[i].length + e.data.length,
    0,
  )
  const centralSize = entries.reduce(
    (sum, _, i) => sum + 46 + names[i].length,
    0,
  )
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let at = 0
  const offsets: number[] = []

  const u16 = (value: number) => {
    view.setUint16(at, value, true)
    at += 2
  }
  const u32 = (value: number) => {
    view.setUint32(at, value, true)
    at += 4
  }

  entries.forEach((entry, i) => {
    offsets.push(at)
    u32(0x04034b50)
    u16(20) // version needed
    u16(0) // flags
    u16(entry.method)
    u16(0) // modification time
    u16(0x0021) // modification date: 1980-01-01, the ZIP epoch
    u32(entry.crc)
    u32(entry.data.length)
    u32(entry.uncompressedSize)
    u16(names[i].length)
    u16(0) // extra field
    out.set(names[i], at)
    at += names[i].length
    out.set(entry.data, at)
    at += entry.data.length
  })

  const centralStart = at
  entries.forEach((entry, i) => {
    u32(0x02014b50)
    u16(20) // version made by
    u16(20) // version needed
    u16(0) // flags
    u16(entry.method)
    u16(0)
    u16(0x0021)
    u32(entry.crc)
    u32(entry.data.length)
    u32(entry.uncompressedSize)
    u16(names[i].length)
    u16(0) // extra field
    u16(0) // comment
    u16(0) // disk number
    u16(0) // internal attributes
    u32(0) // external attributes
    u32(offsets[i])
    out.set(names[i], at)
    at += names[i].length
  })

  const centralBytes = at - centralStart
  u32(0x06054b50)
  u16(0) // this disk
  u16(0) // disk with the central directory
  u16(entries.length)
  u16(entries.length)
  u32(centralBytes)
  u32(centralStart)
  u16(0) // comment

  return out
}

export async function buildThreeMf(
  parts: ThreeMfPart[],
  title: string,
): Promise<Uint8Array> {
  if (parts.length === 0) {
    throw new Error('a 3MF needs at least one part')
  }
  // Content types first: readers are entitled to expect the package
  // description before the parts it describes.
  const entries = await Promise.all([
    zipEntry('[Content_Types].xml', CONTENT_TYPES),
    zipEntry('_rels/.rels', RELATIONSHIPS),
    zipEntry(MODEL_PATH, modelXml(parts, title)),
  ])
  return writeZip(entries)
}
