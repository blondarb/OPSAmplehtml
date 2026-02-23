'use client'

import StatCard from './StatCard'
import BillingGuide from './BillingGuide'
import BillingEntryCard from './BillingEntryCard'
import CptReference from './CptReference'
import type { BillingEntry, BillingMonthlySummary } from '@/lib/follow-up/billingTypes'

interface BillingWorksheetProps {
  entries: BillingEntry[]
  summary: BillingMonthlySummary
  onUpdateEntry: (id: string, updates: Partial<BillingEntry>) => void
  onExport: (format: 'csv' | 'pdf') => void
}

export default function BillingWorksheet({ entries, summary, onUpdateEntry, onExport }: BillingWorksheetProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Monthly Summary */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <StatCard label="Total Sessions" value={summary.totalSessions} color="#F59E0B" />
        <StatCard label="Billable" value={summary.billableSessions} color="#16A34A" />
        <StatCard label="Total Time" value={`${summary.totalBillableMinutes}m`} color="#3B82F6" />
        <StatCard label="Est. Revenue" value={`$${summary.estimatedRevenue.toLocaleString()}`} color="#8B5CF6" />
      </div>

      {/* Export Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => onExport('csv')}
          style={{
            padding: '8px 16px',
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          📥 Export CSV
        </button>
        <button
          onClick={() => onExport('pdf')}
          style={{
            padding: '8px 16px',
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          📄 Export Report
        </button>
      </div>

      {/* Billing Guide */}
      <BillingGuide />

      {/* Entries */}
      {entries.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#64748b',
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid #334155',
        }}>
          No billing entries for this month. Complete a follow-up session to generate one.
        </div>
      ) : (
        entries.map((entry) => (
          <BillingEntryCard
            key={entry.id}
            entry={entry}
            onUpdate={(updates) => onUpdateEntry(entry.id, updates)}
          />
        ))
      )}

      {/* CPT Reference */}
      <CptReference />
    </div>
  )
}
