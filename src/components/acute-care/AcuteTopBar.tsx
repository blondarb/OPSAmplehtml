'use client';

import React from 'react';
import { ArrowLeft, Plus, Search, Bell, Settings, Shield } from 'lucide-react';
import { Tag } from '@/components/ui';

interface AcuteTopBarProps {
  user: { id: string; email?: string };
  patient?: any;
  onSignOut: () => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
}

const queueTabs = [
  { label: 'Acute Care', count: 99, active: true },
  { label: 'Rounding', count: null, active: false },
  { label: 'EEG', count: null, active: false },
  { label: 'Outpatient', count: null, active: false },
];

export default function AcuteTopBar({ user, patient, onSignOut, onOpenSettings, onToggleSidebar }: AcuteTopBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '0 16px',
        height: '56px',
        background: 'white',
        borderBottom: 'none',
        flexShrink: 0,
      }}
    >
      {/* Queue tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {queueTabs.map((tab, i) => (
          <button
            key={i}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-round, 80px)',
              border: 'none',
              background: tab.active ? 'var(--surface-primary, #0c0f14)' : 'transparent',
              color: tab.active ? 'var(--text-on-primary, #f1f1f1)' : 'var(--text-caption, #696a70)',
              fontSize: '14px',
              fontWeight: tab.active ? 700 : 500,
              lineHeight: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.count !== null && (
              <span
                style={{
                  background: tab.active ? 'rgba(255,255,255,0.2)' : 'var(--surface-2x-light, #f1f1f1)',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {tab.count}+
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Rescue badge */}
      <Tag label="Rescue" variant="error" icon={<Shield size={14} />} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Patient search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: 'var(--radius-round, 80px)',
          border: '0.5px solid var(--border-secondary, #cacaca)',
          minWidth: '200px',
        }}
      >
        <Search size={16} style={{ color: 'var(--text-caption, #696a70)' }} />
        <span style={{ fontSize: '14px', color: 'var(--text-caption, #696a70)' }}>Search Patient Name or MRN</span>
      </div>

      {/* MD Timer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: 'var(--radius-round, 80px)',
          border: '0.5px solid var(--border-secondary, #cacaca)',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading, #0c0f14)' }}>MD1</span>
        <span style={{ fontSize: '14px', color: 'var(--text-caption, #696a70)' }}>17:00:00</span>
      </div>

      {/* PHI toggle */}
      <button
        style={{
          padding: '6px 12px',
          borderRadius: 'var(--radius-round, 80px)',
          border: '0.5px solid var(--border-secondary, #cacaca)',
          background: 'transparent',
          fontSize: '14px',
          fontWeight: 700,
          color: 'var(--text-heading, #0c0f14)',
          cursor: 'pointer',
        }}
      >
        PHI
      </button>

      {/* Right icons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-caption, #696a70)',
            position: 'relative',
          }}
        >
          <Bell size={20} />
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#EF4444',
              border: '2px solid white',
            }}
          />
        </button>
        <button
          onClick={onOpenSettings}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-caption, #696a70)',
          }}
        >
          <Settings size={20} />
        </button>
        {/* User avatar */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--surface-primary, #0c0f14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-on-primary, #f1f1f1)',
            cursor: 'pointer',
          }}
          title={user.email || 'User'}
        >
          {user.email ? user.email.substring(0, 2).toUpperCase() : 'U'}
        </div>
      </div>
    </div>
  );
}
