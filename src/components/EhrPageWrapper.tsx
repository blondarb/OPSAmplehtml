'use client'

import ClinicalNote from './ClinicalNote'

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
  )
}
