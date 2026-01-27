'use client'

import { useState, useEffect } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

interface IdeasDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: 'inspiration' | 'tour' | 'features' | 'workflows' | 'feedback'
  onStartTour?: () => void
}

// Workflow quick selection guide
const WORKFLOW_GUIDE = {
  title: 'Which Style Should I Use?',
  scenarios: [
    { situation: 'New to the app', recommendation: 'hybrid-light', reason: 'Learn the interface while getting AI assistance' },
    { situation: 'Busy clinic day', recommendation: 'ai-driven', reason: 'Minimize clicks, let AI do the heavy lifting' },
    { situation: 'Complex patient', recommendation: 'manual', reason: 'Full control over every detail' },
    { situation: 'Routine follow-up', recommendation: 'ai-driven', reason: 'Quick documentation for simple visits' },
  ],
}

// Workflow definitions
const WORKFLOWS = [
  {
    id: 'ai-driven',
    name: 'Fully AI-Driven',
    icon: '🤖',
    description: 'AI handles most documentation. You dictate, AI drafts.',
    bestFor: 'High-volume days, routine visits, users comfortable with AI',
    steps: [
      'Dictate freely during the visit (Voice Drawer → Document)',
      'AI transcribes and extracts HPI, ROS, Exam, Assessment, Plan',
      'Review AI-generated sections in each tab',
      'Make minor edits as needed',
      'Click Generate Note → review and copy to EHR',
    ],
    keyButtons: ['🎤 Mic (red)', '✨ Generate Note (purple)'],
    timeToComplete: '2-5 min review',
    aiUsage: 'Maximum',
    userClicks: 'Minimal',
    color: '#8B5CF6',
  },
  {
    id: 'manual',
    name: 'Fully Manual',
    icon: '✍️',
    description: 'Complete control. Type or dictate without AI generation.',
    bestFor: 'Complex cases, users who prefer full control, training',
    steps: [
      'Navigate through tabs: History → Imaging → Exam → Recommendation',
      'Type or dictate content into each field',
      'Use clinical scales and exam checkboxes as needed',
      'Select diagnoses from the differential section',
      'Click Generate Note to compile your entries',
    ],
    keyButtons: ['Tabs', '⚡ Dot Phrases (purple)', '✨ Generate Note'],
    timeToComplete: '10-15 min',
    aiUsage: 'None',
    userClicks: 'Maximum',
    color: '#6B7280',
  },
  {
    id: 'hybrid-light',
    name: 'Hybrid – Lightweight AI',
    icon: '⚡',
    description: 'AI assists with prep, you complete the note manually.',
    bestFor: 'Users who want AI suggestions but prefer manual completion',
    steps: [
      'Use Chart Prep before the visit for AI-generated summary',
      'Review suggested HPI and relevant history',
      'Navigate tabs and complete sections manually',
      'Accept or modify AI suggestions where helpful',
      'Generate final note with your content prioritized',
    ],
    keyButtons: ['🎤 Chart Prep', 'Tabs', '✨ Generate Note'],
    timeToComplete: '5-10 min',
    aiUsage: 'Light (Chart Prep only)',
    userClicks: 'Moderate',
    color: '#06B6D4',
  },
  {
    id: 'hybrid-advanced',
    name: 'Hybrid – Targeted AI',
    icon: '🎯',
    description: 'Selective AI use for specific sections you choose.',
    bestFor: 'Experienced users who know which sections benefit from AI',
    steps: [
      'Use Chart Prep and/or Document for AI content',
      'Navigate tabs and review AI-generated content',
      'Use field-level AI actions (Improve, Expand, Summarize)',
      'Accept AI for some sections, override for others',
      'Smart Recommendations for treatment planning',
    ],
    keyButtons: ['🎤 Mic', '⭐ AI Actions', '💡 Smart Recs', '✨ Generate Note'],
    timeToComplete: '5-8 min',
    aiUsage: 'Selective',
    userClicks: 'Moderate',
    color: '#10B981',
  },
]

// Feature list
const FEATURES = [
  {
    category: 'Voice & Dictation',
    items: [
      { name: 'Chart Prep', description: 'Pre-visit dictation with AI categorization and summary' },
      { name: 'Document', description: 'Full visit recording with clinical content extraction' },
      { name: 'Field Dictation', description: 'Dictate directly into any text field' },
    ],
  },
  {
    category: 'AI Assistance',
    items: [
      { name: 'Ask AI', description: 'Query clinical guidelines and get context-aware answers' },
      { name: 'Field Actions', description: 'Improve, Expand, or Summarize any text field' },
      { name: 'Smart Recommendations', description: 'Treatment suggestions based on diagnosis' },
      { name: 'Patient Summary', description: 'Generate plain-language visit summaries' },
      { name: 'Patient Handouts', description: 'Create educational materials for patients' },
    ],
  },
  {
    category: 'Clinical Tools',
    items: [
      { name: 'Clinical Scales', description: 'MIDAS, PHQ-9, NIHSS, Modified Ashworth, and more' },
      { name: 'Differential Diagnosis', description: '134 neurology diagnoses with ICD-10 codes' },
      { name: 'Exam Templates', description: 'Pre-built and custom examination templates' },
      { name: 'Dot Phrases', description: 'Text expansion shortcuts for common entries' },
    ],
  },
  {
    category: 'Workflow',
    items: [
      { name: 'Generate Note', description: 'Compile all content into formatted clinical note' },
      { name: 'Note Types', description: 'New Consult vs Follow-up with appropriate sections' },
      { name: 'Tab Customization', description: 'Reorder tabs to match your workflow' },
      { name: 'Vertical Scroll', description: 'View all sections on one scrollable page' },
    ],
  },
]

// Inspiration content
const INSPIRATION = [
  {
    title: 'Tip: Voice-First Documentation',
    content: 'Start your visit with the Document feature recording. Speak naturally with your patient - AI will extract the clinical content automatically.',
    type: 'tip',
  },
  {
    title: 'Did You Know?',
    content: 'You can dictate into any text field by clicking the red microphone button. No need to type if you prefer speaking.',
    type: 'info',
  },
  {
    title: 'Pro Tip: Smart Recommendations',
    content: 'After selecting diagnoses, check the Smart Recommendations section for evidence-based treatment suggestions you can add to your plan with one click.',
    type: 'tip',
  },
  {
    title: 'Workflow Insight',
    content: 'The Generate Note button works with whatever content you have - AI-generated, manually typed, or a mix. Your edits always take priority.',
    type: 'info',
  },
  {
    title: 'Efficiency Tip',
    content: 'Use Dot Phrases for repetitive text. Type a shortcut like ".normalexam" and it expands to your full normal exam template.',
    type: 'tip',
  },
]

// Tour steps
const TOUR_STEPS = [
  {
    title: 'Welcome to Sevaro Clinical',
    content: 'This quick tour will show you the key features and how to use them effectively.',
    section: 'intro',
  },
  {
    title: '1. Start with Voice or Manual Entry',
    content: 'Use the red microphone button to open Voice & Dictation, or navigate through tabs to enter content manually. Both approaches work seamlessly.',
    section: 'voice',
  },
  {
    title: '2. Navigate the Clinical Note',
    content: 'Four tabs organize your note: History (chief complaint, HPI, ROS), Imaging/Results, Physical Exams, and Recommendation (diagnosis, assessment, plan).',
    section: 'tabs',
  },
  {
    title: '3. Use AI When Helpful',
    content: 'The teal AI button opens AI tools. Use Chart Prep before visits, Document during visits, or Ask AI for clinical questions.',
    section: 'ai',
  },
  {
    title: '4. Clinical Scales & Exams',
    content: 'Smart Scales appear based on your selected conditions. Exam checkboxes auto-generate formatted exam findings.',
    section: 'tools',
  },
  {
    title: '5. Generate Your Note',
    content: 'Click the purple Generate Note button to compile everything into a formatted clinical note. Choose New Consult or Follow-up layout.',
    section: 'generate',
  },
  {
    title: 'Ready to Go!',
    content: 'You can always return here for help. Check Settings to customize your experience, including AI preferences and tab order.',
    section: 'complete',
  },
]

// TL;DR Quick Reference
const TLDR = [
  { action: 'Record visit', howTo: 'Mic button → Document tab → Start Recording' },
  { action: 'Pre-visit prep', howTo: 'Mic button → Chart Prep tab → Dictate notes' },
  { action: 'Ask AI a question', howTo: 'AI button → Ask AI → Type question' },
  { action: 'Add diagnosis', howTo: 'Recommendation tab → Search ICD-10 diagnoses' },
  { action: 'Generate note', howTo: 'Purple Generate Note button → Select type → Copy' },
  { action: 'Use dot phrase', howTo: 'Type shortcut (e.g., .normalexam) in any field' },
  { action: 'Run clinical scale', howTo: 'History tab → Smart Scales → Select scale' },
  { action: 'Change settings', howTo: 'User avatar → Settings gear icon' },
]

// Feedback item interface
interface FeedbackItem {
  id: string
  text: string
  timestamp: string
  user: string
  upvotes: string[]  // Array of user IDs who upvoted
  downvotes: string[] // Array of user IDs who downvoted
}

export default function IdeasDrawer({ isOpen, onClose, initialTab, onStartTour }: IdeasDrawerProps) {
  const [activeTab, setActiveTab] = useState<'inspiration' | 'tour' | 'features' | 'workflows' | 'feedback'>(initialTab || 'workflows')

  // Update active tab when initialTab changes (e.g., when opening from feedback button)
  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab)
    }
  }, [initialTab, isOpen])
  const [tourStep, setTourStep] = useState(0)
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackView, setFeedbackView] = useState<'submit' | 'browse'>('browse')
  const [allFeedback, setAllFeedback] = useState<FeedbackItem[]>([])
  const [currentUserId] = useState(() => {
    // Get or create a persistent user ID for voting
    if (typeof window === 'undefined') return 'server'
    let id = localStorage.getItem('sevaro-user-id')
    if (!id) {
      id = 'user-' + Date.now().toString(36) + Math.random().toString(36).substr(2)
      localStorage.setItem('sevaro-user-id', id)
    }
    return id
  })

  // Voice recording for feedback
  const {
    isRecording,
    isPaused,
    isTranscribing,
    error: voiceError,
    transcribedText,
    recordingDuration,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearTranscription,
  } = useVoiceRecorder()

  // When transcription completes, append to feedback text
  useEffect(() => {
    if (transcribedText) {
      setFeedbackText(prev => {
        const separator = prev.trim() ? '\n\n' : ''
        return prev + separator + transcribedText
      })
      clearTranscription()
    }
  }, [transcribedText, clearTranscription])


  // Load all feedback when feedback tab is active
  useEffect(() => {
    if (activeTab === 'feedback') {
      loadAllFeedback()
    }
  }, [activeTab])

  const loadAllFeedback = () => {
    const stored = localStorage.getItem('sevaro-user-feedback')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Migrate old feedback format to new format with votes
        const migrated = parsed.map((item: any) => ({
          ...item,
          upvotes: item.upvotes || [],
          downvotes: item.downvotes || [],
        }))
        // Sort by net votes (upvotes - downvotes), then by date
        migrated.sort((a: FeedbackItem, b: FeedbackItem) => {
          const aNet = a.upvotes.length - a.downvotes.length
          const bNet = b.upvotes.length - b.downvotes.length
          if (bNet !== aNet) return bNet - aNet
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        })
        setAllFeedback(migrated)
      } catch (e) {
        setAllFeedback([])
      }
    }
  }

  const handleVote = (feedbackId: string, voteType: 'up' | 'down') => {
    const stored = localStorage.getItem('sevaro-user-feedback')
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      const updated = parsed.map((item: FeedbackItem) => {
        if (item.id !== feedbackId) return item

        // Ensure arrays exist
        const upvotes = item.upvotes || []
        const downvotes = item.downvotes || []

        if (voteType === 'up') {
          // If already upvoted, remove upvote (toggle)
          if (upvotes.includes(currentUserId)) {
            return { ...item, upvotes: upvotes.filter((id: string) => id !== currentUserId) }
          }
          // Add upvote and remove downvote if exists
          return {
            ...item,
            upvotes: [...upvotes, currentUserId],
            downvotes: downvotes.filter((id: string) => id !== currentUserId),
          }
        } else {
          // If already downvoted, remove downvote (toggle)
          if (downvotes.includes(currentUserId)) {
            return { ...item, downvotes: downvotes.filter((id: string) => id !== currentUserId) }
          }
          // Add downvote and remove upvote if exists
          return {
            ...item,
            downvotes: [...downvotes, currentUserId],
            upvotes: upvotes.filter((id: string) => id !== currentUserId),
          }
        }
      })

      localStorage.setItem('sevaro-user-feedback', JSON.stringify(updated))
      loadAllFeedback()
    } catch (e) {
      console.error('Error voting:', e)
    }
  }


  const submitFeedback = () => {
    if (!feedbackText.trim()) return

    // Save feedback to localStorage (in production, this would go to a backend)
    const existingFeedback = JSON.parse(localStorage.getItem('sevaro-user-feedback') || '[]')
    const newFeedback: FeedbackItem = {
      id: Date.now().toString(),
      text: feedbackText,
      timestamp: new Date().toISOString(),
      user: currentUserId,
      upvotes: [],
      downvotes: [],
    }
    existingFeedback.push(newFeedback)
    localStorage.setItem('sevaro-user-feedback', JSON.stringify(existingFeedback))

    setFeedbackSubmitted(true)
    setFeedbackText('')
    setTimeout(() => {
      setFeedbackSubmitted(false)
      setFeedbackView('browse')
      loadAllFeedback()
    }, 2000)
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'workflows' as const, label: 'Workflows', icon: '🔄' },
    { id: 'tour' as const, label: 'Tour', icon: '🎯' },
    { id: 'features' as const, label: 'Features', icon: '✨' },
    { id: 'inspiration' as const, label: 'Tips', icon: '💡' },
    { id: 'feedback' as const, label: 'Feedback', icon: '💬' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        className="ai-drawer show"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '520px',
          maxWidth: '100vw', // Responsive: never exceed viewport
          height: '100vh',
          background: 'var(--bg-white)',
          boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #0D9488 0%, #06B6D4 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" fill="rgba(255,255,255,0.2)"/>
              <path d="M20 8c-2.5 0-4.5 1-5.5 2.5C13.5 12 13 14 13 16c0 2.5 1 4.5 2.5 6 1 1 1.5 2.5 1.5 4v2h6v-2c0-1.5.5-3 1.5-4 1.5-1.5 2.5-3.5 2.5-6 0-2-.5-4-1.5-5.5C24.5 9 22.5 8 20 8z" fill="white"/>
              <path d="M17 30h6v2h-6v-2z" fill="white"/>
              <circle cx="20" cy="16" r="2" fill="#0D9488"/>
            </svg>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                Getting Started
              </h2>
              <p style={{ fontSize: '12px', opacity: 0.9, margin: 0 }}>
                Learn how to use Sevaro Clinical effectively
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-gray)',
            padding: '0 12px',
            overflowX: 'auto',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 14px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Workflows Tab */}
          {activeTab === 'workflows' && (
            <div>
              {/* Quick Selection Guide */}
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                borderRadius: '12px',
                border: '1px solid #3B82F6',
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎯</span> {WORKFLOW_GUIDE.title}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {WORKFLOW_GUIDE.scenarios.map((scenario, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: '#1E40AF', minWidth: '110px' }}>{scenario.situation}:</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: WORKFLOWS.find(w => w.id === scenario.recommendation)?.color || '#6B7280',
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}>
                        {WORKFLOWS.find(w => w.id === scenario.recommendation)?.name}
                      </span>
                      <span style={{ color: '#64748B' }}>– {scenario.reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Documentation Styles
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Explore different approaches to clinical documentation. Use whichever style fits your current situation.
                </p>
              </div>

              {WORKFLOWS.map((workflow) => (
                <div
                  key={workflow.id}
                  onClick={() => setExpandedWorkflow(expandedWorkflow === workflow.id ? null : workflow.id)}
                  style={{
                    marginBottom: '12px',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: expandedWorkflow === workflow.id ? 'var(--bg-gray)' : 'var(--bg-white)',
                  }}
                >
                  {/* Workflow Header */}
                  <div style={{
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}>
                    <span style={{ fontSize: '24px' }}>{workflow.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                          {workflow.name}
                        </h4>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
                        {workflow.description}
                      </p>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>AI: {workflow.aiUsage}</span>
                        <span>•</span>
                        <span>Clicks: {workflow.userClicks}</span>
                      </div>
                    </div>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="2"
                      style={{
                        transform: expandedWorkflow === workflow.id ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {/* Expanded Content */}
                  {expandedWorkflow === workflow.id && (
                    <div style={{
                      padding: '0 16px 16px 16px',
                      borderTop: '1px solid var(--border)',
                      marginTop: '-8px',
                      paddingTop: '16px',
                    }}>
                      {/* Key Buttons & Time Row */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {workflow.keyButtons && (
                          <div style={{ flex: 1, minWidth: '150px' }}>
                            <h5 style={{ fontSize: '11px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              Key Buttons
                            </h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {workflow.keyButtons.map((btn, idx) => (
                                <span key={idx} style={{
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  background: 'var(--bg-gray)',
                                  border: '1px solid var(--border)',
                                  fontSize: '11px',
                                  color: 'var(--text-secondary)',
                                }}>
                                  {btn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {workflow.timeToComplete && (
                          <div style={{ minWidth: '80px' }}>
                            <h5 style={{ fontSize: '11px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              Typical Time
                            </h5>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: '#ECFDF5',
                              border: '1px solid #10B981',
                              fontSize: '11px',
                              color: '#047857',
                              fontWeight: 600,
                            }}>
                              {workflow.timeToComplete}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <h5 style={{ fontSize: '11px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Best For
                        </h5>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                          {workflow.bestFor}
                        </p>
                      </div>
                      <div>
                        <h5 style={{ fontSize: '11px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Step by Step
                        </h5>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)' }}>
                          {workflow.steps.map((step, idx) => (
                            <li key={idx} style={{ marginBottom: '6px' }}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Workflow Precedence Note */}
              <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                borderRadius: '12px',
                border: '1px solid #F59E0B',
              }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚠️</span> Important: Edit Priority
                </h4>
                <p style={{ fontSize: '12px', color: '#78350F', margin: 0, lineHeight: 1.5 }}>
                  <strong>Your manual edits always take priority over AI content.</strong> If you type in a field after AI has generated content, your text is preserved. The Generate Note feature combines all sources, but your direct input is never overwritten.
                </p>
              </div>
            </div>
          )}

          {/* Tour Tab */}
          {activeTab === 'tour' && (
            <div>
              {/* Launch Interactive Tour Button */}
              {onStartTour && (
                <div style={{
                  marginBottom: '24px',
                  padding: '16px',
                  background: 'linear-gradient(135deg, #0D9488 0%, #06B6D4 100%)',
                  borderRadius: '12px',
                  color: 'white',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
                    </svg>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Interactive Guided Tour</h4>
                      <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>
                        See each feature highlighted on the actual interface
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      onStartTour()
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 3l14 9-14 9V3z"/>
                    </svg>
                    Launch Interactive Tour
                  </button>
                </div>
              )}

              {/* In-Drawer Tour - Text-based walkthrough */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quick Walkthrough
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Read through the key features step by step
                </p>
              </div>

              {/* Progress */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Step {tourStep + 1} of {TOUR_STEPS.length}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {Math.round(((tourStep + 1) / TOUR_STEPS.length) * 100)}%
                  </span>
                </div>
                <div style={{
                  height: '4px',
                  background: 'var(--border)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${((tourStep + 1) / TOUR_STEPS.length) * 100}%`,
                    background: 'var(--primary)',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>

              {/* Current Step */}
              <div style={{
                padding: '24px',
                background: 'var(--bg-gray)',
                borderRadius: '12px',
                marginBottom: '20px',
                minHeight: '150px',
              }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                  {TOUR_STEPS[tourStep].title}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {TOUR_STEPS[tourStep].content}
                </p>
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setTourStep(Math.max(0, tourStep - 1))}
                  disabled={tourStep === 0}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: tourStep === 0 ? 'not-allowed' : 'pointer',
                    color: tourStep === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                  }}
                >
                  ← Previous
                </button>
                <button
                  onClick={() => {
                    if (tourStep === TOUR_STEPS.length - 1) {
                      onClose()
                    } else {
                      setTourStep(tourStep + 1)
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--primary)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {tourStep === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next →'}
                </button>
              </div>

              {/* TL;DR Section */}
              <div style={{ marginTop: '32px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span> Quick Reference (TL;DR)
                </h4>
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  {TLDR.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        padding: '10px 12px',
                        borderBottom: idx < TLDR.length - 1 ? '1px solid var(--border)' : 'none',
                        background: idx % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-gray)',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', width: '120px', flexShrink: 0 }}>
                        {item.action}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {item.howTo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div>
              {FEATURES.map((category, idx) => (
                <div key={idx} style={{ marginBottom: '24px' }}>
                  <h3 style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    margin: '0 0 12px 0',
                    color: 'var(--primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {category.category}
                  </h3>
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}>
                    {category.items.map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        style={{
                          padding: '12px 14px',
                          borderBottom: itemIdx < category.items.length - 1 ? '1px solid var(--border)' : 'none',
                          background: itemIdx % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-gray)',
                        }}
                      >
                        <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                          {item.name}
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                          {item.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inspiration/Tips Tab */}
          {activeTab === 'inspiration' && (
            <div>
              {INSPIRATION.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px',
                    marginBottom: '12px',
                    borderRadius: '12px',
                    background: item.type === 'tip'
                      ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)'
                      : 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                    border: item.type === 'tip' ? '1px solid #10B981' : '1px solid #3B82F6',
                  }}
                >
                  <h4 style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    margin: '0 0 8px 0',
                    color: item.type === 'tip' ? '#047857' : '#1D4ED8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span>{item.type === 'tip' ? '💡' : 'ℹ️'}</span>
                    {item.title}
                  </h4>
                  <p style={{
                    fontSize: '13px',
                    color: item.type === 'tip' ? '#065F46' : '#1E40AF',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Feedback Tab */}
          {activeTab === 'feedback' && (
            <div>
              {/* Toggle between Browse and Submit */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '20px',
                padding: '4px',
                background: 'var(--bg-gray)',
                borderRadius: '8px',
              }}>
                <button
                  onClick={() => setFeedbackView('browse')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: feedbackView === 'browse' ? 'var(--bg-white)' : 'transparent',
                    boxShadow: feedbackView === 'browse' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: feedbackView === 'browse' ? 'var(--text-primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  Browse ({allFeedback.length})
                </button>
                <button
                  onClick={() => setFeedbackView('submit')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: feedbackView === 'submit' ? 'var(--bg-white)' : 'transparent',
                    boxShadow: feedbackView === 'submit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: feedbackView === 'submit' ? 'var(--text-primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Submit New
                </button>
              </div>

              {/* Browse Feedback View */}
              {feedbackView === 'browse' && (
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                    Vote on feedback to help us prioritize improvements. Sorted by popularity.
                  </p>

                  {allFeedback.length === 0 ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      background: 'var(--bg-gray)',
                      borderRadius: '12px',
                    }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                      <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                        No feedback yet. Be the first to share!
                      </p>
                      <button
                        onClick={() => setFeedbackView('submit')}
                        style={{
                          marginTop: '16px',
                          padding: '10px 20px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'var(--primary)',
                          color: 'white',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Submit Feedback
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {allFeedback.map((item) => {
                        const netVotes = item.upvotes.length - item.downvotes.length
                        const hasUpvoted = item.upvotes.includes(currentUserId)
                        const hasDownvoted = item.downvotes.includes(currentUserId)
                        const isOwnFeedback = item.user === currentUserId

                        return (
                          <div
                            key={item.id}
                            style={{
                              padding: '16px',
                              background: 'var(--bg-white)',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {/* Vote Column */}
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                minWidth: '48px',
                              }}>
                                <button
                                  onClick={() => handleVote(item.id, 'up')}
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '8px',
                                    border: hasUpvoted ? '2px solid #10B981' : '1px solid var(--border)',
                                    background: hasUpvoted ? '#D1FAE5' : 'var(--bg-white)',
                                    cursor: 'pointer',
                                    color: hasUpvoted ? '#059669' : 'var(--text-muted)',
                                    transition: 'all 0.15s',
                                  }}
                                  title="Upvote"
                                >
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
                                    <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                                  </svg>
                                </button>
                                <span style={{
                                  fontSize: '16px',
                                  fontWeight: 700,
                                  color: netVotes > 0 ? '#059669' : netVotes < 0 ? '#DC2626' : 'var(--text-muted)',
                                }}>
                                  {netVotes > 0 ? '+' : ''}{netVotes}
                                </span>
                                <button
                                  onClick={() => handleVote(item.id, 'down')}
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '8px',
                                    border: hasDownvoted ? '2px solid #EF4444' : '1px solid var(--border)',
                                    background: hasDownvoted ? '#FEE2E2' : 'var(--bg-white)',
                                    cursor: 'pointer',
                                    color: hasDownvoted ? '#DC2626' : 'var(--text-muted)',
                                    transition: 'all 0.15s',
                                  }}
                                  title="Downvote"
                                >
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                    <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/>
                                    <path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"/>
                                  </svg>
                                </button>
                              </div>

                              {/* Content Column */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                  fontSize: '14px',
                                  color: 'var(--text-primary)',
                                  margin: '0 0 8px 0',
                                  lineHeight: 1.5,
                                  whiteSpace: 'pre-wrap',
                                }}>
                                  {item.text}
                                </p>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  fontSize: '12px',
                                  color: 'var(--text-muted)',
                                }}>
                                  <span>
                                    {new Date(item.timestamp).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}
                                  </span>
                                  {isOwnFeedback && (
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      background: '#E0E7FF',
                                      color: '#4F46E5',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                    }}>
                                      YOUR FEEDBACK
                                    </span>
                                  )}
                                  {item.upvotes.length > 0 && (
                                    <span style={{ color: '#059669' }}>
                                      {item.upvotes.length} upvote{item.upvotes.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Feedback View */}
              {feedbackView === 'submit' && (
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                    Help us improve Sevaro Clinical. Your feedback is reviewed by our team.
                  </p>

                  {feedbackSubmitted ? (
                    <div style={{
                      padding: '24px',
                      background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                      borderRadius: '12px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0', color: '#047857' }}>
                        Thank You!
                      </h4>
                      <p style={{ fontSize: '13px', color: '#065F46', margin: 0 }}>
                        Your feedback has been submitted successfully.
                      </p>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Tell us what you think, report a bug, or suggest a feature..."
                        style={{
                          width: '100%',
                          minHeight: '150px',
                          padding: '14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-white)',
                          fontSize: '14px',
                          color: 'var(--text-primary)',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          marginBottom: '16px',
                        }}
                      />

                      {/* Voice Recording Status */}
                      {(isRecording || isTranscribing) && (
                        <div style={{
                          padding: '12px 16px',
                          marginBottom: '16px',
                          borderRadius: '8px',
                          background: isRecording ? '#FEE2E2' : '#E0E7FF',
                          border: isRecording ? '1px solid #EF4444' : '1px solid #6366F1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {isRecording && (
                              <>
                                <div style={{
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  background: isPaused ? '#F59E0B' : '#EF4444',
                                  animation: isPaused ? 'none' : 'pulse 1.5s infinite',
                                }} />
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#991B1B' }}>
                                  {isPaused ? 'Paused' : 'Recording...'} {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                </span>
                              </>
                            )}
                            {isTranscribing && (
                              <>
                                <div style={{
                                  width: '16px',
                                  height: '16px',
                                  border: '2px solid #6366F1',
                                  borderTopColor: 'transparent',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite',
                                }} />
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#4338CA' }}>
                                  Transcribing...
                                </span>
                              </>
                            )}
                          </div>
                          {isRecording && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={isPaused ? resumeRecording : pauseRecording}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#FEF3C7',
                                  color: '#D97706',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {isPaused ? 'Resume' : 'Pause'}
                              </button>
                              <button
                                onClick={stopRecording}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#DC2626',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Stop
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Voice Error */}
                      {voiceError && (
                        <div style={{
                          padding: '12px 16px',
                          marginBottom: '16px',
                          borderRadius: '8px',
                          background: '#FEF2F2',
                          border: '1px solid #EF4444',
                          color: '#991B1B',
                          fontSize: '13px',
                        }}>
                          {voiceError}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={isRecording ? stopRecording : startRecording}
                          disabled={isTranscribing}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '8px',
                            border: isRecording ? 'none' : '1px solid var(--border)',
                            background: isRecording ? '#DC2626' : isTranscribing ? 'var(--bg-gray)' : 'var(--bg-white)',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: isTranscribing ? 'not-allowed' : 'pointer',
                            color: isRecording ? 'white' : isTranscribing ? 'var(--text-muted)' : 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
                          </svg>
                          {isRecording ? 'Stop Recording' : isTranscribing ? 'Transcribing...' : 'Record Voice'}
                        </button>
                        <button
                          onClick={submitFeedback}
                          disabled={!feedbackText.trim() || isRecording || isTranscribing}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: feedbackText.trim() && !isRecording && !isTranscribing ? 'var(--primary)' : 'var(--bg-gray)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: feedbackText.trim() && !isRecording && !isTranscribing ? 'pointer' : 'not-allowed',
                            color: feedbackText.trim() && !isRecording && !isTranscribing ? 'white' : 'var(--text-muted)',
                          }}
                        >
                          Submit Feedback
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
