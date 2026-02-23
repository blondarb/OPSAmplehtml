'use client'

import { CPT_CODES } from '@/lib/follow-up/cptCodes'

export default function CptReference() {
  const tcmCodes = Object.values(CPT_CODES).filter((c) => c.program === 'tcm')
  const ccmCodes = Object.values(CPT_CODES).filter((c) => c.program === 'ccm')

  function CodeTable({ codes, title }: { codes: typeof tcmCodes; title: string }) {
    return (
      <div style={{ flex: '1 1 400px', minWidth: '300px' }}>
        <h4 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 10px' }}>{title}</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              {['Code', 'Name', 'Rate', 'Min', 'Provider'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '6px 8px', color: '#FBBF24', fontWeight: 600, fontFamily: 'monospace' }}>{c.code}</td>
                <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>
                  {c.name}
                  {c.isAddOn && <span style={{ marginLeft: 4, fontSize: '0.65rem', color: '#94a3b8' }}>(add-on)</span>}
                </td>
                <td style={{ padding: '6px 8px', color: '#4ADE80', fontFamily: 'monospace' }}>${c.rate.toFixed(2)}</td>
                <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{c.minMinutes > 0 ? `${c.minMinutes}m` : '—'}</td>
                <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '0.75rem' }}>{c.whoProvides}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
    }}>
      <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 16px' }}>
        CPT Code Reference (2025 CMS Rates)
      </h3>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <CodeTable codes={tcmCodes} title="TCM Codes" />
        <CodeTable codes={ccmCodes} title="CCM Codes" />
      </div>
    </div>
  )
}
