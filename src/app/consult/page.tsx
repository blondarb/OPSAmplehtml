'use client'

import { useState, useCallback } from 'react'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Stethoscope } from 'lucide-react'
import ConsultPipelineView from '@/components/consult/ConsultPipelineView'

export const dynamic = 'force-dynamic'

export default function ConsultPage() {
  const [consultId, setConsultId] = useState<string | null>(null)

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Neuro Intake Engine"
        icon={Stethoscope}
        accentColor="#0D9488"
        badgeText="Pipeline"
      />
      <div
        style={{
          minHeight: 'calc(100vh - 112px)',
          background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
          padding: '24px',
        }}
      >
        <ConsultPipelineView
          consultId={consultId}
          onConsultCreated={setConsultId}
        />
      </div>
    </PlatformShell>
  )
}
