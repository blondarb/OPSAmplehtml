'use client';

import React from 'react';

type TagVariant = 'error' | 'success' | 'info' | 'neutral' | 'warning';

interface TagProps {
  label: string;
  variant?: TagVariant;
  icon?: React.ReactNode;
  className?: string;
}

const variantStyles: Record<TagVariant, { bg: string; color: string }> = {
  error: { bg: 'var(--surface-error-faint, rgba(239,68,68,0.08))', color: 'var(--text-error, #7f1d1d)' },
  success: { bg: 'var(--surface-success-faint, rgba(34,197,94,0.08))', color: 'var(--text-success, #14532b)' },
  info: { bg: 'var(--surface-info-faint, rgba(59,130,246,0.08))', color: 'var(--text-info, #1e478a)' },
  neutral: { bg: 'var(--surface-neutral-faint, rgba(12,15,20,0.04))', color: 'var(--text-caption, #696a70)' },
  warning: { bg: 'rgba(245,158,11,0.08)', color: '#92400e' },
};

export function Tag({ label, variant = 'neutral', icon, className = '' }: TagProps) {
  const style = variantStyles[variant];

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 8px',
        borderRadius: 'var(--radius-2xs, 4px)',
        background: style.bg,
        color: style.color,
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}
    >
      {icon && <span style={{ display: 'flex', width: 16, height: 16, flexShrink: 0 }}>{icon}</span>}
      {label}
    </span>
  );
}
