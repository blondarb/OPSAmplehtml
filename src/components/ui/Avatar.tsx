'use client';

import React from 'react';

interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  badge?: React.ReactNode;
  className?: string;
}

const sizes = {
  sm: { box: 32, font: 12, line: '16px' },
  md: { box: 48, font: 16, line: '20px' },
  lg: { box: 64, font: 20, line: '24px' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ name, src, size = 'md', badge, className = '' }: AvatarProps) {
  const s = sizes[size];

  return (
    <div className={className} style={{ position: 'relative', width: s.box, height: s.box, flexShrink: 0 }}>
      {src ? (
        <img
          src={src}
          alt={name || ''}
          style={{ width: s.box, height: s.box, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: s.box,
            height: s.box,
            borderRadius: '50%',
            background: 'var(--surface-2x-light, #f1f1f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: s.font,
            fontWeight: 700,
            lineHeight: s.line,
            color: 'var(--text-avatar, #696a70)',
          }}
        >
          {name ? getInitials(name) : '?'}
        </div>
      )}
      {badge && (
        <span style={{ position: 'absolute', bottom: -2, right: -2 }}>{badge}</span>
      )}
    </div>
  );
}
