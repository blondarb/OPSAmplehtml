'use client';

import React from 'react';

type TimelineStatus = 'completed' | 'pending' | 'active';

interface TimelineItem {
  icon?: React.ReactNode;
  label: string;
  time?: string;
  date?: string;
  status?: TimelineStatus;
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

const statusColors: Record<TimelineStatus, { bg: string; iconColor: string }> = {
  completed: { bg: 'var(--surface-success-faint, rgba(34,197,94,0.08))', iconColor: 'var(--text-success, #14532b)' },
  active: { bg: 'var(--surface-info-faint, rgba(59,130,246,0.08))', iconColor: 'var(--text-info, #1e478a)' },
  pending: { bg: 'var(--surface-neutral-faint, rgba(12,15,20,0.04))', iconColor: 'var(--text-caption, #696a70)' },
};

export function Timeline({ items, className = '' }: TimelineProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => {
        const colors = statusColors[item.status || 'pending'];
        return (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px' }}>
            {/* Icon dot + connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: colors.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: colors.iconColor,
                }}
              >
                {item.icon || (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.iconColor }} />
                )}
              </div>
              {i < items.length - 1 && (
                <div style={{ width: '0.5px', height: '8px', background: 'var(--border-x-light, #dedede)' }} />
              )}
            </div>
            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 40 }}>
              <p
                style={{
                  fontSize: '12px',
                  lineHeight: '16px',
                  fontWeight: 500,
                  color: 'var(--text-caption, #696a70)',
                  margin: 0,
                }}
              >
                {item.label}
              </p>
              {(item.date || item.time) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {item.date && (
                    <span style={{ fontSize: '14px', lineHeight: '18px', fontWeight: 500, color: 'var(--text-body, #0c0f14)' }}>
                      {item.date}
                    </span>
                  )}
                  {item.date && item.time && (
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--surface-2x-light, #f1f1f1)' }} />
                  )}
                  {item.time && (
                    <span style={{ fontSize: '14px', lineHeight: '18px', fontWeight: 500, color: 'var(--text-body, #0c0f14)' }}>
                      {item.time}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
