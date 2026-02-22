'use client'

import type { TranscriptEntry } from '@/lib/follow-up/types'

interface MessageBubbleProps {
  entry: TranscriptEntry
  isLatest: boolean
}

function formatTimestamp(ts: number): string {
  const totalSeconds = Math.floor(ts / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function MessageBubble({ entry, isLatest }: MessageBubbleProps) {
  const isAgent = entry.role === 'agent'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isAgent ? 'flex-start' : 'flex-end',
      maxWidth: '80%',
      alignSelf: isAgent ? 'flex-start' : 'flex-end',
    }}>
      {/* Role label */}
      <div style={{
        fontSize: '11px',
        color: '#64748b',
        marginBottom: '4px',
        paddingLeft: isAgent ? '4px' : '0',
        paddingRight: isAgent ? '0' : '4px',
      }}>
        {isAgent ? 'AI Agent' : 'Patient'}
      </div>

      {/* Bubble */}
      <div style={{
        padding: '12px 16px',
        borderRadius: '12px',
        background: isAgent ? '#334155' : '#16A34A',
        color: 'white',
        fontSize: '14px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {entry.text}

        {/* Pulsing dots for latest agent message */}
        {isLatest && isAgent && (
          <span style={{
            display: 'inline-flex',
            gap: '3px',
            marginLeft: '8px',
            verticalAlign: 'middle',
          }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: '#94a3b8',
                  display: 'inline-block',
                  animation: `followUpPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
            <style>{`
              @keyframes followUpPulse {
                0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                40% { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </span>
        )}
      </div>

      {/* Timestamp */}
      <div style={{
        fontSize: '10px',
        color: '#64748b',
        marginTop: '4px',
        paddingLeft: isAgent ? '4px' : '0',
        paddingRight: isAgent ? '0' : '4px',
      }}>
        {formatTimestamp(entry.timestamp)}
      </div>
    </div>
  )
}
