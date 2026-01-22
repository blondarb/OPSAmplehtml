'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TopNav from './TopNav'
import LeftSidebar from './LeftSidebar'
import CenterPanel from './CenterPanel'
import RightActionBar from './RightActionBar'
import AiDrawer from './AiDrawer'
import DotPhrasesDrawer from './DotPhrasesDrawer'
import type { User } from '@supabase/supabase-js'

interface ClinicalNoteProps {
  user: User
  patient: any
  currentVisit: any
  priorVisits: any[]
  imagingStudies: any[]
  scoreHistory: any[]
}

export default function ClinicalNote({
  user,
  patient,
  currentVisit,
  priorVisits,
  imagingStudies,
  scoreHistory,
}: ClinicalNoteProps) {
  const [darkMode, setDarkMode] = useState(false)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [aiDrawerTab, setAiDrawerTab] = useState('chart-prep')
  const [phrasesDrawerOpen, setPhrasesDrawerOpen] = useState(false)
  const [activeTextField, setActiveTextField] = useState<string | null>(null)
  const [noteData, setNoteData] = useState({
    chiefComplaint: currentVisit?.chief_complaint || ['Headache'],
    hpi: currentVisit?.clinical_notes?.hpi || '',
    ros: currentVisit?.clinical_notes?.ros || 'Reviewed',
    allergies: currentVisit?.clinical_notes?.allergies || 'NKDA',
    assessment: currentVisit?.clinical_notes?.assessment || '',
    plan: currentVisit?.clinical_notes?.plan || '',
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check for saved dark mode preference
    const savedDarkMode = localStorage.getItem('sevaro-dark-mode')
    if (savedDarkMode === 'true') {
      setDarkMode(true)
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    localStorage.setItem('sevaro-dark-mode', String(newDarkMode))
    document.documentElement.setAttribute('data-theme', newDarkMode ? 'dark' : '')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const openAiDrawer = (tab: string) => {
    setAiDrawerTab(tab)
    setAiDrawerOpen(true)
  }

  const openPhrasesDrawer = (field?: string) => {
    if (field) setActiveTextField(field)
    setPhrasesDrawerOpen(true)
  }

  const handleInsertPhrase = (text: string) => {
    if (activeTextField) {
      const currentValue = noteData[activeTextField as keyof typeof noteData] || ''
      updateNote(activeTextField, currentValue + text)
    }
  }

  const updateNote = (field: string, value: any) => {
    setNoteData(prev => ({ ...prev, [field]: value }))
  }

  const saveNote = async () => {
    if (!currentVisit?.clinical_notes?.id) return

    const { error } = await supabase
      .from('clinical_notes')
      .update({
        hpi: noteData.hpi,
        ros: noteData.ros,
        allergies: noteData.allergies,
        assessment: noteData.assessment,
        plan: noteData.plan,
      })
      .eq('id', currentVisit.clinical_notes.id)

    if (error) {
      console.error('Error saving note:', error)
    }
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNav
        user={user}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        onSignOut={handleSignOut}
        openAiDrawer={openAiDrawer}
        openPhrasesDrawer={openPhrasesDrawer}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftSidebar
          patient={patient}
          priorVisits={priorVisits}
          scoreHistory={scoreHistory}
        />

        <CenterPanel
          noteData={noteData}
          updateNote={updateNote}
          currentVisit={currentVisit}
          imagingStudies={imagingStudies}
          openAiDrawer={openAiDrawer}
          openPhrasesDrawer={openPhrasesDrawer}
          setActiveTextField={setActiveTextField}
        />

        <RightActionBar
          openAiDrawer={openAiDrawer}
          onSave={saveNote}
        />
      </div>

      {aiDrawerOpen && (
        <AiDrawer
          isOpen={aiDrawerOpen}
          onClose={() => setAiDrawerOpen(false)}
          activeTab={aiDrawerTab}
          setActiveTab={setAiDrawerTab}
          patient={patient}
          noteData={noteData}
          updateNote={updateNote}
        />
      )}

      <DotPhrasesDrawer
        isOpen={phrasesDrawerOpen}
        onClose={() => setPhrasesDrawerOpen(false)}
        onInsertPhrase={handleInsertPhrase}
        activeField={activeTextField}
      />
    </div>
  )
}
