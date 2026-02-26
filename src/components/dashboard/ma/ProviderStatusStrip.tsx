'use client'

import React from 'react'
import type { Provider } from '@/lib/dashboard/types'
import ProviderCard from './ProviderCard'

interface ProviderStatusStripProps {
  providers: Provider[]
  selectedProviderId: string | null
  onProviderSelect: (id: string | null) => void
}

export default function ProviderStatusStrip({
  providers,
  selectedProviderId,
  onProviderSelect,
}: ProviderStatusStripProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        padding: '16px 24px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isSelected={selectedProviderId === provider.id}
          onClick={() =>
            onProviderSelect(
              selectedProviderId === provider.id ? null : provider.id
            )
          }
        />
      ))}
    </div>
  )
}
