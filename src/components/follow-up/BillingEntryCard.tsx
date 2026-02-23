'use client'

import { CPT_CODES, suggestCptCode } from '@/lib/follow-up/cptCodes'
import type { BillingEntry } from '@/lib/follow-up/billingTypes'

interface BillingEntryCardProps {
  entry: BillingEntry
  onUpdate: (updates: Partial<BillingEntry>) => void
}

const statusColors: Record<string, string> = {
  not_reviewed: '#64748b',
  pending_review: '#F59E0B',
  ready_to_bill: '#16A34A',
  billed: '#3B82F6',
}

const statusLabels: Record<string, string> = {
  not_reviewed: 'Not Reviewed',
  pending_review: 'Pending Review',
  ready_to_bill: 'Ready to Bill',
  billed: 'Billed',
}

export default function BillingEntryCard({ entry, onUpdate }: BillingEntryCardProps) {
  const suggestedCpt = suggestCptCode(entry.program, entry.total_minutes)
  const cptDef = CPT_CODES[entry.cpt_code]

  function handleTimeChange(field: string, value: string) {
    const numVal = Math.max(0, parseInt(value) || 0)
    const updates: Record<string, number | boolean | string> = { [field]: numVal }

    // Recompute totals
    const prep = field === 'prep_minutes' ? numVal : entry.prep_minutes
    const call = entry.call_minutes // read-only
    const doc = field === 'documentation_minutes' ? numVal : entry.documentation_minutes
    const coord = field === 'coordination_minutes' ? numVal : entry.coordination_minutes
    const total = prep + call + doc + coord
    updates.total_minutes = total

    const newCpt = suggestCptCode(entry.program, total)
    updates.cpt_code = newCpt
    updates.cpt_rate = CPT_CODES[newCpt]?.rate || 0
    updates.meets_threshold = total >= (CPT_CODES[newCpt]?.minMinutes || 20)

    onUpdate(updates)
  }

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>{entry.patient_name}</span>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem', marginLeft: '12px' }}>{entry.service_date}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {entry.follow_up_method && (
            <span style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '0.7rem',
              fontWeight: 600,
              background: entry.follow_up_method === 'voice' ? 'rgba(59,130,246,0.2)' : 'rgba(22,163,74,0.2)',
              color: entry.follow_up_method === 'voice' ? '#60A5FA' : '#4ADE80',
            }}>
              {entry.follow_up_method.toUpperCase()}
            </span>
          )}
          <span style={{
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.7rem',
            fontWeight: 600,
            background: `${statusColors[entry.billing_status]}22`,
            color: statusColors[entry.billing_status],
          }}>
            {statusLabels[entry.billing_status] || entry.billing_status}
          </span>
        </div>
      </div>

      {/* Program & CPT */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Program</label>
          <select
            value={entry.program}
            onChange={(e) => onUpdate({ program: e.target.value as 'tcm' | 'ccm' })}
            style={{
              padding: '6px 10px',
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '0.85rem',
            }}
          >
            <option value="ccm">CCM</option>
            <option value="tcm">TCM</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
            CPT Code {entry.cpt_code !== suggestedCpt && <span style={{ color: '#F59E0B' }}>(suggested: {suggestedCpt})</span>}
          </label>
          <select
            value={entry.cpt_code}
            onChange={(e) => {
              const code = e.target.value
              onUpdate({ cpt_code: code, cpt_rate: CPT_CODES[code]?.rate || 0 })
            }}
            style={{
              padding: '6px 10px',
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '0.85rem',
            }}
          >
            {Object.values(CPT_CODES)
              .filter((c) => c.program === entry.program)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} (${c.rate.toFixed(2)})
                </option>
              ))}
          </select>
        </div>
        {cptDef && (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'flex-end', paddingBottom: '4px' }}>
            Rate: <span style={{ color: '#4ADE80', fontWeight: 600 }}>${cptDef.rate.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Time Breakdown */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>Time Breakdown (minutes)</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 80px 80px', gap: '6px 12px', alignItems: 'center', fontSize: '0.85rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>Phase</span>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>Suggested</span>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>Actual</span>

          <span style={{ color: '#cbd5e1' }}>Prep</span>
          <span style={{ color: '#64748b' }}>2</span>
          <input
            type="number"
            min={0}
            value={entry.prep_minutes}
            onChange={(e) => handleTimeChange('prep_minutes', e.target.value)}
            style={{ width: '70px', padding: '4px 8px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', fontSize: '0.85rem' }}
          />

          <span style={{ color: '#cbd5e1' }}>Call Oversight</span>
          <span style={{ color: '#64748b' }}>{entry.call_minutes}</span>
          <span style={{ color: '#94a3b8', padding: '4px 8px' }}>{entry.call_minutes}</span>

          <span style={{ color: '#cbd5e1' }}>Documentation Review</span>
          <span style={{ color: '#64748b' }}>5</span>
          <input
            type="number"
            min={0}
            value={entry.documentation_minutes}
            onChange={(e) => handleTimeChange('documentation_minutes', e.target.value)}
            style={{ width: '70px', padding: '4px 8px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', fontSize: '0.85rem' }}
          />

          <span style={{ color: '#cbd5e1' }}>Coordination</span>
          <span style={{ color: '#64748b' }}>{entry.escalation_level === 'urgent' || entry.escalation_level === 'same_day' ? 10 : 0}</span>
          <input
            type="number"
            min={0}
            value={entry.coordination_minutes}
            onChange={(e) => handleTimeChange('coordination_minutes', e.target.value)}
            style={{ width: '70px', padding: '4px 8px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', fontSize: '0.85rem' }}
          />

          <span style={{ color: '#fff', fontWeight: 600 }}>Total</span>
          <span />
          <span style={{
            color: entry.meets_threshold ? '#4ADE80' : '#FBBF24',
            fontWeight: 700,
            padding: '4px 8px',
          }}>
            {entry.total_minutes}m {entry.meets_threshold ? '✓' : '⚠'}
          </span>
        </div>
      </div>

      {/* TCM compliance fields */}
      {entry.program === 'tcm' && (
        <div style={{
          background: 'rgba(234,179,8,0.06)',
          border: '1px solid rgba(234,179,8,0.15)',
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '16px',
        }}>
          <label style={{ fontSize: '0.75rem', color: '#FBBF24', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
            TCM Compliance Requirements
          </label>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Discharge Date</label>
              <input
                type="date"
                value={entry.tcm_discharge_date || ''}
                onChange={(e) => onUpdate({ tcm_discharge_date: e.target.value || null })}
                style={{ padding: '4px 8px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', fontSize: '0.85rem' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={entry.tcm_contact_within_2_days || false}
                onChange={(e) => onUpdate({ tcm_contact_within_2_days: e.target.checked })}
              />
              Contact within 2 business days
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={entry.tcm_f2f_scheduled || false}
                onChange={(e) => onUpdate({ tcm_f2f_scheduled: e.target.checked })}
              />
              F2F visit scheduled
            </label>
          </div>
        </div>
      )}

      {/* Status & Review */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Status</label>
          <select
            value={entry.billing_status}
            onChange={(e) => onUpdate({ billing_status: e.target.value as BillingEntry['billing_status'] })}
            style={{ padding: '6px 10px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.85rem' }}
          >
            <option value="not_reviewed">Not Reviewed</option>
            <option value="pending_review">Pending Review</option>
            <option value="ready_to_bill">Ready to Bill</option>
            <option value="billed">Billed</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Reviewed By</label>
          <input
            type="text"
            value={entry.reviewed_by || ''}
            onChange={(e) => onUpdate({ reviewed_by: e.target.value || null })}
            placeholder="Clinician name"
            style={{ padding: '6px 10px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.85rem', width: '160px' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Notes</label>
          <input
            type="text"
            value={entry.notes || ''}
            onChange={(e) => onUpdate({ notes: e.target.value || null })}
            placeholder="Optional notes"
            style={{ width: '100%', padding: '6px 10px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.85rem' }}
          />
        </div>
      </div>
    </div>
  )
}
