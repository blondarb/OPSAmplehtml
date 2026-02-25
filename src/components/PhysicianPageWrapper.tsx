'use client'

import PlatformShell from './layout/PlatformShell'
import FeatureSubHeader from './layout/FeatureSubHeader'
import ClinicalNote from './ClinicalNote'
import { Home } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

interface PhysicianPageWrapperProps {
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

export default function PhysicianPageWrapper({
  user,
  patient,
  currentVisit,
  priorVisits,
  imagingStudies,
  scoreHistory,
  patientMessages,
  patientIntakeForms,
  historianSessions,
}: PhysicianPageWrapperProps) {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Clinician Cockpit"
        icon={Home}
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
        initialViewMode="appointments"
      />
    </PlatformShell>
  )
}
