import { useSelector } from '@tanstack/react-store'
import { designStore } from '@/store/design-store'

export function FitReportPanel() {
  const fit = useSelector(designStore, (s) => s.fit)
  const render = useSelector(designStore, (s) => s.render)

  if (render.status === 'error' && render.error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        <div className="font-semibold">Does not fit</div>
        <p className="mt-1 text-xs leading-relaxed">{render.error}</p>
      </div>
    )
  }

  if (!fit || render.status !== 'success') {
    if (render.status === 'pending') {
      return (
        <div className="rounded-lg border border-(--line) bg-(--chip-bg) p-3 text-xs text-(--sea-ink-soft)">
          Rendering…
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-lg border border-(--line) bg-(--chip-bg) p-3 text-xs text-(--sea-ink)">
      <div className="font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
        Fit
      </div>
      {fit.footprint ? (
        <p className="mt-1 font-mono">{fit.footprint}</p>
      ) : null}
      {fit.leanUsed != null ? (
        <p className="mt-1">
          Lean {fit.leanUsed}°
          {fit.leanAsked != null && fit.leanUsed > fit.leanAsked
            ? ` (asked ${fit.leanAsked}°; ${fit.tallest} needs ${fit.leanNeeded}°)`
            : null}
        </p>
      ) : null}
      {fit.slots.some((s) => s.through) ? (
        <p className="mt-1 text-(--sea-ink-soft)">
          {fit.slots.filter((s) => s.through).length} slot
          {fit.slots.filter((s) => s.through).length === 1 ? '' : 's'} open
          through the floor so the pick rests on the tin.
        </p>
      ) : null}
    </div>
  )
}
