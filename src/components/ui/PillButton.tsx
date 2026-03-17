'use client';

import React from 'react';

type PillVariant = 'primary' | 'secondary' | 'ghost';

interface PillButtonProps {
  label?: string;
  variant?: PillVariant;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
}

export function PillButton({
  label,
  variant = 'primary',
  icon,
  onClick,
  disabled = false,
  size = 'md',
  className = '',
  children,
}: PillButtonProps) {
  const isSmall = size === 'sm';

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    borderRadius: 'var(--radius-round, 80px)',
    fontFamily: 'inherit',
    fontWeight: 700,
    fontSize: isSmall ? '14px' : '16px',
    lineHeight: isSmall ? '18px' : '20px',
    padding: isSmall ? '7px 12px' : '9px 16px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    border: 'none',
  };

  const variantStyles: Record<PillVariant, React.CSSProperties> = {
    primary: {
      background: 'var(--surface-primary, #0c0f14)',
      color: 'var(--text-on-primary, #f1f1f1)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--text-heading, #0c0f14)',
      border: '0.5px solid var(--border-secondary, #cacaca)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-heading, #0c0f14)',
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{ ...baseStyle, ...variantStyles[variant] }}
    >
      {icon && <span style={{ display: 'flex', width: 24, height: 24, flexShrink: 0 }}>{icon}</span>}
      {label && <span>{label}</span>}
      {children}
    </button>
  );
}
