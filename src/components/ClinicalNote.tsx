'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TopNav from './TopNav'
import LeftSidebar from './LeftSidebar'
import CenterPanel from './CenterPanel'
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

// Icon sidebar navigation
function IconSidebar({ activeIcon, setActiveIcon }: { activeIcon: string, setActiveIcon: (icon: string) => void }) {
  const icons = [
    { id: 'queue', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    )},
    { id: 'notes', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    )},
    { id: 'schedule', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    )},
    { id: 'calendar', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )},
    { id: 'diagnostic', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58 2.5 2.5 0 011.32-4.24 2.5 2.5 0 011.98-3A2.5 2.5 0 019.5 2z"/>
        <path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58 2.5 2.5 0 00-1.32-4.24 2.5 2.5 0 00-1.98-3A2.5 2.5 0 0014.5 2z"/>
      </svg>
    )},
  ]

  return (
    <div style={{
      width: '56px',
      background: 'var(--bg-white)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '12px',
      gap: '4px',
    }}>
      {icons.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveIcon(item.id)}
          style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: 'none',
            background: activeIcon === item.id ? 'var(--bg-gray)' : 'transparent',
            cursor: 'pointer',
            color: activeIcon === item.id ? 'var(--primary)' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
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
  const [activeIcon, setActiveIcon] = useState('queue')
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [aiDrawerTab, setAiDrawerTab] = useState('chart-prep')
  const [dotPhrasesOpen, setDotPhrasesOpen] = useState(false)
  const [activeTextField, setActiveTextField] = useState<string | null>(null)
  const [noteData, setNoteData] = useState({
    chiefComplaint: currentVisit?.chief_complaint || ['Headache'],
    hpi: currentVisit?.clinical_notes?.hpi || '',
    ros: currentVisit?.clinical_notes?.ros || 'Reviewed',
    allergies: currentVisit?.clinical_notes?.allergies || 'NKDA',
    historyAvailable: 'Yes',
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

  const updateNote = (field: string, value: any) => {
    setNoteData(prev => ({ ...prev, [field]: value }))
  }

  const handleInsertPhrase = (text: string) => {
    if (activeTextField) {
      const currentValue = noteData[activeTextField as keyof typeof noteData] || ''
      updateNote(activeTextField, currentValue + text)
    }
  }

  const openDotPhrases = (field?: string) => {
    if (field) setActiveTextField(field)
    setDotPhrasesOpen(true)
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
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Icon Sidebar */}
        <IconSidebar activeIcon={activeIcon} setActiveIcon={setActiveIcon} />

        {/* Main Content Area */}
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
        />
      </div>

      {/* Floating Action Buttons */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg-white)',
        padding: '8px',
        borderRadius: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: 100,
      }}>
        {/* Microphone - Voice Recording */}
        <button
          onClick={() => openAiDrawer('document')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}
          title="Voice Recording"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>

        {/* Lightning - Quick Actions */}
        <button
          onClick={() => openAiDrawer('chart-prep')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F59E0B',
            transition: 'all 0.2s',
          }}
          title="Quick Actions"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </button>

        {/* Star - AI Assistant */}
        <button
          onClick={() => openAiDrawer('ask-ai')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            border: 'none',
            background: 'var(--primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            transition: 'all 0.2s',
          }}
          title="AI Assistant"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>

        {/* Dot Phrases */}
        <button
          onClick={() => openDotPhrases('hpi')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8B5CF6',
            transition: 'all 0.2s',
          }}
          title="Dot Phrases"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </button>
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

      {dotPhrasesOpen && (
        <DotPhrasesDrawer
          isOpen={dotPhrasesOpen}
          onClose={() => setDotPhrasesOpen(false)}
          onInsertPhrase={handleInsertPhrase}
          activeField={activeTextField}
        />
      )}
    </div>
  )
}
