interface SourceBadgeProps {
  source: string
}

const SOURCE_STYLES: Record<string, { color: string; background: string; border: string }> = {
  sevaro: { color: '#0D9488', background: '#042f2e', border: '#115e59' },
  ehr: { color: '#94a3b8', background: '#1e293b', border: '#334155' },
  wearable: { color: '#0EA5E9', background: '#082f49', border: '#0c4a6e' },
}

const FALLBACK_STYLE = { color: '#94a3b8', background: '#1e293b', border: '#334155' }

export default function SourceBadge({ source }: SourceBadgeProps) {
  const style = SOURCE_STYLES[source] || FALLBACK_STYLE

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.65rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: '4px',
        color: style.color,
        background: style.background,
        border: `1px solid ${style.border}`,
        lineHeight: 1.4,
        letterSpacing: '0.02em',
      }}
    >
      {source}
    </span>
  )
}
