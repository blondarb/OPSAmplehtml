'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AnalyticsDashboard from '@/components/follow-up/AnalyticsDashboard'
import type { AnalyticsData } from '@/lib/follow-up/billingTypes'

type DateRange = '7d' | '30d' | 'all'

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>('30d')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const now = new Date()
      let from: string | undefined
      if (dateRange === '7d') {
        from = new Date(now.getTime() - 7 * 86400000).toISOString()
      } else if (dateRange === '30d') {
        from = new Date(now.getTime() - 30 * 86400000).toISOString()
      }
      // 'all' — no from param, API defaults to 30d but we override with very old date
      if (dateRange === 'all') {
        from = new Date('2020-01-01').toISOString()
      }

      const params = new URLSearchParams()
      if (from) params.set('from', from)
      params.set('to', now.toISOString())

      const res = await fetch(`/api/follow-up/analytics?${params}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch analytics')
      }
      const json: AnalyticsData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const rangeOptions: { key: DateRange; label: string }[] = [
    { key: '7d', label: 'Last 7 Days' },
    { key: '30d', label: 'Last 30 Days' },
    { key: 'all', label: 'All Time' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff' }}>
      {/* Header */}
      <div style={{ background: '#16A34A', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/follow-up" style={{ color: '#fff', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.9 }}>
          ← Follow-Up Center
        </Link>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, flex: 1 }}>
          Analytics Dashboard
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

      {/* Date range filter */}
      <div style={{ padding: '20px 24px 0', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {rangeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setDateRange(opt.key)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: dateRange === opt.key ? '#16A34A' : '#1e293b',
                color: dateRange === opt.key ? '#fff' : '#94a3b8',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
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
              borderTop: '3px solid #16A34A',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }} />
            Loading analytics...
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
              onClick={fetchData}
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

        {!loading && !error && data && <AnalyticsDashboard data={data} />}
      </div>
    </div>
  )
}
