'use client';

import React from 'react';
import {
  LayoutGrid,
  ClipboardList,
  HeartPulse,
  Clock,
  Link2,
  FileText,
  Settings,
  Bell,
  Phone,
  Stethoscope,
  ChevronRight,
} from 'lucide-react';

interface AcuteIconNavProps {
  activeIcon: string;
  setActiveIcon: (icon: string) => void;
  viewMode: 'appointments' | 'chart' | 'cockpit';
  onViewModeChange: (mode: 'appointments' | 'chart' | 'cockpit') => void;
  onOpenSettings: () => void;
  notificationCounts?: {
    total: number;
    critical: number;
    patientMessages: number;
    providerMessages: number;
    incompleteDocs: number;
  };
}

export default function AcuteIconNav({
  activeIcon,
  setActiveIcon,
  viewMode,
  onViewModeChange,
  onOpenSettings,
  notificationCounts,
}: AcuteIconNavProps) {
  const ACTIVE_ICONS = new Set(['home', 'notes', 'messages', 'chat', 'settings']);

  // Group 1: Primary clinical nav
  const primaryIcons = [
    { id: 'home', tooltip: 'Dashboard', icon: <LayoutGrid size={20} /> },
    { id: 'notes', tooltip: 'Chart', icon: <ClipboardList size={20} /> },
    { id: 'vitals', tooltip: 'Vitals', icon: <HeartPulse size={20} /> },
    { id: 'timeline', tooltip: 'Timeline', icon: <Clock size={20} /> },
  ];

  // Group 2: Communication
  const commIcons = [
    { id: 'links', tooltip: 'Integrations', icon: <Link2 size={20} /> },
    { id: 'docs', tooltip: 'Documents', icon: <FileText size={20} /> },
  ];

  // Group 3: Utility
  const utilIcons = [
    { id: 'referrals', tooltip: 'Referrals', icon: <Stethoscope size={20} /> },
  ];

  // Bottom actions
  const bottomIcons = [
    { id: 'calendar', tooltip: 'Schedule', icon: <Clock size={20} /> },
    { id: 'info', tooltip: 'Info', icon: <Bell size={20} /> },
  ];

  const getIsActive = (iconId: string) => {
    if ((viewMode === 'cockpit' || viewMode === 'appointments') && iconId === 'home') return true;
    if (viewMode === 'chart' && iconId === 'notes') return true;
    return false;
  };

  const handleClick = (iconId: string) => {
    if (iconId === 'home') { setActiveIcon('home'); onViewModeChange('cockpit'); }
    else if (iconId === 'notes') { setActiveIcon('notes'); onViewModeChange('chart'); }
    else if (iconId === 'settings') { onOpenSettings(); }
    else { setActiveIcon(iconId); }
  };

  const renderIcon = (item: { id: string; tooltip: string; icon: React.ReactNode }, badge?: number) => {
    const isActive = getIsActive(item.id);
    return (
      <div key={item.id} style={{ position: 'relative', width: '100%' }}>
        <button
          onClick={() => handleClick(item.id)}
          title={item.tooltip}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            borderRadius: 'var(--radius-widget, 8px)',
            border: 'none',
            background: isActive ? 'var(--surface-2x-light, #f4f4f4)' : 'transparent',
            cursor: 'pointer',
            color: isActive ? 'var(--text-heading, #0c0f14)' : 'var(--text-caption, #696a70)',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {item.icon}
        </button>
        {badge && badge > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 6,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: '#EF4444',
              color: 'white',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid white',
            }}
          >
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </div>
    );
  };

  const Separator = () => (
    <div style={{ padding: '0 12px', width: '100%' }}>
      <div style={{ height: '0.5px', background: 'var(--border-x-light, #dedede)' }} />
    </div>
  );

  return (
    <div
      className="desktop-only"
      style={{
        width: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
        gap: '8px',
        background: 'white',
        borderRight: 'none',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '12px 16px', marginBottom: '8px' }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>S</span>
        </div>
      </div>

      {/* Primary nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {primaryIcons.map((item) =>
          renderIcon(item, item.id === 'home' ? notificationCounts?.critical : undefined)
        )}
      </div>

      <Separator />

      {/* Communication */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {commIcons.map((item) => renderIcon(item))}
      </div>

      <Separator />

      {/* Utility */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {utilIcons.map((item) => renderIcon(item))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom icons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {bottomIcons.map((item) => renderIcon(item))}
      </div>

      {/* Bottom actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', alignItems: 'center' }}>
        <button
          onClick={() => onOpenSettings()}
          title="Settings"
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-round, 80px)',
            border: '0.5px solid var(--border-secondary, #cacaca)',
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
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-round, 80px)',
            border: '0.5px solid var(--border-secondary, #cacaca)',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-caption, #696a70)',
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
