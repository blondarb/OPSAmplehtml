'use client'

import { useState, useEffect } from 'react'
import StatusTile from './StatusTile'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StatusBarProps {
  viewMode: 'my_patients' | 'all_patients'
  timeRange: 'today' | 'yesterday' | 'last_7_days'
  onCategoryFilter: (category: string) => void
}

interface TileMetric {
  total: number
  sublabel: string
  trend?: 'up' | 'down' | 'flat'
  [key: string]: unknown // extra fields like urgent, overdue, etc.
}

type MetricsMap = Record<string, TileMetric>

// ─── Tile configuration ─────────────────────────────────────────────────────

const TILE_CONFIG = [
  { key: 'schedule', label: "Today's Schedule", icon: 'Calendar', color: '#4F46E5', category: 'all' },
  { key: 'messages', label: 'Unanswered Messages', icon: 'Mail', color: '#0D9488', category: 'messages' },
  { key: 'refills', label: 'Pending Refills', icon: 'Pill', color: '#8B5CF6', category: 'refills' },
  { key: 'results', label: 'Missing Results', icon: 'Image', color: '#F59E0B', category: 'results' },
  { key: 'wearables', label: 'Wearable Alerts', icon: 'Watch', color: '#0EA5E9', category: 'wearables' },
  { key: 'followups', label: 'Follow-Up Escalations', icon: 'Phone', color: '#16A34A', category: 'followups' },
  { key: 'triage', label: 'Triage Queue', icon: 'Brain', color: '#D97706', category: 'triage' },
  { key: 'ehr', label: 'EHR Inbox', icon: 'Inbox', color: '#64748B', category: 'ehr' },
]

// ─── Demo fallback data ─────────────────────────────────────────────────────

const DEMO_METRICS: MetricsMap = {
  schedule: { total: 9, sublabel: '2 new, 1 cancelled', trend: 'flat' },
  messages: { total: 4, sublabel: '1 urgent, 2 days old', trend: 'up' },
  refills: { total: 3, sublabel: '1 overdue', trend: 'flat' },
  results: { total: 2, sublabel: '1 MRI > 14 days', trend: 'down' },
  wearables: { total: 5, sublabel: '2 urgent', trend: 'up' },
  followups: { total: 3, sublabel: '1 same-day', trend: 'flat' },
  triage: { total: 8, sublabel: '2 emergent', trend: 'down' },
  ehr: { total: 6, sublabel: '3 results to sign', trend: 'flat' },
}

// ─── Skeleton tile for loading state ────────────────────────────────────────

function SkeletonTile() {
  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        minWidth: 0,
        minHeight: '100px',
      }}
    >
      {/* Label skeleton */}
      <div
        style={{
          width: '70%',
          height: '10px',
          borderRadius: '4px',
          background: '#334155',
          marginBottom: '12px',
          animation: 'statusBarPulse 1.5s ease-in-out infinite',
        }}
      />
      {/* Number skeleton */}
      <div
        style={{
          width: '40%',
          height: '28px',
          borderRadius: '6px',
          background: '#334155',
          marginBottom: '8px',
          animation: 'statusBarPulse 1.5s ease-in-out infinite',
          animationDelay: '0.2s',
        }}
      />
      {/* Sublabel skeleton */}
      <div
        style={{
          width: '60%',
          height: '10px',
          borderRadius: '4px',
          background: '#334155',
          animation: 'statusBarPulse 1.5s ease-in-out infinite',
          animationDelay: '0.4s',
        }}
      />
    </div>
  )
}

// ─── StatusBar component ────────────────────────────────────────────────────

export default function StatusBar({ viewMode, timeRange, onCategoryFilter }: StatusBarProps) {
  const [metrics, setMetrics] = useState<MetricsMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchMetrics() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ view_mode: viewMode, time_range: timeRange })
        const res = await fetch(`/api/command-center/metrics?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setMetrics(data)
        }
      } catch {
        // On error, fall back to demo data
        if (!cancelled) {
          setMetrics(DEMO_METRICS)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchMetrics()
    return () => { cancelled = true }
  }, [viewMode, timeRange])

  return (
    <>
      {/* Pulse animation for skeleton tiles */}
      <style>{`
        @keyframes statusBarPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>

      <div
        style={{
          display: 'grid',
          gap: '12px',
          gridTemplateColumns: 'repeat(8, 1fr)',
        }}
        className="status-bar-grid"
      >
        {loading
          ? TILE_CONFIG.map((tile) => <SkeletonTile key={tile.key} />)
          : TILE_CONFIG.map((tile) => {
              const m = metrics?.[tile.key]
              return (
                <StatusTile
                  key={tile.key}
                  label={tile.label}
                  total={m?.total ?? 0}
                  sublabel={m?.sublabel ?? ''}
                  color={tile.color}
                  trend={m?.trend}
                  onClick={() => onCategoryFilter(tile.category)}
                />
              )
            })}
      </div>

      {/* Responsive grid overrides */}
      <style>{`
        @media (max-width: 1024px) {
          .status-bar-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .status-bar-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </>
  )
}
