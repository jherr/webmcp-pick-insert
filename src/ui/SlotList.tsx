import { useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import { designActions, designStore } from '@/store/design-store'
import {
  DEFAULT_THICKNESS,
  MAX_SLOTS,
  THICKNESS_PRESETS,
} from '@/model/pick-types'
import { SlotRow } from './SlotRow'
import { FitReportPanel } from './FitReportPanel'

export function SlotList({ className = '' }: { className?: string }) {
  const slots = useSelector(designStore, (s) => s.slots)
  const [bulkThickness, setBulkThickness] = useState(DEFAULT_THICKNESS)

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-(--sea-ink)">
          Pick slots
        </h2>
        <p className="mt-1 text-xs text-(--sea-ink-soft)">
          Each row is one slanted slot in the Altoids tin insert. Choose the
          pick shape and thickness. Add or remove slots until they fit.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
            Set all thickness
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0.3}
              max={3}
              step={0.01}
              value={bulkThickness}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setBulkThickness(n)
              }}
              list="bulk-thickness-presets"
              className="w-20 rounded-md border border-(--line) bg-(--bg-base) px-2 py-1.5 font-mono text-sm text-(--sea-ink)"
            />
            <datalist id="bulk-thickness-presets">
              {THICKNESS_PRESETS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => designActions.setAllThickness(bulkThickness)}
              className="rounded-md border border-(--line) bg-(--chip-bg) px-2.5 py-1.5 text-xs font-semibold text-(--sea-ink)"
            >
              Apply
            </button>
          </div>
        </label>
        <button
          type="button"
          onClick={() => designActions.resetDesign()}
          className="rounded-md border border-(--line) px-2.5 py-1.5 text-xs font-semibold text-(--sea-ink-soft)"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {slots.map((slot, index) => (
          <SlotRow
            key={index}
            index={index}
            slot={slot}
            canRemove={slots.length > 1}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={slots.length >= MAX_SLOTS}
        onClick={() => designActions.addSlot()}
        className="rounded-lg border border-dashed border-(--line) px-3 py-2 text-sm font-semibold text-(--lagoon-deep) transition hover:bg-[rgba(79,184,178,0.12)] disabled:opacity-40"
      >
        {slots.length >= MAX_SLOTS
          ? `Maximum ${MAX_SLOTS} slots`
          : 'Add pick'}
      </button>

      <FitReportPanel />
    </div>
  )
}
