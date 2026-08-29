/**
 * Color pickers for the tray, the comb, and the pick overlay.
 *
 * Tray and comb are the two filaments of the 3MF; the pick color is only ever
 * on screen. None of the three touches the geometry, so changing one repaints
 * the preview without a re-render.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { useSelector } from '@tanstack/react-store'
import { designActions, designStore } from '@/store/design-store'
import { COLOR_PARTS, type ColorPart } from '@/model/colors'

function ColorRow({
  part,
  label,
  hint,
  value,
  open,
  onToggle,
  onClose,
}: {
  part: ColorPart
  label: string
  hint: string
  value: string
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pickerId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return
      }
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div
      title={hint}
      className="relative flex items-center gap-3 rounded-lg border border-(--line) bg-(--chip-bg) px-3 py-2"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label} color`}
        aria-expanded={open}
        aria-controls={pickerId}
        onClick={onToggle}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-(--line) shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
        style={{ backgroundColor: value }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-(--sea-ink)">
        {label}
      </span>
      <HexColorInput
        color={value}
        onChange={(hex) => designActions.setColor(part, hex)}
        prefixed
        spellCheck={false}
        aria-label={`${label} color hex`}
        className="w-24 shrink-0 rounded-md border border-(--line) bg-(--bg-base) px-2 py-1.5 font-mono text-sm text-(--sea-ink)"
      />
      {open ? (
        <div
          ref={panelRef}
          id={pickerId}
          role="dialog"
          aria-label={`${label} color picker`}
          className="color-picker absolute top-1/2 left-full z-30 ml-3 -translate-y-1/2 rounded-xl border border-(--line) bg-(--surface-strong) p-3 shadow-[0_16px_40px_rgba(23,58,64,0.18)]"
        >
          <HexColorPicker
            color={value}
            onChange={(hex) => designActions.setColor(part, hex)}
          />
        </div>
      ) : null}
    </div>
  )
}

export function ColorControls({ className = '' }: { className?: string }) {
  const colors = useSelector(designStore, (s) => s.colors)
  const [openPart, setOpenPart] = useState<ColorPart | null>(null)
  const closePicker = useCallback(() => setOpenPart(null), [])

  return (
    <div className={`relative z-10 flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-(--sea-ink)">
          Colors
        </h2>
        <button
          type="button"
          onClick={() => {
            closePicker()
            designActions.resetColors()
          }}
          className="rounded-md border border-(--line) px-2.5 py-1 text-xs font-semibold text-(--sea-ink-soft)"
        >
          Reset
        </button>
      </div>
      <p className="text-xs text-(--sea-ink-soft)">
        Tray and comb are the two filaments in the exported 3MF. The pick color
        is preview only.
      </p>
      {COLOR_PARTS.map(({ part, label, hint }) => (
        <ColorRow
          key={part}
          part={part}
          label={label}
          hint={hint}
          value={colors[part]}
          open={openPart === part}
          onToggle={() => setOpenPart((current) => (current === part ? null : part))}
          onClose={closePicker}
        />
      ))}
    </div>
  )
}
