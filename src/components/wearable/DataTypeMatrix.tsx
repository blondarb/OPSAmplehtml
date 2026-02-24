'use client'

interface DataTypeRow {
  dataType: string
  samsung: boolean
  apple: boolean
  oura: boolean
}

const DATA_TYPE_ROWS: DataTypeRow[] = [
  { dataType: 'Heart Rate',     samsung: true,  apple: true,  oura: true  },
  { dataType: 'HRV',            samsung: true,  apple: true,  oura: true  },
  { dataType: 'Steps',          samsung: true,  apple: true,  oura: false },
  { dataType: 'Sleep Stages',   samsung: true,  apple: true,  oura: true  },
  { dataType: 'Accelerometer',  samsung: true,  apple: true,  oura: false },
  { dataType: 'Gyroscope',      samsung: true,  apple: true,  oura: false },
  { dataType: 'SpO2',           samsung: true,  apple: true,  oura: true  },
]

const DEVICES = [
  { label: 'Samsung Galaxy Watch', status: 'live' as const },
  { label: 'Apple Watch', status: 'planned' as const },
  { label: 'Oura Ring', status: 'future' as const },
]

const statusDot: Record<string, string> = {
  live: '#10B981',
  planned: '#F59E0B',
  future: '#6B7280',
}

export default function DataTypeMatrix() {
  return (
    <div>
      {/* Section Header */}
      <h2 style={{
        color: '#fff',
        fontSize: '1.15rem',
        fontWeight: 700,
        margin: '0 0 6px',
      }}>
        Data Type Availability
      </h2>
      <p style={{
        color: '#94a3b8',
        fontSize: '0.85rem',
        margin: '0 0 20px',
      }}>
        Biometric data types supported by each device
      </p>

      {/* Table Container */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          <thead>
            <tr>
              <th style={{
                padding: '14px 20px',
                textAlign: 'left',
                color: '#94a3b8',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderBottom: '1px solid #334155',
                background: '#0f172a',
                letterSpacing: '0.3px',
                textTransform: 'uppercase',
              }}>
                Data Type
              </th>
              {DEVICES.map((device) => (
                <th key={device.label} style={{
                  padding: '14px 16px',
                  textAlign: 'center',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderBottom: '1px solid #334155',
                  background: '#0f172a',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: statusDot[device.status],
                      display: 'inline-block',
                    }} />
                    {device.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DATA_TYPE_ROWS.map((row, idx) => (
              <tr key={row.dataType} style={{
                background: idx % 2 === 0 ? '#1e293b' : '#1a2536',
              }}>
                <td style={{
                  padding: '12px 20px',
                  color: '#cbd5e1',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  borderBottom: idx < DATA_TYPE_ROWS.length - 1 ? '1px solid #334155' : 'none',
                }}>
                  {row.dataType}
                </td>
                {[row.samsung, row.apple, row.oura].map((available, colIdx) => (
                  <td key={colIdx} style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    borderBottom: idx < DATA_TYPE_ROWS.length - 1 ? '1px solid #334155' : 'none',
                  }}>
                    {available ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span style={{
                        color: '#475569',
                        fontSize: '1rem',
                        fontWeight: 500,
                      }}>
                        &mdash;
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
