'use client';

import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';

interface AcuteBreadcrumbProps {
  patient?: any;
  onBack?: () => void;
}

export default function AcuteBreadcrumb({ patient, onBack }: AcuteBreadcrumbProps) {
  const patientName = patient
    ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.name || 'Patient'
    : 'Patient';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        height: '44px',
        flexShrink: 0,
      }}
    >
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-caption, #696a70)',
          fontSize: '14px',
          fontWeight: 500,
          padding: 0,
        }}
      >
        <ArrowLeft size={16} />
        Waiting room
      </button>
      <span style={{ color: 'var(--text-caption, #696a70)', fontSize: '14px' }}>/</span>
      <span style={{ fontSize: '14px', color: 'var(--text-caption, #696a70)', fontWeight: 500 }}>PV</span>
      <span style={{ color: 'var(--text-caption, #696a70)', fontSize: '14px' }}>/</span>
      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading, #0c0f14)' }}>
        {patientName}
      </span>
      <button
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '0.5px solid var(--border-secondary, #cacaca)',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-caption, #696a70)',
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
