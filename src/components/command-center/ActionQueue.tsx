'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Check } from 'lucide-react'
import type {
  ActionItem,
  BatchGroup,
  ViewMode,
  TimeRange,
} from '@/lib/command-center/types'
import ActionItemCard from './ActionItemCard'
import ActionBatchGroup from './ActionBatchGroup'

// ── Props ──

interface ActionQueueProps {
  viewMode: ViewMode
  timeRange: TimeRange
}

// ── Toast type ──

interface Toast {
  id: string
  message: string
  variant: 'approved' | 'dismissed'
}

// ── Skeleton loader ──

function SkeletonCard() {
  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '4px',
            background: '#334155',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: '60%',
              height: 14,
              borderRadius: '4px',
              background: '#334155',
              marginBottom: '8px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <div
            style={{
              width: '90%',
              height: 12,
              borderRadius: '4px',
              background: '#334155',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: '0.15s',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Component ──

export default function ActionQueue({ viewMode, timeRange }: ActionQueueProps) {
  const [actions, setActions] = useState<ActionItem[]>([])
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])

  // ── Fetch actions from API ──

  const fetchActions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        view_mode: viewMode,
        time_range: timeRange,
      })
      const res = await fetch(`/api/command-center/actions?${params}`)
      if (!res.ok) throw new Error('Failed to load actions')
      const data = await res.json()
      setActions(data.actions ?? [])
      setBatchGroups(data.batch_groups ?? [])
    } catch (err) {
      console.error('ActionQueue fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [viewMode, timeRange])

  useEffect(() => {
    fetchActions()
  }, [fetchActions])

  // ── Toast helper ──

  const showToast = useCallback(
    (message: string, variant: 'approved' | 'dismissed') => {
      const id = `toast-${Date.now()}`
      setToasts((prev) => [...prev, { id, message, variant }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 2000)
    },
    []
  )

  // ── Remove a set of action IDs from local state ──

  const removeActions = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setActions((prev) => prev.filter((a) => !idSet.has(a.id)))
    setBatchGroups((prev) =>
      prev
        .map((g) => {
          const remainingIds = g.action_ids.filter((aid) => !idSet.has(aid))
          if (remainingIds.length === 0) return null
          return {
            ...g,
            action_ids: remainingIds,
            count: remainingIds.length,
            label: g.label.replace(/^\d+/, String(remainingIds.length)),
          }
        })
        .filter(Boolean) as BatchGroup[]
    )
  }, [])

  // ── Single approve ──

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/command-center/actions/${id}/approve`, {
          method: 'POST',
        })
      } catch {
        // best-effort for demo
      }
      removeActions([id])
      showToast('Action approved', 'approved')
    },
    [removeActions, showToast]
  )

  // ── Single dismiss (local only for demo) ──

  const handleDismiss = useCallback(
    (id: string) => {
      removeActions([id])
      showToast('Action dismissed', 'dismissed')
    },
    [removeActions, showToast]
  )

  // ── Batch approve ──

  const handleBatchApprove = useCallback(
    async (actionIds: string[]) => {
      try {
        await fetch('/api/command-center/actions/batch-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_ids: actionIds }),
        })
      } catch {
        // best-effort for demo
      }
      removeActions(actionIds)
      showToast(`${actionIds.length} actions approved`, 'approved')
    },
    [removeActions, showToast]
  )

  // ── Derived data ──

  const pendingActions = actions.filter((a) => a.status === 'pending')
  const individualActions = pendingActions.filter((a) => a.batch_id === null)
  const pendingCount = pendingActions.length

  const actionsForBatch = (batchId: string) =>
    pendingActions.filter((a) => a.batch_id === batchId)

  const isEmpty = !loading && pendingCount === 0

  // ── Render ──

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '16px',
        padding: '24px',
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
      }}
    >
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} color="#0D9488" />
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#e2e8f0',
            }}
          >
            AI Suggested Actions
          </span>
        </div>

        {pendingCount > 0 && (
          <span
            style={{
              background: '#4F46E5',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 10px',
              borderRadius: '999px',
              lineHeight: '1.5',
            }}
          >
            {pendingCount}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 16px',
            gap: '12px',
          }}
        >
          <Check size={32} color="#22C55E" />
          <span
            style={{
              color: '#64748b',
              fontSize: '0.9rem',
              textAlign: 'center',
            }}
          >
            No pending actions &mdash; you&apos;re all caught up!
          </span>
        </div>
      )}

      {/* Batch groups */}
      {!loading &&
        batchGroups.map((group) => {
          const batchActions = actionsForBatch(group.batch_id)
          if (batchActions.length === 0) return null
          return (
            <ActionBatchGroup
              key={group.batch_id}
              group={group}
              actions={batchActions}
              onBatchApprove={handleBatchApprove}
              onApproveOne={handleApprove}
              onDismissOne={handleDismiss}
            />
          )
        })}

      {/* Divider between batch groups and individual actions */}
      {!loading && batchGroups.length > 0 && individualActions.length > 0 && (
        <div
          style={{
            height: '1px',
            background: '#334155',
            margin: '16px 0',
          }}
        />
      )}

      {/* Individual (non-batched) actions */}
      {!loading &&
        individualActions.map((action) => (
          <ActionItemCard
            key={action.id}
            action={action}
            onApprove={handleApprove}
            onDismiss={handleDismiss}
          />
        ))}

      {/* Toasts */}
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            position: 'fixed',
            bottom: 24 + index * 48,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 20px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            color: '#ffffff',
            background:
              toast.variant === 'approved'
                ? 'rgba(34, 197, 94, 0.9)'
                : 'rgba(100, 116, 139, 0.9)',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'opacity 0.3s ease',
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
