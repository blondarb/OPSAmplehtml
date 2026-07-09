'use client'

/**
 * VoiceProviderToggle
 *
 * A small segmented toggle that lets the PO switch between Nova Sonic and
 * OpenAI voice engines on the /consult AI Historian without editing env vars.
 *
 * Styling mirrors the established EmbeddedHistorian palette (teal primary,
 * slate neutrals, pill shapes, inline styles throughout).
 *
 * Props
 * ─────
 *  value     – currently selected provider
 *  onChange  – called when the user picks a different option
 *  disabled  – true while a session is live; shows the toggle greyed + tooltip
 *  className – optional extra wrapper class (e.g. for layout overrides)
 */

interface VoiceProviderToggleProps {
  value: 'nova' | 'openai'
  onChange: (p: 'nova' | 'openai') => void
  disabled?: boolean
  className?: string
}

const OPTIONS: { id: 'nova' | 'openai'; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'nova', label: 'Nova Sonic' },
]

export default function VoiceProviderToggle({
  value,
  onChange,
  disabled = false,
  className,
}: VoiceProviderToggleProps) {
  const containerTitle = disabled ? 'Applies to the next session' : undefined

  return (
    <div
      className={className}
      title={containerTitle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        opacity: disabled ? 0.45 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        Voice engine
      </span>

      {/* Segmented control */}
      <div
        role="group"
        aria-label="Voice engine"
        style={{
          display: 'flex',
          borderRadius: 6,
          border: '1px solid rgba(51,65,85,0.6)',
          overflow: 'hidden',
        }}
      >
        {OPTIONS.map((opt, index) => {
          const isActive = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              title={
                disabled
                  ? 'Applies to the next session'
                  : isActive
                    ? `${opt.label} selected`
                    : `Switch to ${opt.label}`
              }
              onClick={() => {
                if (!disabled) onChange(opt.id)
              }}
              style={{
                padding: '4px 10px',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: 'none',
                borderRight:
                  index < OPTIONS.length - 1 ? '1px solid rgba(51,65,85,0.6)' : 'none',
                background: isActive
                  ? 'rgba(13,148,136,0.15)'
                  : 'transparent',
                color: isActive ? '#5eead4' : '#64748b',
                transition: 'background 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
