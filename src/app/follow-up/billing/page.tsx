'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import BillingWorksheet from '@/components/follow-up/BillingWorksheet'
import type { BillingEntry, BillingMonthlySummary } from '@/lib/follow-up/billingTypes'

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const date = new Date(y, m - 1 + delta)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default function BillingPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [entries, setEntries] = useState<BillingEntry[]>([])
  const [summary, setSummary] = useState<BillingMonthlySummary>({
    totalSessions: 0,
    billableSessions: 0,
    totalBillableMinutes: 0,
    estimatedRevenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBilling = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/follow-up/billing?month=${currentMonth}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch billing data')
      }
      const json = await res.json()
      setEntries(json.entries || [])
      setSummary(json.summary || { totalSessions: 0, billableSessions: 0, totalBillableMinutes: 0, estimatedRevenue: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [currentMonth])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  async function handleUpdateEntry(id: string, updates: Partial<BillingEntry>) {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    )

    try {
      const entry = entries.find((e) => e.id === id)
      if (!entry) return

      const res = await fetch('/api/follow-up/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...entry, ...updates }),
      })

      if (!res.ok) {
        console.error('Failed to save billing update')
        fetchBilling() // Revert on failure
      }
    } catch (err) {
      console.error('Billing update error:', err)
      fetchBilling()
    }
  }

  function handleExport(format: 'csv' | 'pdf') {
    const url = `/api/follow-up/billing/export?month=${currentMonth}&format=${format}`
    window.open(url, '_blank')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff' }}>
      {/* Header */}
      <div style={{ background: '#16A34A', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/follow-up" style={{ color: '#fff', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.9 }}>
          ← Follow-Up Center
        </Link>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, flex: 1 }}>
          Billing & Time Tracking
        </h1>
        <span style={{
          background: 'rgba(255,255,255,0.2)',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          DEMO
        </span>
      </div>

      {/* Month Navigation */}
      <div style={{ padding: '20px 24px 0', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setCurrentMonth((m) => shiftMonth(m, -1))}
            style={{
              padding: '8px 12px',
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            ◀
          </button>
          <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e2e8f0', minWidth: '180px', textAlign: 'center' }}>
            {formatMonth(currentMonth)}
          </span>
          <button
            onClick={() => setCurrentMonth((m) => shiftMonth(m, 1))}
            style={{
              padding: '8px 12px',
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
            <div style={{
              width: 40,
              height: 40,
              border: '3px solid #334155',
              borderTop: '3px solid #F59E0B',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }} />
            Loading billing data...
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#f87171',
            background: 'rgba(239,68,68,0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
            {error}
            <br />
            <button
              onClick={fetchBilling}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: '#DC2626',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <BillingWorksheet
            entries={entries}
            summary={summary}
            onUpdateEntry={handleUpdateEntry}
            onExport={handleExport}
          />
        )}
      </div>
    </div>
  )
}
