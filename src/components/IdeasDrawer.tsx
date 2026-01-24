'use client'

import { useState, useEffect } from 'react'

interface IdeasDrawerProps {
  isOpen: boolean
  onClose: () => void
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

export default function IdeasDrawer({ isOpen, onClose }: IdeasDrawerProps) {
  const [activeTab, setActiveTab] = useState<'inspiration' | 'tour' | 'features' | 'workflows' | 'feedback'>('workflows')
  const [tourStep, setTourStep] = useState(0)
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [savedWorkflow, setSavedWorkflow] = useState<string | null>(null)

  // Load saved workflow preference
  useEffect(() => {
    const saved = localStorage.getItem('sevaro-preferred-workflow')
    if (saved) {
      setSavedWorkflow(saved)
      setSelectedWorkflow(saved)
    }
  }, [])

  const saveWorkflowPreference = (workflowId: string) => {
    localStorage.setItem('sevaro-preferred-workflow', workflowId)
    setSavedWorkflow(workflowId)
    setSelectedWorkflow(workflowId)
  }

  const submitFeedback = () => {
    if (!feedbackText.trim()) return

    // Save feedback to localStorage (in production, this would go to a backend)
    const existingFeedback = JSON.parse(localStorage.getItem('sevaro-user-feedback') || '[]')
    const newFeedback = {
      id: Date.now().toString(),
      text: feedbackText,
      timestamp: new Date().toISOString(),
      user: 'current-user', // In production, this would be the actual user ID
    }
    existingFeedback.push(newFeedback)
    localStorage.setItem('sevaro-user-feedback', JSON.stringify(existingFeedback))

    setFeedbackSubmitted(true)
    setFeedbackText('')
    setTimeout(() => setFeedbackSubmitted(false), 3000)
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
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '520px',
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
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Choose Your Documentation Style
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Select a workflow that matches how you prefer to document. You can change this anytime.
                </p>
              </div>

              {WORKFLOWS.map((workflow) => (
                <div
                  key={workflow.id}
                  onClick={() => setSelectedWorkflow(selectedWorkflow === workflow.id ? null : workflow.id)}
                  style={{
                    marginBottom: '12px',
                    border: savedWorkflow === workflow.id ? `2px solid ${workflow.color}` : '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: selectedWorkflow === workflow.id ? 'var(--bg-gray)' : 'var(--bg-white)',
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
                        {savedWorkflow === workflow.id && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: workflow.color,
                            color: 'white',
                            fontWeight: 600,
                          }}>
                            SELECTED
                          </span>
                        )}
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
                        transform: selectedWorkflow === workflow.id ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {/* Expanded Content */}
                  {selectedWorkflow === workflow.id && (
                    <div style={{
                      padding: '0 16px 16px 16px',
                      borderTop: '1px solid var(--border)',
                      marginTop: '-8px',
                      paddingTop: '16px',
                    }}>
                      <div style={{ marginBottom: '12px' }}>
                        <h5 style={{ fontSize: '12px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Best For
                        </h5>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                          {workflow.bestFor}
                        </p>
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <h5 style={{ fontSize: '12px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          How It Works
                        </h5>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)' }}>
                          {workflow.steps.map((step, idx) => (
                            <li key={idx} style={{ marginBottom: '6px' }}>{step}</li>
                          ))}
                        </ol>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          saveWorkflowPreference(workflow.id)
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: savedWorkflow === workflow.id ? 'var(--bg-gray)' : workflow.color,
                          color: savedWorkflow === workflow.id ? 'var(--text-secondary)' : 'white',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {savedWorkflow === workflow.id ? '✓ Selected as Default' : 'Set as My Default Workflow'}
                      </button>
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
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Share Your Feedback
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Help us improve Sevaro Clinical. Your feedback is reviewed by our team.
                </p>
              </div>

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

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-white)',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/>
                      </svg>
                      Record Voice
                    </button>
                    <button
                      onClick={submitFeedback}
                      disabled={!feedbackText.trim()}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: feedbackText.trim() ? 'var(--primary)' : 'var(--bg-gray)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: feedbackText.trim() ? 'pointer' : 'not-allowed',
                        color: feedbackText.trim() ? 'white' : 'var(--text-muted)',
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
      </div>
    </>
  )
}
