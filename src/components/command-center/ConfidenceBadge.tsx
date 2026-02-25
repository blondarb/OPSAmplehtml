import type { Confidence } from '@/lib/command-center/types'

interface ConfidenceBadgeProps {
  confidence: Confidence
}

const BADGE_STYLES: Record<Confidence, { background: string; color: string; border: string }> = {
  high: { background: '#052e16', color: '#22C55E', border: '#166534' },
  medium: { background: '#422006', color: '#EAB308', border: '#854d0e' },
  low: { background: '#431407', color: '#F97316', border: '#9a3412' },
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const style = BADGE_STYLES[confidence]

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.7rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: '99px',
        background: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
        lineHeight: 1.4,
        letterSpacing: '0.02em',
      }}
    >
      {confidence}
    </span>
  )
}
