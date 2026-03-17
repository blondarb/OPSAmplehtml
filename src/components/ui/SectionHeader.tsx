'use client';

import React from 'react';

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  required?: boolean;
  tag?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, icon, required = false, tag, actions, className = '' }: SectionHeaderProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        height: '32px',
      }}
    >
      {icon && <span style={{ display: 'flex', width: 20, height: 20, flexShrink: 0, color: 'var(--text-heading, #0c0f14)' }}>{icon}</span>}
      <span
        style={{
          fontWeight: 700,
          fontSize: '16px',
          lineHeight: '20px',
          color: 'var(--text-heading, #0c0f14)',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      {required && (
        <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--surface-error-dark, #a91c1c)' }}>*</span>
      )}
      {tag && <span style={{ flexShrink: 0 }}>{tag}</span>}
      <span style={{ flex: 1 }} />
      {actions && <span style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>{actions}</span>}
    </div>
  );
}
