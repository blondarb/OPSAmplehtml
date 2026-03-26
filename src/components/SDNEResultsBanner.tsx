'use client'

import { Activity, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'

interface SDNESessionResult {
  sdne_session_id: string
  session_flag: string
  domain_flags: Record<string, unknown>
  detected_patterns: string[]
  completed_at?: string
}

interface SDNEResultsBannerProps {
  result: SDNESessionResult
  consultId?: string | null
  linkStatus?: 'idle' | 'linking' | 'linked' | 'error'
  linkError?: string | null
}

export default function SDNEResultsBanner({
  result,
  consultId,
  linkStatus = 'idle',
  linkError,
}: SDNEResultsBannerProps) {
  const flagColor = result.session_flag === 'normal'
    ? '#22c55e'
    : result.session_flag === 'abnormal'
      ? '#eab308'
      : result.session_flag === 'critical'
        ? '#ef4444'
        : '#3b82f6'

  const domainCount = Object.keys(result.domain_flags).length
  const patternCount = result.detected_patterns.length

  return (
    <div style={{
      margin: '0 24px 16px',
      padding: '14px 20px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: `1px solid ${flagColor}33`,
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Icon */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: `${flagColor}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Activity size={20} color={flagColor} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px',
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#e2e8f0',
          }}>
            SDNE Results Available
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '6px',
            background: `${flagColor}20`,
            color: flagColor,
            textTransform: 'uppercase',
          }}>
            {result.session_flag}
          </span>
        </div>
        <div style={{
          fontSize: '12px',
          color: '#94a3b8',
        }}>
          {domainCount} domain{domainCount !== 1 ? 's' : ''} assessed
          {patternCount > 0 && ` \u00b7 ${patternCount} pattern${patternCount !== 1 ? 's' : ''} detected`}
          {result.completed_at && ` \u00b7 ${new Date(result.completed_at).toLocaleTimeString()}`}
        </div>
      </div>

      {/* Link status */}
      {consultId && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          fontWeight: 500,
          flexShrink: 0,
        }}>
          {linkStatus === 'linking' && (
            <span style={{ color: '#94a3b8' }}>Linking...</span>
          )}
          {linkStatus === 'linked' && (
            <>
              <CheckCircle size={14} color="#22c55e" />
              <span style={{ color: '#22c55e' }}>Linked to consult</span>
            </>
          )}
          {linkStatus === 'error' && (
            <>
              <AlertCircle size={14} color="#ef4444" />
              <span style={{ color: '#ef4444' }} title={linkError || undefined}>
                Link failed
              </span>
            </>
          )}
        </div>
      )}

      {/* View results link */}
      <a
        href={`/sdne?session=${result.sdne_session_id}${consultId ? `&consult=${consultId}` : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 12px',
          borderRadius: '8px',
          background: `${flagColor}15`,
          border: `1px solid ${flagColor}30`,
          color: flagColor,
          fontSize: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        View Results
        <ExternalLink size={12} />
      </a>
    </div>
  )
}
