'use client'

import { useState } from 'react'
import {
  LogIn,
  Play,
  CheckCircle,
  FileCheck,
  Bot,
  AlertTriangle,
  XCircle,
  Heart,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { DEMO_ACTIVITY_FEED } from '@/lib/dashboard/demoMetrics'
import type { ActivityEventType } from '@/lib/dashboard/types'

const INITIAL_COUNT = 8

function getEventIcon(eventType: ActivityEventType) {
  switch (eventType) {
    case 'check_in':
      return { Icon: LogIn, color: '#60A5FA' }
    case 'visit_start':
      return { Icon: Play, color: '#34D399' }
    case 'visit_end':
      return { Icon: CheckCircle, color: '#22D3EE' }
    case 'note_signed':
      return { Icon: FileCheck, color: '#A78BFA' }
    case 'historian_completed':
      return { Icon: Bot, color: '#2DD4BF' }
    case 'no_show':
      return { Icon: AlertTriangle, color: '#F87171' }
    case 'cancelled':
      return { Icon: XCircle, color: '#FB923C' }
    case 'vitals_done':
      return { Icon: Heart, color: '#F472B6' }
    default:
      return { Icon: CheckCircle, color: '#94A3B8' }
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  let hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  const minuteStr = minutes.toString().padStart(2, '0')
  return `${hours}:${minuteStr} ${ampm}`
}

export default function ActivityFeed() {
  const [showAll, setShowAll] = useState(false)

  // Most recent first
  const sortedEvents = [...DEMO_ACTIVITY_FEED].reverse()
  const visibleEvents = showAll ? sortedEvents : sortedEvents.slice(0, INITIAL_COUNT)
  const hasMore = sortedEvents.length > INITIAL_COUNT

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
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: 16,
          margin: 0,
          marginBottom: 16,
        }}
      >
        Activity Feed
      </h3>

      {/* Scrollable event list */}
      <div
        style={{
          maxHeight: 400,
          overflowY: 'auto',
        }}
      >
        {visibleEvents.map((event) => {
          const { Icon, color } = getEventIcon(event.event_type)
          const contextParts: string[] = []
          if (event.provider_name) contextParts.push(event.provider_name)
          if (event.site_name) contextParts.push(event.site_name)
          const contextText = contextParts.join(' \u00B7 ')

          return (
            <div
              key={event.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                paddingTop: 10,
                paddingBottom: 10,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {/* Time column */}
              <span
                style={{
                  color: '#94A3B8',
                  fontSize: 12,
                  fontWeight: 500,
                  minWidth: 68,
                  flexShrink: 0,
                  paddingTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTime(event.time)}
              </span>

              {/* Icon */}
              <div
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${color}18`,
                }}
              >
                <Icon size={15} color={color} />
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: '#E2E8F0',
                    fontSize: 13,
                    lineHeight: '18px',
                  }}
                >
                  {event.description}
                </div>
                {contextText && (
                  <div
                    style={{
                      color: '#64748B',
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {contextText}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Show all / Show less toggle */}
      {hasMore && (
        <button
          onClick={() => setShowAll((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            marginTop: 12,
            padding: '8px 0',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: '#94A3B8',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {showAll ? (
            <>
              Show less <ChevronUp size={14} />
            </>
          ) : (
            <>
              Show all ({sortedEvents.length}) <ChevronDown size={14} />
            </>
          )}
        </button>
      )}
    </div>
  )
}
