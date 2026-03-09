'use client'

import { useState } from 'react'
import { DEVICE_LABELS, DEVICE_COLORS } from '@/lib/rpm/types'
import { ExternalLink, Bell, BellOff, Loader2 } from 'lucide-react'

interface Props {
  patientId: string
  onComplete: () => void
}

const PROVIDERS = [
  { key: 'oura', label: 'Oura Ring', desc: 'Sleep, HRV, activity, temperature', hasWebhook: true },
  { key: 'withings', label: 'Withings', desc: 'Blood pressure, weight, SpO2, temperature', hasWebhook: true },
  { key: 'dexcom', label: 'Dexcom CGM', desc: 'Continuous glucose monitoring', hasWebhook: false },
]

export default function DeviceOnboarding({ patientId, onComplete }: Props) {
  const [connecting, setConnecting] = useState<string | null>(null)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  async function handleConnect(provider: string) {
    setConnecting(provider)
    try {
      const res = await fetch('/api/rpm/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, provider }),
      })
      const data = await res.json()
      if (data.authorization_url) {
        window.open(data.authorization_url, '_blank', 'width=600,height=700')
        setResults(prev => ({ ...prev, [provider]: 'OAuth window opened' }))
      } else {
        setResults(prev => ({ ...prev, [provider]: data.error || 'Connected' }))
      }
    } catch {
      setResults(prev => ({ ...prev, [provider]: 'Failed to initiate' }))
    } finally {
      setConnecting(null)
    }
  }

  async function handleWebhook(provider: string) {
    setSubscribing(provider)
    try {
      const res = await fetch('/api/rpm/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, provider }),
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [`${provider}_webhook`]: data.error || 'Subscribed' }))
    } catch {
      setResults(prev => ({ ...prev, [`${provider}_webhook`]: 'Failed' }))
    } finally {
      setSubscribing(null)
    }
  }

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: '0 0 16px' }}>
        Device Onboarding
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {PROVIDERS.map(p => {
          const color = DEVICE_COLORS[p.key === 'oura' ? 'oura_ring' : p.key === 'dexcom' ? 'dexcom_cgm' : p.key] || '#0D9488'
          return (
            <div key={p.key} style={{
              background: '#0f172a', borderRadius: '8px', padding: '14px',
              borderLeft: `3px solid ${color}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f5f9' }}>{p.label}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{p.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleConnect(p.key)}
                    disabled={connecting === p.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: `${color}20`, border: `1px solid ${color}`, borderRadius: '6px',
                      padding: '5px 10px', color, fontSize: '11px', fontWeight: 500,
                      cursor: connecting === p.key ? 'wait' : 'pointer', opacity: connecting === p.key ? 0.6 : 1,
                    }}
                  >
                    {connecting === p.key ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                    Connect
                  </button>
                  {p.hasWebhook && (
                    <button
                      onClick={() => handleWebhook(p.key)}
                      disabled={subscribing === p.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'transparent', border: '1px solid #334155', borderRadius: '6px',
                        padding: '5px 10px', color: '#94a3b8', fontSize: '11px', fontWeight: 500,
                        cursor: subscribing === p.key ? 'wait' : 'pointer',
                      }}
                    >
                      {subscribing === p.key ? <Loader2 size={12} /> : <Bell size={12} />}
                      Webhook
                    </button>
                  )}
                </div>
              </div>
              {(results[p.key] || results[`${p.key}_webhook`]) && (
                <div style={{ fontSize: '11px', color: '#6EE7B7', marginTop: '6px' }}>
                  {results[p.key] && <span>OAuth: {results[p.key]}</span>}
                  {results[`${p.key}_webhook`] && <span style={{ marginLeft: '12px' }}>Webhook: {results[`${p.key}_webhook`]}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: '10px', color: '#64748b', margin: '12px 0 0', textAlign: 'center' }}>
        OAuth redirects open in a new window. After authorization, data syncing begins automatically.
      </p>
    </div>
  )
}
