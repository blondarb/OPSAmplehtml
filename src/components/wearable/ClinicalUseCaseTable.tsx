'use client'

import { useState } from 'react'
import { CLINICAL_USE_CASES } from '@/lib/wearable/types'
import UseCaseDetailPanel from './UseCaseDetailPanel'

const DIAGNOSIS_COLORS: Record<string, string> = {
  "Parkinson's Disease": '#F97316',
  'Epilepsy': '#EF4444',
  'Multiple Sclerosis': '#A855F7',
  'Migraine': '#EC4899',
  'Essential Tremor': '#F59E0B',
  'Restless Leg Syndrome': '#3B82F6',
  'Narcolepsy': '#14B8A6',
  'Peripheral Neuropathy': '#10B981',
}

export default function ClinicalUseCaseTable() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const handleRowClick = (index: number) => {
    setSelectedIndex(selectedIndex === index ? null : index)
  }

  const headerCellStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'left' as const,
    borderBottom: '1px solid #334155',
    backgroundColor: '#0F172A',
  }

  return (
    <div>
      {/* Section Header */}
      <div style={{ marginBottom: '16px' }}>
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#F1F5F9',
            margin: 0,
          }}
        >
          Clinical Use Cases
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: '#94A3B8',
            margin: '4px 0 0 0',
          }}
        >
          8 neurological conditions supported in Phase 1
        </p>
      </div>

      {/* Table */}
      <div
        style={{
          borderRadius: '12px',
          border: '1px solid #334155',
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#0F172A',
          }}
        >
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '16%' }}>Diagnosis</th>
              <th style={{ ...headerCellStyle, width: '22%' }}>Wearable Signal</th>
              <th style={{ ...headerCellStyle, width: '24%' }}>What AI Detects</th>
              <th style={{ ...headerCellStyle, width: '20%' }}>Alert Trigger</th>
              <th style={{ ...headerCellStyle, width: '18%' }}>Suggested Action</th>
            </tr>
          </thead>
          {CLINICAL_USE_CASES.map((useCase, index) => {
              const isSelected = selectedIndex === index
              const accentColor = DIAGNOSIS_COLORS[useCase.diagnosis] || '#64748B'

              return (
                <tbody key={useCase.diagnosis}>
                  <tr
                    onClick={() => handleRowClick(index)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#1E293B' : 'transparent',
                      borderLeft: isSelected
                        ? `3px solid ${accentColor}`
                        : '3px solid transparent',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#1a2236'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    {/* Diagnosis */}
                    <td
                      style={{
                        padding: '14px 16px',
                        borderBottom: isSelected ? 'none' : '1px solid #1E293B',
                        verticalAlign: 'top',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '18px',
                            borderRadius: '2px',
                            backgroundColor: accentColor,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#F1F5F9',
                          }}
                        >
                          {useCase.diagnosis}
                        </span>
                      </div>
                    </td>

                    {/* Wearable Signal */}
                    <td
                      style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#CBD5E1',
                        lineHeight: '1.5',
                        borderBottom: isSelected ? 'none' : '1px solid #1E293B',
                        verticalAlign: 'top',
                      }}
                    >
                      {useCase.wearable_signal}
                    </td>

                    {/* What AI Detects */}
                    <td
                      style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#CBD5E1',
                        lineHeight: '1.5',
                        borderBottom: isSelected ? 'none' : '1px solid #1E293B',
                        verticalAlign: 'top',
                      }}
                    >
                      {useCase.anomaly_to_detect}
                    </td>

                    {/* Alert Trigger */}
                    <td
                      style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#CBD5E1',
                        lineHeight: '1.5',
                        borderBottom: isSelected ? 'none' : '1px solid #1E293B',
                        verticalAlign: 'top',
                      }}
                    >
                      {useCase.alert_trigger}
                    </td>

                    {/* Suggested Action */}
                    <td
                      style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#CBD5E1',
                        lineHeight: '1.5',
                        borderBottom: isSelected ? 'none' : '1px solid #1E293B',
                        verticalAlign: 'top',
                      }}
                    >
                      {useCase.suggested_action}
                    </td>
                  </tr>

                  {/* Expanded Detail Panel */}
                  {isSelected && <UseCaseDetailPanel useCase={useCase} />}
                </tbody>
              )
            })}
        </table>
      </div>
    </div>
  )
}
