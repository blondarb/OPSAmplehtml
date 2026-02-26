'use client'

import { Pill, Mail, ClipboardList, FileText, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Local demo data                                                    */
/* ------------------------------------------------------------------ */

interface ActionSummaryItem {
  type: string
  count: number
  Icon: LucideIcon
  color: string
}

const ACTION_SUMMARY: ActionSummaryItem[] = [
  { type: 'Refills', count: 4, Icon: Pill, color: '#22C55E' },
  { type: 'Messages', count: 3, Icon: Mail, color: '#3B82F6' },
  { type: 'Results/Orders', count: 2, Icon: ClipboardList, color: '#F59E0B' },
  { type: 'Prior Auths', count: 1, Icon: FileText, color: '#8B5CF6' },
  { type: 'Care Gaps', count: 2, Icon: AlertTriangle, color: '#EF4444' },
]

const MAX_COUNT = Math.max(...ACTION_SUMMARY.map((a) => a.count))
const TOTAL = ACTION_SUMMARY.reduce((sum, a) => sum + a.count, 0)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * PendingActionsOverview -- Practice Manager aggregate action counts
 *
 * Dark glassmorphic card with a mini horizontal-bar for each action type,
 * proportional to the max count. Footer shows the total pending count and
 * a "View Action Queue" link (demo-only, no routing).
 */
export default function PendingActionsOverview() {
  return (
    <div
      style={{
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      {/* Header */}
      <h3
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 15,
          fontWeight: 700,
          color: '#FFFFFF',
        }}
      >
        Pending Actions
      </h3>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ACTION_SUMMARY.map((item) => (
          <div
            key={item.type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* Icon */}
            <item.Icon
              size={16}
              style={{ color: item.color, flexShrink: 0 }}
            />

            {/* Label */}
            <span
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.8)',
                width: 110,
                flexShrink: 0,
              }}
            >
              {item.type}
            </span>

            {/* Mini-bar */}
            <div
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(item.count / MAX_COUNT) * 100}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: item.color,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            {/* Count */}
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#FFFFFF',
                width: 24,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {item.count}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
          {TOTAL} total pending
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#0D9488',
            cursor: 'pointer',
          }}
        >
          View Action Queue &rarr;
        </span>
      </div>
    </div>
  )
}
