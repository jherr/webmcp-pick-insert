/**
 * Project name and STL export.
 *
 * Renders happen automatically (see render-controller); the spinner is the
 * only in-progress affordance. The preview picks come back as their own mesh,
 * so `render.stl` is always the insert alone and always safe to export.
 */
import { useSelector } from '@tanstack/react-store'
import {
  designActions,
  designStore,
  sanitizeProjectFileName,
} from '@/store/design-store'
import { renderNow } from '@/store/render-controller'

function downloadStl(stl: Uint8Array, fileName: string) {
  const blob = new Blob([stl as BlobPart], { type: 'model/stl' })
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

  const isRendering = renderState.status === 'pending'

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    designActions.setProjectName(e.target.value)
  }

  const handleExport = async () => {
    let stl = renderState.stl
    if (renderState.status !== 'success' || !stl) {
      const outcome = await renderNow()
      if (!outcome.ok) return
      stl = designStore.state.render.stl
    }
    if (!stl) return
    const fileName = `${sanitizeProjectFileName(projectName || 'altoids-pick-insert')}.stl`
    downloadStl(stl, fileName)
    designActions.pushHistory({
      kind: 'export',
      summary: `exported ${fileName} (${stl.byteLength} bytes)`,
    })
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
          title="Project name — becomes the exported STL filename"
          className="w-48 border-b border-(--line) bg-transparent px-1 py-1 font-mono text-sm normal-case tracking-normal text-(--sea-ink) outline-none transition placeholder:text-(--sea-ink-soft) hover:border-(--sea-ink-soft) focus:border-(--lagoon-deep)"
        />
      </label>
      {isRendering ? <Spinner /> : null}
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={isRendering}
        title={`Download as ${sanitizeProjectFileName(projectName || 'altoids-pick-insert')}.stl`}
        className="rounded-full border border-(--line) bg-(--chip-bg) px-4 py-2 text-sm font-semibold text-(--sea-ink) transition disabled:opacity-50"
      >
        Export STL
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
