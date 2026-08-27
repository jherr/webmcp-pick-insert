import { Trash2 } from 'lucide-react'
import { designActions, type Slot } from '@/store/design-store'
import {
  PICK_TYPES,
  THICKNESS_PRESETS,
  type PickTypeName,
} from '@/model/pick-types'
import { PickThumbnail } from './PickThumbnail'

export function SlotRow({
  index,
  slot,
  canRemove,
}: {
  index: number
  slot: Slot
  canRemove: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-(--line) bg-(--chip-bg) px-3 py-2">
      <span className="w-5 shrink-0 text-center font-mono text-xs text-(--sea-ink-soft)">
        {index + 1}
      </span>
      <PickThumbnail pick={slot.pick} />
      <label className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
          Shape
        </span>
        <select
          value={slot.pick}
          onChange={(e) =>
            designActions.updateSlot(index, {
              pick: e.target.value as PickTypeName,
            })
          }
          className="w-full min-w-0 rounded-md border border-(--line) bg-(--bg-base) px-2 py-1.5 text-sm text-(--sea-ink)"
        >
          {PICK_TYPES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex w-24 shrink-0 flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
          Thickness
        </span>
        <div className="relative">
          <input
            type="number"
            min={0.3}
            max={3}
            step={0.01}
            value={slot.thickness}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) {
                designActions.updateSlot(index, { thickness: n })
              }
            }}
            list={`thickness-presets-${index}`}
            className="w-full rounded-md border border-(--line) bg-(--bg-base) py-1.5 pl-2 pr-7 font-mono text-sm text-(--sea-ink)"
          />
          <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] text-(--sea-ink-soft)">
            mm
          </span>
          <datalist id={`thickness-presets-${index}`}>
            {THICKNESS_PRESETS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </label>
      <button
        type="button"
        disabled={!canRemove}
        onClick={() => designActions.removeSlot(index)}
        aria-label="Remove slot"
        title={canRemove ? 'Remove slot' : 'At least one slot is required'}
        className="shrink-0 rounded-md p-2 text-(--sea-ink-soft) transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-(--sea-ink-soft)"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
