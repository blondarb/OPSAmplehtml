'use client'

interface RightActionBarProps {
  openAiDrawer: (tab: string) => void
  onSave: () => void
}

export default function RightActionBar({ openAiDrawer, onSave }: RightActionBarProps) {
  const iconButtons = [
    { icon: 'M6 9V2h12v7 M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z', title: 'Print' },
    { icon: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8 M16 6l-4-4-4 4 M12 2v13', title: 'Share' },
    { icon: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', title: 'Bookmark' },
    { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: 'History' },
  ]

  return (
    <div style={{
      width: '60px',
      background: 'var(--bg-white)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px 8px',
      gap: '8px',
    }}>
      {/* Icon buttons */}
      {iconButtons.map((btn, idx) => (
        <button
          key={idx}
          title={btn.title}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={btn.icon}/>
          </svg>
        </button>
      ))}

      {/* AI Button */}
      <button
        onClick={() => openAiDrawer('chart-prep')}
        title="AI Tools"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          border: 'none',
          background: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'white',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
        </svg>
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Pend Button */}
      <button
        style={{
          padding: '10px 12px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--bg-white)',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          color: 'var(--text-secondary)',
        }}
      >
        PEND
      </button>

      {/* Sign Button */}
      <button
        onClick={onSave}
        style={{
          padding: '10px 8px',
          background: 'var(--primary)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '11px',
          fontWeight: 500,
          cursor: 'pointer',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
        }}
      >
        SIGN & CLOSE
      </button>
    </div>
  )
}
