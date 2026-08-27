import { svgPathFor } from '@/model/profiles'
import type { PickTypeName } from '@/model/pick-types'

export function PickThumbnail({
  pick,
  className = '',
}: {
  pick: PickTypeName
  className?: string
}) {
  const d = svgPathFor(pick)
  return (
    <svg
      viewBox="-0.55 -0.55 1.1 1.1"
      className={`h-8 w-8 shrink-0 text-(--lagoon-deep) ${className}`}
      aria-hidden
    >
      <path d={d} fill="currentColor" fillOpacity={0.85} />
    </svg>
  )
}
