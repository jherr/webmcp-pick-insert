/**
 * Project name, STL export, and two-color 3MF export.
 *
 * Renders happen automatically (see render-controller); the spinner is the
 * only in-progress affordance. Neither export is the mesh on screen, so both
 * render on demand: the viewer holds the tray and the comb apart to color
 * them, the STL has to be their union, and the 3MF wants them as two indexed
 * objects. Nothing on screen is any of those things.
 */
import { useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import {
  designActions,
  designStore,
  sanitizeProjectFileName,
} from '@/store/design-store'
import { renderInsertStl, renderThreeMf } from '@/store/render-controller'

function download(bytes: Uint8Array, fileName: string, mimeType: string) {
  const blob = new Blob([bytes as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

function Spinner() {
  return (
    <span
      title="Rendering…"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--lagoon-deep) border-t-transparent"
    />
  )
}

export function PreviewActions() {
  const renderState = useSelector(designStore, (s) => s.render)
  const projectName = useSelector(designStore, (s) => s.projectName)
  const [exporting, setExporting] = useState<'stl' | '3mf' | null>(null)

  const isRendering = renderState.status === 'pending'
  const busy = isRendering || exporting !== null
  const baseName = sanitizeProjectFileName(
    projectName || 'altoids-pick-insert',
  )

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    designActions.setProjectName(e.target.value)
  }

  const handleExport = async () => {
    setExporting('stl')
    try {
      const outcome = await renderInsertStl()
      if (!outcome.ok) {
        if (outcome.message !== 'superseded') {
          designActions.pushHistory({
            kind: 'export',
            summary: `STL export failed: ${outcome.message.slice(0, 120)}`,
          })
        }
        return
      }
      const fileName = `${baseName}.stl`
      download(outcome.bytes, fileName, 'model/stl')
      designActions.pushHistory({
        kind: 'export',
        summary: `exported ${fileName} (${outcome.bytes.byteLength} bytes)`,
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExport3mf = async () => {
    setExporting('3mf')
    try {
      const outcome = await renderThreeMf()
      if (!outcome.ok) {
        if (outcome.message !== 'superseded') {
          designActions.pushHistory({
            kind: 'export',
            summary: `3MF export failed: ${outcome.message.slice(0, 120)}`,
          })
        }
        return
      }
      const fileName = `${baseName}.3mf`
      download(outcome.bytes, fileName, 'model/3mf')
      designActions.pushHistory({
        kind: 'export',
        summary: `exported ${fileName} (${outcome.bytes.byteLength} bytes, comb + tray)`,
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
        Project
        <input
          type="text"
          value={projectName}
          onChange={handleNameChange}
          placeholder="altoids-pick-insert"
          spellCheck={false}
          title="Project name — becomes the exported filename"
          className="w-48 border-b border-(--line) bg-transparent px-1 py-1 font-mono text-sm normal-case tracking-normal text-(--sea-ink) outline-none transition placeholder:text-(--sea-ink-soft) hover:border-(--sea-ink-soft) focus:border-(--lagoon-deep)"
        />
      </label>
      {busy ? <Spinner /> : null}
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        title={`Download as ${baseName}.stl — one piece`}
        className="rounded-full border border-(--line) bg-(--chip-bg) px-4 py-2 text-sm font-semibold text-(--sea-ink) transition disabled:opacity-50"
      >
        Export STL
      </button>
      <button
        type="button"
        onClick={() => void handleExport3mf()}
        disabled={busy}
        title={`Download as ${baseName}.3mf — comb and tray as two objects, one per filament`}
        className="rounded-full border border-(--line) bg-(--chip-bg) px-4 py-2 text-sm font-semibold text-(--sea-ink) transition disabled:opacity-50"
      >
        Export 3MF
      </button>
      {renderState.status === 'error' && renderState.error ? (
        <span
          title={renderState.error}
          className="max-w-xs truncate font-mono text-xs text-red-600"
        >
          {renderState.error}
        </span>
      ) : null}
    </div>
  )
}
