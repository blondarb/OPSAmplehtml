'use client'

import { SDNEFlag, SDNE_FLAG_LABELS, SDNE_FLAG_THEME, SDNE_FLAG_KEY } from '@/lib/sdneTypes'

interface SDNEFlagChipProps {
  flag: SDNEFlag
  showLabel?: boolean
  size?: 'small' | 'medium'
}

/**
 * Flag status chip component for SDNE exam results
 * Displays GREEN/YELLOW/RED/INVALID status with appropriate colors
 */
export function SDNEFlagChip({ flag, showLabel = true, size = 'small' }: SDNEFlagChipProps) {
  const colors = SDNE_FLAG_THEME[SDNE_FLAG_KEY[flag]]
  const label = showLabel ? SDNE_FLAG_LABELS[flag] : flag

  const sizeClasses = size === 'small'
    ? 'text-xs px-2 py-0.5 min-w-[52px]'
    : 'text-sm px-3 py-1 min-w-[72px]'

  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
      className={`inline-flex items-center justify-center rounded font-semibold ${sizeClasses}`}
    >
      {label}
    </span>
  )
}
