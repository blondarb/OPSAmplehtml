'use client'

import type { BillingPeriod } from '@/lib/rpm/types'
import { CheckCircle, Clock, Calendar } from 'lucide-react'

interface Props {
  periods: BillingPeriod[]
}

export default function BillingTracker({ periods }: Props) {
  const active = periods.find(p => p.status === 'active')
  const closed = periods.filter(p => p.status === 'closed')

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: '0 0 16px' }}>
        RPM Billing — CPT 99454
      </h3>

      {!active && periods.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
          <Calendar size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ fontSize: '13px', margin: 0 }}>No billing periods — connect a device to start</p>
        </div>
      ) : (
        <>
          {active && <ActivePeriodCard period={active} />}

          {closed.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>Previous periods</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {closed.slice(0, 5).map(p => (
                  <div key={p.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#0f172a', borderRadius: '6px', padding: '8px 12px', fontSize: '12px',
                  }}>
                    <span style={{ color: '#94a3b8' }}>
                      {formatDate(p.period_start)} – {formatDate(p.period_end)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#64748b' }}>{p.days_with_data} days</span>
                      {p.eligible_for_99454 ? (
                        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '9999px', background: '#065F46', color: '#6EE7B7' }}>
                          Billable
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '9999px', background: '#78350F', color: '#FDE68A' }}>
                          Incomplete
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActivePeriodCard({ period }: { period: BillingPeriod }) {
  const required = 16
  const progress = Math.min(period.days_with_data / required, 1)
  const remaining = Math.max(0, required - period.days_with_data)
  const daysLeft = Math.max(0, Math.ceil((new Date(period.period_end).getTime() - Date.now()) / 86400000))

  return (
    <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Current billing period</div>
          <div style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 500, marginTop: '2px' }}>
            {formatDate(period.period_start)} – {formatDate(period.period_end)}
          </div>
        </div>
        {period.eligible_for_99454 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={16} color="#10B981" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#10B981' }}>Eligible</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} color="#F59E0B" />
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#F59E0B' }}>{remaining} more day{remaining !== 1 ? 's' : ''} needed</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
          <span>{period.days_with_data} / {required} days with data</span>
          <span>{daysLeft} days left in period</span>
        </div>
        <div style={{ height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '4px',
            width: `${progress * 100}%`,
            background: period.eligible_for_99454 ? '#10B981' : '#F59E0B',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Day indicators */}
      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
        {Array.from({ length: 30 }, (_, i) => {
          const dayDate = new Date(period.period_start)
          dayDate.setDate(dayDate.getDate() + i)
          const isPast = dayDate.getTime() < Date.now()
          const hasData = i < period.days_with_data // simplified; real impl would check actual dates
          return (
            <div
              key={i}
              title={dayDate.toLocaleDateString()}
              style={{
                width: '8px', height: '8px', borderRadius: '2px',
                background: hasData ? '#10B981' : (isPast ? '#7F1D1D50' : '#334155'),
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
