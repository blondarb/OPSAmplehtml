'use client'

export default function ConceptHero() {
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '32px',
    }}>
      {/* Section Title */}
      <h2 style={{
        color: '#fff',
        fontSize: '1.25rem',
        fontWeight: 700,
        margin: '0 0 8px',
        textAlign: 'center',
      }}>
        How It Works
      </h2>
      <p style={{
        color: '#94a3b8',
        fontSize: '0.85rem',
        margin: '0 0 32px',
        textAlign: 'center',
      }}>
        From wearable data to clinical action in three steps
      </p>

      {/* 3-Step Flow */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        {/* Step 1: Wearable Device */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          minWidth: '140px',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(14, 165, 233, 0.15)',
            border: '2px solid #0EA5E9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="3" />
              <path d="M9 12h1.5l1.5-3 1.5 6 1.5-3H17" />
            </svg>
          </div>
          <span style={{
            color: '#e2e8f0',
            fontSize: '0.85rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            Wearable Device
          </span>
          <span style={{
            color: '#64748b',
            fontSize: '0.75rem',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            HR, HRV, sleep, steps,
            <br />accelerometer, SpO2
          </span>
        </div>

        {/* Arrow 1 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          marginBottom: '40px',
        }}>
          <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
            <path d="M0 8h32" stroke="#475569" strokeWidth="2" strokeDasharray="4 3" />
            <path d="M28 3l7 5-7 5" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Step 2: AI Analysis */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          minWidth: '140px',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '2px solid #8B5CF6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11h-4V9.5C8.8 8.8 8 7.5 8 6a4 4 0 0 1 4-4z" />
              <path d="M10 11v2" />
              <path d="M14 11v2" />
              <rect x="8" y="13" width="8" height="4" rx="1" />
              <path d="M10 17v3" />
              <path d="M14 17v3" />
              <path d="M8 20h8" />
            </svg>
          </div>
          <span style={{
            color: '#e2e8f0',
            fontSize: '0.85rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            AI Analysis
          </span>
          <span style={{
            color: '#64748b',
            fontSize: '0.75rem',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            Pattern detection,
            <br />anomaly scoring
          </span>
        </div>

        {/* Arrow 2 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          marginBottom: '40px',
        }}>
          <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
            <path d="M0 8h32" stroke="#475569" strokeWidth="2" strokeDasharray="4 3" />
            <path d="M28 3l7 5-7 5" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Step 3: Clinical Alerts */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          minWidth: '140px',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '2px solid #10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              <circle cx="18" cy="4" r="3" fill="#10B981" stroke="none" />
            </svg>
          </div>
          <span style={{
            color: '#e2e8f0',
            fontSize: '0.85rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            Clinical Alerts
          </span>
          <span style={{
            color: '#64748b',
            fontSize: '0.75rem',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            Right alert, right person,
            <br />right time
          </span>
        </div>
      </div>

      {/* Concept Description */}
      <div style={{
        background: '#0f172a',
        borderRadius: '8px',
        padding: '20px 24px',
        marginBottom: '24px',
      }}>
        <p style={{
          color: '#cbd5e1',
          fontSize: '0.85rem',
          lineHeight: 1.7,
          margin: '0 0 12px',
        }}>
          Consumer wearable devices generate a continuous stream of biometric data between clinic visits.
          For neurology patients, this data can reveal subtle changes in heart rate variability, sleep
          architecture, activity levels, and movement patterns that correlate with disease progression or
          medication effects.
        </p>
        <p style={{
          color: '#cbd5e1',
          fontSize: '0.85rem',
          lineHeight: 1.7,
          margin: '0 0 12px',
        }}>
          Our AI engine analyzes each patient&apos;s data against their personal baseline, looking for
          clinically meaningful anomalies. When a pattern is detected, the system generates an
          appropriately routed alert: a gentle nudge to the patient, a notification to the triage team,
          or an urgent escalation to the neurologist.
        </p>
        <p style={{
          color: '#cbd5e1',
          fontSize: '0.85rem',
          lineHeight: 1.7,
          margin: 0,
        }}>
          This system now includes a live integration path: Apple Watch data flows through the Sevaro Monitor iOS companion app into Supabase, where the AI engine can analyze it against personal baselines. The demo patient shows 30 days of simulated Parkinson&apos;s data; live patients show real Apple Watch biometrics.
        </p>
      </div>

      {/* Value Prop Pills */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        justifyContent: 'center',
      }}>
        {[
          '24/7 Monitoring Between Visits',
          'AI-Detected Patterns',
          'Right Alert, Right Person, Right Time',
        ].map((label) => (
          <span
            key={label}
            style={{
              padding: '8px 18px',
              borderRadius: '20px',
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              color: '#7dd3fc',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* System Architecture */}
      <div style={{
        background: 'rgba(14, 165, 233, 0.05)',
        border: '1px solid rgba(14, 165, 233, 0.15)',
        borderRadius: '8px',
        padding: '24px',
        marginTop: '24px',
      }}>
        <h3 style={{
          color: '#e2e8f0',
          fontSize: '0.95rem',
          fontWeight: 700,
          margin: '0 0 4px',
          textAlign: 'center',
        }}>
          System Architecture
        </h3>
        <p style={{
          color: '#64748b',
          fontSize: '0.78rem',
          margin: '0 0 20px',
          textAlign: 'center',
        }}>
          How data flows from wrist to clinical insight
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: '0',
          flexWrap: 'wrap',
        }}>
          {/* Apple Watch */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '120px', maxWidth: '140px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(14, 165, 233, 0.15)', border: '2px solid #0EA5E9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="3" />
                <path d="M9 12h1.5l1.5-3 1.5 6 1.5-3H17" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>Apple Watch</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>
              HR every 5 min, HRV, SpO2, accelerometer, sleep stages
            </span>
          </div>

          <div style={{ padding: '0 4px', marginTop: '16px' }}>
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <path d="M0 6h16" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M14 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* HealthKit */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '120px', maxWidth: '140px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(255, 45, 85, 0.15)', border: '2px solid #FF2D55',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>HealthKit</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>
              Apple&apos;s on-device health data aggregation
            </span>
          </div>

          <div style={{ padding: '0 4px', marginTop: '16px' }}>
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <path d="M0 6h16" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M14 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Sevaro Monitor */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '120px', maxWidth: '140px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)', border: '2px solid #10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <line x1="12" y1="18" x2="12" y2="18.01" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>Sevaro Monitor</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>
              Daily HealthKit queries, tremor assessment, encrypted sync
            </span>
          </div>

          <div style={{ padding: '0 4px', marginTop: '16px' }}>
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <path d="M0 6h16" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M14 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Supabase */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '120px', maxWidth: '140px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(62, 207, 142, 0.15)', border: '2px solid #3ECF8E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3ECF8E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>Supabase</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>
              Patient profiles, daily summaries, baselines, anomalies
            </span>
          </div>

          <div style={{ padding: '0 4px', marginTop: '16px' }}>
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <path d="M0 6h16" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M14 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* AI Engine */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '120px', maxWidth: '140px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.15)', border: '2px solid #8B5CF6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11h-4V9.5C8.8 8.8 8 7.5 8 6a4 4 0 0 1 4-4z" />
                <rect x="8" y="13" width="8" height="4" rx="1" />
                <path d="M10 17v3" />
                <path d="M14 17v3" />
                <path d="M8 20h8" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>AI Engine (GPT-5.2)</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>
              Baseline comparison, trend analysis, anomaly detection, alert routing
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
