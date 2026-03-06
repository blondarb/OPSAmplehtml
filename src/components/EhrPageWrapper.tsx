'use client'

import PlatformShell from './layout/PlatformShell'
import FeatureSubHeader from './layout/FeatureSubHeader'
import ClinicalNote from './ClinicalNote'
import { Stethoscope } from 'lucide-react'
interface User { id: string; email?: string }

interface EhrPageWrapperProps {
  user: User
  patient: any
  currentVisit: any
  priorVisits: any[]
  imagingStudies: any[]
  scoreHistory: any[]
  patientMessages?: any[]
  patientIntakeForms?: any[]
  historianSessions?: any[]
}

export default function EhrPageWrapper({
  user,
  patient,
  currentVisit,
  priorVisits,
  imagingStudies,
  scoreHistory,
  patientMessages,
  patientIntakeForms,
  historianSessions,
}: EhrPageWrapperProps) {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Documentation"
        icon={Stethoscope}
        accentColor="#0D9488"
        showDemo={true}
      />
      <ClinicalNote
        user={user}
        patient={patient}
        currentVisit={currentVisit}
        priorVisits={priorVisits}
        imagingStudies={imagingStudies}
        scoreHistory={scoreHistory}
        patientMessages={patientMessages}
        patientIntakeForms={patientIntakeForms}
        historianSessions={historianSessions}
        initialViewMode="chart"
      />
    </PlatformShell>
  )
}
