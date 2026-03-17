'use client';

import React from 'react';
import { MoreHorizontal, Sparkles, Copy, FileSignature } from 'lucide-react';
import { PillButton } from '@/components/ui';

interface AcuteActionBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onPend?: () => void;
  onSignComplete?: () => void;
  onGenerateNote?: () => void;
  openAiDrawer?: (tab: string) => void;
}

const tabs = [
  { id: 'history', label: 'History' },
  { id: 'imaging', label: 'Imaging/Results' },
  { id: 'exam', label: 'Physical Exam' },
  { id: 'recommendation', label: 'Recommendations' },
];

export default function AcuteActionBar({
  activeTab,
  onTabChange,
  onPend,
  onSignComplete,
  onGenerateNote,
  openAiDrawer,
}: AcuteActionBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '0 16px',
        height: '44px',
        flexShrink: 0,
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                padding: '10px 16px',
                height: '44px',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--text-heading, #0c0f14)'
                  : '0.5px solid var(--border-x-light, #dedede)',
                background: 'transparent',
                fontSize: '16px',
                fontWeight: isActive ? 700 : 500,
                lineHeight: '20px',
                color: isActive ? 'var(--text-heading, #0c0f14)' : 'var(--text-caption, #696a70)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-round, 80px)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-caption, #696a70)',
          }}
        >
          <MoreHorizontal size={24} />
        </button>

        <button
          onClick={() => openAiDrawer?.('ask')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-round, 80px)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3B82F6',
          }}
        >
          <Sparkles size={24} />
        </button>

        <button
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-round, 80px)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-caption, #696a70)',
          }}
        >
          <Copy size={24} />
        </button>

        <PillButton label="Pend" variant="secondary" onClick={onPend} />

        <PillButton
          label="Sign & Complete"
          variant="primary"
          icon={<FileSignature size={20} />}
          onClick={onSignComplete}
        />
      </div>
    </div>
  );
}
