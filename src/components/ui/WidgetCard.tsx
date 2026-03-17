'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type CornerStyle = 'default' | 'top-pill' | 'bottom-pill';

interface WidgetCardProps {
  title?: string;
  headerAction?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  cornerStyle?: CornerStyle;
  children: React.ReactNode;
  className?: string;
  padding?: string;
}

const cornerRadii: Record<CornerStyle, string> = {
  default: 'var(--radius-widget, 8px)',
  'top-pill': '80px 8px 8px 40px',
  'bottom-pill': '8px 40px 40px 8px',
};

export function WidgetCard({
  title,
  headerAction,
  collapsible = false,
  defaultOpen = true,
  cornerStyle = 'default',
  children,
  className = '',
  padding = '16px',
}: WidgetCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={className}
      style={{
        background: 'var(--surface-widget, white)',
        borderRadius: cornerRadii[cornerStyle],
        padding,
        overflow: 'hidden',
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: open ? '16px' : 0,
            cursor: collapsible ? 'pointer' : 'default',
          }}
          onClick={collapsible ? () => setOpen(!open) : undefined}
        >
          <span
            style={{
              flex: 1,
              fontWeight: 700,
              fontSize: '16px',
              lineHeight: '20px',
              color: 'var(--text-heading, #0c0f14)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          {headerAction && <span style={{ flexShrink: 0 }}>{headerAction}</span>}
          {collapsible && (
            <span style={{ flexShrink: 0, color: 'var(--text-caption, #696a70)' }}>
              {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </span>
          )}
        </div>
      )}
      {(!collapsible || open) && children}
    </div>
  );
}
