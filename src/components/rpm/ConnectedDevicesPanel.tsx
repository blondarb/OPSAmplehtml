'use client'

import type { ConnectedDevice } from '@/lib/rpm/types'
import { DEVICE_LABELS, DEVICE_COLORS } from '@/lib/rpm/types'
import { Wifi, WifiOff, RefreshCw, Plus, Smartphone, Watch, Activity, Droplets } from 'lucide-react'

interface Props {
  devices: ConnectedDevice[]
  onConnectDevice: (provider: string) => void
  onSyncDevice: (deviceId: string) => void
}

const DEVICE_ICONS: Record<string, typeof Watch> = {
  apple_watch: Watch,
  oura_ring: Activity,
  withings: Smartphone,
  withings_scale: Smartphone,
  dexcom_cgm: Droplets,
  whoop_band: Activity,
}

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: '#065F46', text: '#6EE7B7' },
  needs_reauth: { label: 'Reconnect', bg: '#78350F', text: '#FDE68A' },
  revoked: { label: 'Revoked', bg: '#7F1D1D', text: '#FCA5A5' },
  pending: { label: 'Pending', bg: '#1E3A5F', text: '#93C5FD' },
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never synced'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ConnectedDevicesPanel({ devices, onConnectDevice, onSyncDevice }: Props) {
  const availableProviders = ['oura_ring', 'withings', 'dexcom_cgm'].filter(
    p => !devices.some(d => d.device_type === p && d.connection_status === 'active')
  )

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>Connected Devices</h3>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
      </div>

      {devices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
          <Wifi size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ fontSize: '13px', margin: 0 }}>No devices connected</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {devices.map(device => {
            const Icon = DEVICE_ICONS[device.device_type] || Smartphone
            const color = DEVICE_COLORS[device.device_type] || '#94a3b8'
            const badge = STATUS_BADGES[device.connection_status] || STATUS_BADGES.pending

            return (
              <div key={device.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#0f172a', borderRadius: '8px', padding: '12px',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f5f9' }}>
                    {DEVICE_LABELS[device.device_type] || device.device_type}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    {device.connection_status === 'active' ? (
                      <><Wifi size={10} style={{ display: 'inline', marginRight: '4px' }} />{timeAgo(device.last_sync_at)}</>
                    ) : (
                      <><WifiOff size={10} style={{ display: 'inline', marginRight: '4px' }} />{badge.label}</>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '9999px',
                  background: badge.bg, color: badge.text,
                }}>
                  {badge.label}
                </span>
                {device.connection_status === 'active' && (
                  <button
                    onClick={() => onSyncDevice(device.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                      color: '#94a3b8', display: 'flex',
                    }}
                    title="Sync now"
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {availableProviders.length > 0 && (
        <div style={{ borderTop: '1px solid #334155', paddingTop: '12px' }}>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>Add device</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {availableProviders.map(provider => (
              <button
                key={provider}
                onClick={() => onConnectDevice(provider)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#0D948820', border: '1px solid #0D9488', borderRadius: '6px',
                  padding: '6px 12px', color: '#0D9488', fontSize: '12px', fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Plus size={12} /> {DEVICE_LABELS[provider]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
