import type { PatientUrgency } from '@/lib/command-center/types'

interface UrgencyIndicatorProps {
  urgency: PatientUrgency
}

const URGENCY_COLORS: Record<PatientUrgency, string> = {
  urgent: '#EF4444',
  attention: '#F59E0B',
  watch: '#EAB308',
  stable: '#22C55E',
}

export default function UrgencyIndicator({ urgency }: UrgencyIndicatorProps) {
  return (
    <div
      aria-label={`${urgency} urgency`}
      style={{
        width: '4px',
        minHeight: '100%',
        borderRadius: '2px',
        background: URGENCY_COLORS[urgency],
        flexShrink: 0,
      }}
    />
  )
}
