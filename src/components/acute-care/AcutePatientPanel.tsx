'use client';

import React from 'react';
import { Phone, Video, CheckCircle, MapPin, Clock, Stethoscope, FileText, Activity } from 'lucide-react';
import { WidgetCard, Avatar, Tag, Timeline, PillButton } from '@/components/ui';

interface AcutePatientPanelProps {
  patient: any;
  priorVisits?: any[];
  scoreHistory?: any[];
  medications?: any[];
  allergies?: any[];
}

export default function AcutePatientPanel({
  patient,
  priorVisits = [],
  scoreHistory = [],
  medications = [],
  allergies = [],
}: AcutePatientPanelProps) {
  const patientName = patient
    ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.name || 'Patient'
    : 'No Patient';

  const patientAge = patient?.age || patient?.date_of_birth
    ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / 31557600000)
    : '55';

  const patientSex = patient?.sex || patient?.gender || 'Male';
  const patientMRN = patient?.mrn || patient?.id?.substring(0, 7) || '3673398';

  return (
    <div
      style={{
        width: '320px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px 0 16px 16px',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      {/* Treatment Window */}
      <WidgetCard cornerStyle="bottom-pill" padding="16px">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: '16px', color: 'var(--text-heading, #0c0f14)' }}>
            Treatment Window
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              style={{
                background: 'var(--surface-success-faint, rgba(34,197,94,0.08))',
                borderRadius: 'var(--radius-2xs, 4px)',
                padding: '6px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-success, #14532b)' }}>04</div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-success, #14532b)' }}>Hours</div>
            </div>
            <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-heading, #0c0f14)' }}>:</span>
            <div
              style={{
                background: 'var(--surface-success-faint, rgba(34,197,94,0.08))',
                borderRadius: 'var(--radius-2xs, 4px)',
                padding: '6px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-success, #14532b)' }}>44</div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-success, #14532b)' }}>Mins</div>
            </div>
          </div>
        </div>
      </WidgetCard>

      {/* Hospital Info */}
      <WidgetCard cornerStyle="top-pill" padding="8px 16px 16px">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <Avatar name="NYU" size="md" />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 500, fontSize: '16px', color: 'var(--text-body, #0c0f14)', margin: 0 }}>
              NYU Langone
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              {['PDT', 'TNK', 'Order'].map((item, i) => (
                <React.Fragment key={item}>
                  {i > 0 && (
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--surface-2x-light, #f1f1f1)' }} />
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-caption, #696a70)' }}>{item}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Video / Voice buttons */}
        <div style={{ display: 'flex', gap: '8px', paddingLeft: '40px', marginBottom: '16px' }}>
          <PillButton label="Video" variant="primary" size="sm" icon={<Video size={16} />} />
          <PillButton label="Voice" variant="secondary" size="sm" icon={<Phone size={16} />} />
        </div>

        {/* Separator */}
        <div style={{ paddingLeft: '40px', marginBottom: '16px' }}>
          <div style={{ height: '0.5px', background: 'var(--border-x-light, #dedede)' }} />
        </div>

        {/* EHR integrations row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingLeft: '40px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-caption, #696a70)', opacity: 0.8 }}>Cerner</span>
          <span style={{ width: '0.5px', height: '17px', background: 'var(--surface-2x-light, #f1f1f1)' }} />
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-caption, #696a70)', opacity: 0.8 }}>RAPIDai</span>
          <span style={{ width: '0.5px', height: '17px', background: 'var(--surface-2x-light, #f1f1f1)' }} />
          <span style={{ fontSize: '12px', fontWeight: 900, color: '#33474a' }}>VPN</span>
        </div>
      </WidgetCard>

      {/* Patient Info */}
      <WidgetCard cornerStyle="top-pill" padding="8px 16px 16px">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '12px' }}>
          <Avatar name={patientName} size="md" />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ fontWeight: 500, fontSize: '16px', color: 'var(--text-body, #0c0f14)', margin: 0 }}>
                {patientName}
              </p>
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', color: 'var(--text-caption, #696a70)' }}>
                EHR <CheckCircle size={14} style={{ color: '#22c55e' }} />
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              {[String(patientAge), patientSex, patientMRN].map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--surface-2x-light, #f1f1f1)' }} />
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-caption, #696a70)' }}>{item}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Stroke Code tag */}
        <div style={{ paddingLeft: '40px', marginBottom: '12px' }}>
          <Tag label="Stroke Code" variant="error" icon={<Activity size={14} />} />
        </div>

        {/* Separator */}
        <div style={{ paddingLeft: '40px', marginBottom: '12px' }}>
          <div style={{ height: '1px', background: 'var(--border-x-light, #dedede)' }} />
        </div>

        {/* Medical History link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '48px' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--surface-error-faint, rgba(239,68,68,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Stethoscope size={20} style={{ color: '#a91c1c' }} />
          </div>
          <span style={{ fontWeight: 500, fontSize: '16px', color: 'var(--text-body, #0c0f14)' }}>Medical History</span>
        </div>
      </WidgetCard>

      {/* Recent Consults */}
      <WidgetCard title="Recent Consults" collapsible defaultOpen={false} padding="16px 8px">
        <p style={{ fontSize: '14px', color: 'var(--text-caption, #696a70)', margin: 0, padding: '0 8px' }}>
          No recent consults
        </p>
      </WidgetCard>

      {/* Timeline */}
      <WidgetCard
        title="Timeline"
        collapsible
        defaultOpen={true}
        cornerStyle="default"
        padding="16px 8px"
      >
        <Timeline
          items={[
            { label: 'Final Location Confirmed', date: 'April 15, 2026', time: '10:00 AM (PDT)', status: 'completed', icon: <MapPin size={18} /> },
            { label: 'ED Arrival', date: 'April 15, 2026', time: '10:00 AM (PDT)', status: 'completed', icon: <Activity size={18} /> },
            { label: 'Initial Call to Teleneurologist', date: 'April 15, 2026', time: '10:00 AM (PDT)', status: 'pending', icon: <Phone size={18} /> },
            { label: 'Ready for Video Assessment', date: 'April 15, 2026', time: '10:00 AM (PDT)', status: 'completed', icon: <Video size={18} /> },
            { label: 'CT Read', date: 'Mar 20, 2025', time: '09:30 (EDT)', status: 'pending', icon: <FileText size={18} /> },
            { label: 'Time of Video', date: 'Mar 20, 2025', time: '09:30 (EDT)', status: 'completed', icon: <Video size={18} /> },
          ]}
        />
      </WidgetCard>

      {/* Triager */}
      <WidgetCard title="Triager" collapsible defaultOpen={false}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <Avatar name="Maya Patel" size="md" />
          <div>
            <p style={{ fontWeight: 500, fontSize: '16px', color: 'var(--text-body, #0c0f14)', margin: 0 }}>Dr. Maya Patel</p>
            <p style={{ fontSize: '12px', color: 'var(--text-caption, #696a70)', margin: 0 }}>ED/MD</p>
          </div>
        </div>
        <div style={{ height: '0.5px', background: 'var(--border-x-light, #dedede)', marginBottom: '12px' }} />
        <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading, #0c0f14)', margin: '0 0 8px' }}>Notes</p>
        <p style={{ fontSize: '14px', lineHeight: '18px', color: 'var(--text-caption, #696a70)', margin: 0 }}>
          Patient presented with chest discomfort. Initial vitals stable. Recommendation: continue monitoring and schedule follow-up labs.
        </p>
      </WidgetCard>
    </div>
  );
}
