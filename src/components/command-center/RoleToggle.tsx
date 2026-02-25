'use client'

interface RoleToggleProps {
  value: 'my_patients' | 'all_patients'
  onChange: (mode: 'my_patients' | 'all_patients') => void
}

const OPTIONS: { key: 'my_patients' | 'all_patients'; label: string }[] = [
  { key: 'my_patients', label: 'By Provider' },
  { key: 'all_patients', label: 'All Patients' },
]

export default function RoleToggle({ value, onChange }: RoleToggleProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: '#1e293b',
        borderRadius: '8px',
        padding: '2px',
      }}
    >
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              background: isActive ? '#4F46E5' : 'transparent',
              color: isActive ? '#ffffff' : '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: 500,
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: isActive ? 'default' : 'pointer',
              transition: 'background-color 0.2s ease',
              lineHeight: 1.4,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
