'use client';

import React from 'react';

interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

export function Chip({ label, selected = false, onClick, size = 'md', disabled = false, className = '' }: ChipProps) {
  const sizeStyles = size === 'sm'
    ? { padding: '4px 10px', fontSize: '12px', lineHeight: '16px' }
    : { padding: '8px 12px', fontSize: '14px', lineHeight: '18px' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        ...sizeStyles,
        borderRadius: 'var(--radius-widget, 8px)',
        border: 'none',
        fontFamily: 'inherit',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
        background: selected
          ? 'var(--surface-primary, #0c0f14)'
          : 'var(--surface-2x-light, #f4f4f4)',
        color: selected
          ? 'var(--text-on-primary, #f1f1f1)'
          : 'var(--text-heading, #0c0f14)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
