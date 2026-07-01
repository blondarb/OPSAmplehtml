'use client'

/**
 * Renders one acoustic-biomarker panel. Reuses the SDNE flag theme so it reads
 * as part of the same exam family. Phase A scaffold (2026-06-30).
 */

import { SDNEFlagChip } from '@/components/sdne/SDNEFlagChip'
import { VOICE_TASK_LABELS, type BiomarkerPanel } from '@/lib/voice/types'

export function SpeechBiomarkerCard({ panel }: { panel: BiomarkerPanel }) {
  const { meta } = panel

  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 16,
        background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {VOICE_TASK_LABELS[panel.task]}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            {meta.durationSeconds.toFixed(1)}s · voiced {Math.round(meta.voicedFraction * 100)}% · {meta.engine}
          </div>
        </div>
        <SDNEFlagChip flag={panel.overallFlag} size="medium" />
      </div>

      {/* QC banners */}
      {meta.tooShort && (
        <Banner color="#A16207" bg="#FEFCE8" border="#FEF08A">
          Signal too short / too little voicing for a reliable estimate — re-record.
        </Banner>
      )}
      {meta.clipped && (
        <Banner color="#B91C1C" bg="#FEF2F2" border="#FECACA">
          Recording clipped (too loud) — lower input level and re-record for valid loudness.
        </Banner>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {panel.features.map(f => (
            <tr key={f.key} style={{ borderTop: '1px solid #F3F4F6' }}>
              <td style={{ padding: '8px 0', color: '#374151' }}>
                {f.label}
                {f.approximate && (
                  <span
                    title="Approximate — a Praat-grade engine measures this more reliably"
                    style={{ marginLeft: 6, fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}
                  >
                    ≈
                  </span>
                )}
                {f.note && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{f.note}</div>}
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827', whiteSpace: 'nowrap' }}>
                {f.value === null ? '—' : `${f.value}${f.unit ? ' ' + f.unit : ''}`}
              </td>
              <td style={{ padding: '8px 0', textAlign: 'right', width: 88 }}>
                <SDNEFlagChip flag={f.flag} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 11, color: '#9CA3AF', lineHeight: 1.5 }}>
        Screening signal for clinician review — not a diagnosis. Features marked ≈ are
        approximations pending a Praat-grade engine.
      </div>
    </div>
  )
}

function Banner({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, color, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10 }}>
      {children}
    </div>
  )
}
