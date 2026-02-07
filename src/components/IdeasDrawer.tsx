'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import type { TourPhase } from './OnboardingTour'

interface IdeasDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: 'inspiration' | 'tour' | 'features' | 'workflows' | 'feedback'
  onStartTour?: (phase?: TourPhase) => void
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

// Feedback status config
type FeedbackStatus = 'pending' | 'approved' | 'in_progress' | 'addressed' | 'declined'

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: 'Pending Review', color: '#92400E', bg: '#FEF3C7', border: '#F59E0B' },
  approved: { label: 'Approved', color: '#1E40AF', bg: '#DBEAFE', border: '#3B82F6' },
  in_progress: { label: 'In Progress', color: '#7C2D12', bg: '#FED7AA', border: '#F97316' },
  addressed: { label: 'Addressed', color: '#047857', bg: '#D1FAE5', border: '#10B981' },
  declined: { label: 'Declined', color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF' },
}

// Feedback item interface (matches Supabase feedback table)
interface FeedbackItem {
  id: string
  text: string
  user_id: string
  user_email: string
  upvotes: string[]
  downvotes: string[]
  status: FeedbackStatus
  admin_response: string | null
  admin_user_email: string | null
  status_updated_at: string | null
  comment_count: number
  created_at: string
  updated_at: string
}

interface FeedbackComment {
  id: string
  feedback_id: string
  user_id: string
  user_email: string
  text: string
  is_admin_comment: boolean
  created_at: string
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
  const [feedbackView, setFeedbackView] = useState<'submit' | 'browse' | 'admin'>('browse')
  const [allFeedback, setAllFeedback] = useState<FeedbackItem[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all')
  const [ownershipFilter, setOwnershipFilter] = useState<'mine' | 'all'>('mine')  // Default to "My Feedback"

  // Edit feedback state
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null)
  const [editingFeedbackText, setEditingFeedbackText] = useState('')

  // Comments state
  const [expandedComments, setExpandedComments] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, FeedbackComment[]>>({})
  const [commentsLoading, setCommentsLoading] = useState<string | null>(null)
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({})

  // Admin response state
  const [adminResponseText, setAdminResponseText] = useState<Record<string, string>>({})

  // Admin management state
  const [seedAdmin, setSeedAdmin] = useState<string>('')
  const [elevatedAdmins, setElevatedAdmins] = useState<string[]>([])
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [adminDataLoading, setAdminDataLoading] = useState(false)
  const [systemPrompts, setSystemPrompts] = useState<Array<{ id: string; name: string; file: string; model: string; description: string }>>([])
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)
  const [backlogCopied, setBacklogCopied] = useState(false)

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

  const loadAllFeedback = async () => {
    setFeedbackLoading(true)
    try {
      const res = await fetch('/api/feedback')
      if (!res.ok) throw new Error('Failed to load feedback')
      const data = await res.json()
      const items: FeedbackItem[] = (data.feedback || []).map((item: any) => ({
        ...item,
        upvotes: item.upvotes || [],
        downvotes: item.downvotes || [],
        status: item.status || 'pending',
        admin_response: item.admin_response || null,
        admin_user_email: item.admin_user_email || null,
        status_updated_at: item.status_updated_at || null,
        comment_count: item.comment_count || 0,
      }))
      // Sort by net votes (upvotes - downvotes), then by date
      items.sort((a, b) => {
        const aNet = a.upvotes.length - a.downvotes.length
        const bNet = b.upvotes.length - b.downvotes.length
        if (bNet !== aNet) return bNet - aNet
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      setAllFeedback(items)
      if (data.currentUserId) {
        setCurrentUserId(data.currentUserId)
      }
      if (data.isAdmin !== undefined) {
        setIsUserAdmin(data.isAdmin)
      }
    } catch (e) {
      console.error('Error loading feedback:', e)
      setAllFeedback([])
    } finally {
      setFeedbackLoading(false)
    }
  }

  const loadAdminData = useCallback(async () => {
    setAdminDataLoading(true)
    try {
      const res = await fetch('/api/feedback/admin')
      if (!res.ok) return // Not an admin or error
      const data = await res.json()
      setSeedAdmin(data.seedAdmin || '')
      setElevatedAdmins(data.elevatedAdmins || [])
      setSystemPrompts(data.systemPrompts || [])
    } catch (e) {
      console.error('Error loading admin data:', e)
    } finally {
      setAdminDataLoading(false)
    }
  }, [])

  // Load admin data when admin view is selected
  useEffect(() => {
    if (feedbackView === 'admin' && isUserAdmin) {
      loadAdminData()
    }
  }, [feedbackView, isUserAdmin, loadAdminData])

  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim()
    if (!email || !email.includes('@')) return
    try {
      const res = await fetch('/api/feedback/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to add admin')
        return
      }
      const data = await res.json()
      setElevatedAdmins(data.elevatedAdmins || [])
      setNewAdminEmail('')
    } catch (e) {
      console.error('Error adding admin:', e)
    }
  }

  const handleRemoveAdmin = async (email: string) => {
    try {
      const res = await fetch('/api/feedback/admin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to remove admin')
        return
      }
      const data = await res.json()
      setElevatedAdmins(data.elevatedAdmins || [])
    } catch (e) {
      console.error('Error removing admin:', e)
    }
  }

  const handleVote = async (feedbackId: string, voteType: 'up' | 'down') => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId, voteType }),
      })
      if (!res.ok) throw new Error('Failed to vote')
      const data = await res.json()
      if (data.feedback) {
        setAllFeedback(prev => {
          const updated = prev.map(item =>
            item.id === feedbackId
              ? { ...item, upvotes: data.feedback.upvotes || [], downvotes: data.feedback.downvotes || [] }
              : item
          )
          updated.sort((a, b) => {
            const aNet = a.upvotes.length - a.downvotes.length
            const bNet = b.upvotes.length - b.downvotes.length
            if (bNet !== aNet) return bNet - aNet
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
          return updated
        })
      }
    } catch (e) {
      console.error('Error voting:', e)
    }
  }

  const handleStatusUpdate = async (feedbackId: string, newStatus: FeedbackStatus, response?: string) => {
    try {
      const body: Record<string, unknown> = {
        feedbackId,
        action: 'updateStatus',
        status: newStatus,
      }
      if (response !== undefined) {
        body.adminResponse = response
      }
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update status')
      const data = await res.json()
      if (data.feedback) {
        setAllFeedback(prev =>
          prev.map(item =>
            item.id === feedbackId
              ? {
                  ...item,
                  status: data.feedback.status,
                  admin_response: data.feedback.admin_response,
                  admin_user_email: data.feedback.admin_user_email,
                  status_updated_at: data.feedback.status_updated_at,
                }
              : item
          )
        )
      }
    } catch (e) {
      console.error('Error updating status:', e)
    }
  }

  const handleEditFeedback = async (feedbackId: string) => {
    const text = editingFeedbackText.trim()
    if (!text) return
    try {
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId, action: 'updateText', text }),
      })
      if (!res.ok) throw new Error('Failed to update feedback')
      const data = await res.json()
      if (data.feedback) {
        setAllFeedback(prev =>
          prev.map(item =>
            item.id === feedbackId ? { ...item, text: data.feedback.text, updated_at: data.feedback.updated_at } : item
          )
        )
      }
      setEditingFeedbackId(null)
      setEditingFeedbackText('')
    } catch (e) {
      console.error('Error editing feedback:', e)
      alert('Failed to update feedback')
    }
  }

  const loadComments = useCallback(async (feedbackId: string) => {
    setCommentsLoading(feedbackId)
    try {
      const res = await fetch(`/api/feedback/comments?feedbackId=${feedbackId}`)
      if (!res.ok) throw new Error('Failed to load comments')
      const data = await res.json()
      setComments(prev => ({ ...prev, [feedbackId]: data.comments || [] }))
    } catch (e) {
      console.error('Error loading comments:', e)
    } finally {
      setCommentsLoading(null)
    }
  }, [])

  const handleAddComment = async (feedbackId: string) => {
    const text = newCommentText[feedbackId]?.trim()
    if (!text) return

    try {
      const res = await fetch('/api/feedback/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackId,
          text,
          isAdminComment: isUserAdmin,
        }),
      })
      if (!res.ok) throw new Error('Failed to add comment')
      const data = await res.json()
      if (data.comment) {
        setComments(prev => ({
          ...prev,
          [feedbackId]: [...(prev[feedbackId] || []), data.comment],
        }))
        setNewCommentText(prev => ({ ...prev, [feedbackId]: '' }))
        // Update comment count
        setAllFeedback(prev =>
          prev.map(item =>
            item.id === feedbackId
              ? { ...item, comment_count: item.comment_count + 1 }
              : item
          )
        )
      }
    } catch (e) {
      console.error('Error adding comment:', e)
    }
  }

  const handleDeleteComment = async (feedbackId: string, commentId: string) => {
    try {
      const res = await fetch('/api/feedback/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      })
      if (!res.ok) throw new Error('Failed to delete comment')
      setComments(prev => ({
        ...prev,
        [feedbackId]: (prev[feedbackId] || []).filter(c => c.id !== commentId),
      }))
      setAllFeedback(prev =>
        prev.map(item =>
          item.id === feedbackId
            ? { ...item, comment_count: Math.max(0, item.comment_count - 1) }
            : item
        )
      )
    } catch (e) {
      console.error('Error deleting comment:', e)
    }
  }

  const toggleComments = (feedbackId: string) => {
    if (expandedComments === feedbackId) {
      setExpandedComments(null)
    } else {
      setExpandedComments(feedbackId)
      if (!comments[feedbackId]) {
        loadComments(feedbackId)
      }
    }
  }

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: feedbackText }),
      })
      if (!res.ok) throw new Error('Failed to submit feedback')

      setFeedbackSubmitted(true)
      setFeedbackText('')
      setTimeout(() => {
        setFeedbackSubmitted(false)
        setFeedbackView('browse')
        loadAllFeedback()
      }, 2000)
    } catch (e) {
      console.error('Error submitting feedback:', e)
    }
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'workflows' as const, label: 'Workflows', icon: '🔄' },
    { id: 'tour' as const, label: 'Tour', icon: '🎯' },
    { id: 'features' as const, label: 'Features', icon: '✨' },
    { id: 'inspiration' as const, label: 'Tips', icon: '💡' },
    { id: 'feedback' as const, label: 'Feedback', icon: '💬' },
  ]

  // Filter feedback by ownership first, then by status
  const ownershipFilteredFeedback = ownershipFilter === 'all'
    ? allFeedback
    : allFeedback.filter(f => f.user_id === currentUserId)

  const filteredFeedback = statusFilter === 'all'
    ? ownershipFilteredFeedback
    : ownershipFilteredFeedback.filter(f => f.status === statusFilter)

  // Count by status (within current ownership filter)
  const statusCounts = ownershipFilteredFeedback.reduce((acc, f) => {
    const s = f.status || 'pending'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Count my feedback vs all feedback
  const myFeedbackCount = allFeedback.filter(f => f.user_id === currentUserId).length

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
              {/* Launch Interactive Tour Buttons - Two Phases */}
              {onStartTour && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Interactive Tours
                  </h4>

                  {/* Schedule Tour */}
                  <div style={{
                    marginBottom: '12px',
                    padding: '16px',
                    background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                    borderRadius: '12px',
                    color: 'white',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '24px' }}>📅</span>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Schedule Tour</h4>
                        <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>
                          Learn the appointments dashboard and calendar views
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose()
                        onStartTour('schedule')
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
                      Start Schedule Tour
                    </button>
                  </div>

                  {/* EHR Tour */}
                  <div style={{
                    padding: '16px',
                    background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                    borderRadius: '12px',
                    color: 'white',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '24px' }}>📋</span>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>EHR Tour</h4>
                        <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>
                          Master clinical documentation, AI features, and note generation
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose()
                        onStartTour('ehr')
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
                      Start EHR Tour
                    </button>
                  </div>
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
                marginBottom: '16px',
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
                {isUserAdmin && (
                  <button
                    onClick={() => setFeedbackView('admin')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: feedbackView === 'admin' ? 'var(--bg-white)' : 'transparent',
                      boxShadow: feedbackView === 'admin' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: feedbackView === 'admin' ? '#047857' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                    </svg>
                    Admin
                  </button>
                )}
              </div>

              {/* Browse Feedback View */}
              {feedbackView === 'browse' && (
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Vote on feedback to help us prioritize improvements. Sorted by popularity.
                  </p>

                  {/* Ownership Filter Toggle */}
                  <div style={{
                    display: 'flex',
                    gap: '0',
                    marginBottom: '12px',
                    background: 'var(--bg-gray)',
                    borderRadius: '8px',
                    padding: '3px',
                    width: 'fit-content',
                  }}>
                    <button
                      onClick={() => setOwnershipFilter('mine')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: ownershipFilter === 'mine' ? 'var(--bg-white)' : 'transparent',
                        boxShadow: ownershipFilter === 'mine' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: ownershipFilter === 'mine' ? 'var(--text-primary)' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      My Feedback ({myFeedbackCount})
                    </button>
                    <button
                      onClick={() => setOwnershipFilter('all')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: ownershipFilter === 'all' ? 'var(--bg-white)' : 'transparent',
                        boxShadow: ownershipFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: ownershipFilter === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      All Feedback ({allFeedback.length})
                    </button>
                  </div>

                  {/* Status Filter Pills */}
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                  }}>
                    <button
                      onClick={() => setStatusFilter('all')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '16px',
                        border: statusFilter === 'all' ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: statusFilter === 'all' ? '#CCFBF1' : 'var(--bg-white)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: statusFilter === 'all' ? 'var(--primary)' : 'var(--text-muted)',
                      }}
                    >
                      All ({ownershipFilteredFeedback.length})
                    </button>
                    {(Object.keys(STATUS_CONFIG) as FeedbackStatus[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '16px',
                          border: statusFilter === s ? `2px solid ${STATUS_CONFIG[s].border}` : '1px solid var(--border)',
                          background: statusFilter === s ? STATUS_CONFIG[s].bg : 'var(--bg-white)',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          color: statusFilter === s ? STATUS_CONFIG[s].color : 'var(--text-muted)',
                        }}
                      >
                        {STATUS_CONFIG[s].label} ({statusCounts[s] || 0})
                      </button>
                    ))}
                  </div>

                  {feedbackLoading ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      background: 'var(--bg-gray)',
                      borderRadius: '12px',
                    }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        border: '3px solid var(--border)',
                        borderTopColor: 'var(--primary)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 12px',
                      }} />
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                        Loading feedback...
                      </p>
                    </div>
                  ) : filteredFeedback.length === 0 ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      background: 'var(--bg-gray)',
                      borderRadius: '12px',
                    }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                      <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                        {statusFilter === 'all'
                          ? 'No feedback yet. Be the first to share!'
                          : `No feedback with status "${STATUS_CONFIG[statusFilter as FeedbackStatus]?.label}".`}
                      </p>
                      {statusFilter === 'all' && (
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
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {filteredFeedback.map((item) => {
                        const netVotes = item.upvotes.length - item.downvotes.length
                        const hasUpvoted = item.upvotes.includes(currentUserId)
                        const hasDownvoted = item.downvotes.includes(currentUserId)
                        const isOwnFeedback = item.user_id === currentUserId
                        const itemStatus = item.status || 'pending'
                        const statusConf = STATUS_CONFIG[itemStatus]
                        const isExpanded = expandedComments === item.id
                        const itemComments = comments[item.id] || []

                        return (
                          <div
                            key={item.id}
                            style={{
                              background: 'var(--bg-white)',
                              border: `1px solid ${itemStatus === 'addressed' ? '#10B981' : 'var(--border)'}`,
                              borderRadius: '12px',
                              overflow: 'hidden',
                              opacity: itemStatus === 'addressed' ? 0.85 : 1,
                            }}
                          >
                            <div style={{ padding: '16px' }}>
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
                                  {/* Status Badge */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <span style={{
                                      padding: '2px 10px',
                                      borderRadius: '12px',
                                      background: statusConf.bg,
                                      border: `1px solid ${statusConf.border}`,
                                      color: statusConf.color,
                                      fontSize: '11px',
                                      fontWeight: 600,
                                    }}>
                                      {statusConf.label}
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
                                  </div>

                                  {editingFeedbackId === item.id ? (
                                    <div style={{ margin: '0 0 8px 0' }}>
                                      <textarea
                                        value={editingFeedbackText}
                                        onChange={(e) => setEditingFeedbackText(e.target.value)}
                                        style={{
                                          width: '100%',
                                          minHeight: '60px',
                                          padding: '8px 10px',
                                          borderRadius: '6px',
                                          border: '1px solid var(--primary)',
                                          background: 'var(--bg-white)',
                                          color: 'var(--text-primary)',
                                          fontSize: '13px',
                                          lineHeight: 1.5,
                                          resize: 'vertical',
                                          outline: 'none',
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditFeedback(item.id) }
                                          if (e.key === 'Escape') { setEditingFeedbackId(null); setEditingFeedbackText('') }
                                        }}
                                        autoFocus
                                      />
                                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                                        <button
                                          onClick={() => { setEditingFeedbackId(null); setEditingFeedbackText('') }}
                                          style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-white)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleEditFeedback(item.id)}
                                          disabled={!editingFeedbackText.trim() || editingFeedbackText.trim() === item.text}
                                          style={{
                                            padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                            background: editingFeedbackText.trim() && editingFeedbackText.trim() !== item.text ? 'var(--primary)' : 'var(--bg-gray)',
                                            color: editingFeedbackText.trim() && editingFeedbackText.trim() !== item.text ? 'white' : 'var(--text-muted)',
                                          }}
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', margin: '0 0 8px 0' }}>
                                      <p style={{
                                        fontSize: '14px',
                                        color: 'var(--text-primary)',
                                        margin: 0,
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap',
                                        flex: 1,
                                        textDecoration: itemStatus === 'addressed' ? 'line-through' : 'none',
                                      }}>
                                        {item.text}
                                      </p>
                                      {isOwnFeedback && itemStatus !== 'addressed' && (
                                        <button
                                          onClick={() => { setEditingFeedbackId(item.id); setEditingFeedbackText(item.text) }}
                                          title="Edit feedback"
                                          style={{
                                            padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px',
                                          }}
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Admin Response */}
                                  {item.admin_response && (
                                    <div style={{
                                      margin: '8px 0',
                                      padding: '10px 12px',
                                      borderRadius: '8px',
                                      background: '#F0FDF4',
                                      border: '1px solid #86EFAC',
                                      borderLeft: '3px solid #10B981',
                                    }}>
                                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#047857', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M9 12l2 2 4-4"/>
                                          <circle cx="12" cy="12" r="10"/>
                                        </svg>
                                        Admin Response
                                        {item.admin_user_email && (
                                          <span style={{ fontWeight: 400, color: '#059669' }}>
                                            ({item.admin_user_email.split('@')[0]})
                                          </span>
                                        )}
                                      </div>
                                      <p style={{ fontSize: '13px', color: '#065F46', margin: 0, lineHeight: 1.4 }}>
                                        {item.admin_response}
                                      </p>
                                    </div>
                                  )}

                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '12px',
                                    color: 'var(--text-muted)',
                                    flexWrap: 'wrap',
                                  }}>
                                    <span>
                                      {new Date(item.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </span>
                                    {item.user_email && (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                        {item.user_email.split('@')[0]}
                                      </span>
                                    )}
                                    {item.upvotes.length > 0 && (
                                      <span style={{ color: '#059669' }}>
                                        {item.upvotes.length} upvote{item.upvotes.length !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                    {/* Comments toggle */}
                                    <button
                                      onClick={() => toggleComments(item.id)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: isExpanded ? '#DBEAFE' : 'transparent',
                                        color: isExpanded ? '#1D4ED8' : 'var(--text-muted)',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        fontWeight: isExpanded ? 600 : 400,
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                                      </svg>
                                      {item.comment_count} comment{item.comment_count !== 1 ? 's' : ''}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Admin Controls */}
                              {isUserAdmin && (
                                <div style={{
                                  marginTop: '12px',
                                  paddingTop: '12px',
                                  borderTop: '1px dashed var(--border)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                      Admin:
                                    </span>
                                    {(Object.keys(STATUS_CONFIG) as FeedbackStatus[]).map(s => (
                                      <button
                                        key={s}
                                        onClick={() => handleStatusUpdate(item.id, s)}
                                        style={{
                                          padding: '3px 10px',
                                          borderRadius: '4px',
                                          border: itemStatus === s ? `2px solid ${STATUS_CONFIG[s].border}` : '1px solid var(--border)',
                                          background: itemStatus === s ? STATUS_CONFIG[s].bg : 'var(--bg-white)',
                                          fontSize: '11px',
                                          fontWeight: itemStatus === s ? 700 : 500,
                                          cursor: 'pointer',
                                          color: itemStatus === s ? STATUS_CONFIG[s].color : 'var(--text-muted)',
                                        }}
                                      >
                                        {STATUS_CONFIG[s].label}
                                      </button>
                                    ))}
                                  </div>
                                  {/* Admin response input */}
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                      type="text"
                                      value={adminResponseText[item.id] || ''}
                                      onChange={(e) => setAdminResponseText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      placeholder="Add admin response (visible to all users)..."
                                      style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-white)',
                                        fontSize: '12px',
                                        color: 'var(--text-primary)',
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && adminResponseText[item.id]?.trim()) {
                                          handleStatusUpdate(item.id, itemStatus, adminResponseText[item.id].trim())
                                          setAdminResponseText(prev => ({ ...prev, [item.id]: '' }))
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => {
                                        if (adminResponseText[item.id]?.trim()) {
                                          handleStatusUpdate(item.id, itemStatus, adminResponseText[item.id].trim())
                                          setAdminResponseText(prev => ({ ...prev, [item.id]: '' }))
                                        }
                                      }}
                                      disabled={!adminResponseText[item.id]?.trim()}
                                      style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: adminResponseText[item.id]?.trim() ? '#10B981' : 'var(--bg-gray)',
                                        color: adminResponseText[item.id]?.trim() ? 'white' : 'var(--text-muted)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: adminResponseText[item.id]?.trim() ? 'pointer' : 'not-allowed',
                                      }}
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Comments Section (Expanded) */}
                            {isExpanded && (
                              <div style={{
                                borderTop: '1px solid var(--border)',
                                background: 'var(--bg-gray)',
                                padding: '12px 16px',
                              }}>
                                {commentsLoading === item.id ? (
                                  <div style={{ textAlign: 'center', padding: '12px' }}>
                                    <div style={{
                                      width: '18px',
                                      height: '18px',
                                      border: '2px solid var(--border)',
                                      borderTopColor: 'var(--primary)',
                                      borderRadius: '50%',
                                      animation: 'spin 1s linear infinite',
                                      margin: '0 auto',
                                    }} />
                                  </div>
                                ) : (
                                  <>
                                    {itemComments.length === 0 && (
                                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0', textAlign: 'center' }}>
                                        No comments yet. Be the first to comment.
                                      </p>
                                    )}
                                    {itemComments.map((comment) => (
                                      <div
                                        key={comment.id}
                                        style={{
                                          marginBottom: '10px',
                                          padding: '10px 12px',
                                          borderRadius: '8px',
                                          background: comment.is_admin_comment ? '#F0FDF4' : 'var(--bg-white)',
                                          border: comment.is_admin_comment ? '1px solid #86EFAC' : '1px solid var(--border)',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: comment.is_admin_comment ? '#047857' : 'var(--text-secondary)' }}>
                                              {comment.user_email?.split('@')[0] || 'User'}
                                            </span>
                                            {comment.is_admin_comment && (
                                              <span style={{
                                                padding: '1px 6px',
                                                borderRadius: '3px',
                                                background: '#D1FAE5',
                                                color: '#047857',
                                                fontSize: '9px',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                              }}>
                                                Admin
                                              </span>
                                            )}
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                              {new Date(comment.created_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                              })}
                                            </span>
                                          </div>
                                          {comment.user_id === currentUserId && (
                                            <button
                                              onClick={() => handleDeleteComment(item.id, comment.id)}
                                              style={{
                                                padding: '2px 6px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: 'var(--text-muted)',
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                              }}
                                              title="Delete comment"
                                            >
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6L6 18M6 6l12 12"/>
                                              </svg>
                                            </button>
                                          )}
                                        </div>
                                        <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                                          {comment.text}
                                        </p>
                                      </div>
                                    ))}

                                    {/* Add comment input */}
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                      <input
                                        type="text"
                                        value={newCommentText[item.id] || ''}
                                        onChange={(e) => setNewCommentText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        placeholder="Add a comment..."
                                        style={{
                                          flex: 1,
                                          padding: '8px 12px',
                                          borderRadius: '6px',
                                          border: '1px solid var(--border)',
                                          background: 'var(--bg-white)',
                                          fontSize: '12px',
                                          color: 'var(--text-primary)',
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && newCommentText[item.id]?.trim()) {
                                            handleAddComment(item.id)
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() => handleAddComment(item.id)}
                                        disabled={!newCommentText[item.id]?.trim()}
                                        style={{
                                          padding: '8px 14px',
                                          borderRadius: '6px',
                                          border: newCommentText[item.id]?.trim() ? 'none' : '1px solid var(--border)',
                                          background: newCommentText[item.id]?.trim() ? 'var(--primary)' : 'var(--bg-white)',
                                          color: newCommentText[item.id]?.trim() ? 'white' : 'var(--text-muted)',
                                          fontSize: '12px',
                                          fontWeight: 600,
                                          cursor: newCommentText[item.id]?.trim() ? 'pointer' : 'not-allowed',
                                        }}
                                      >
                                        Post
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
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

              {/* Admin Panel View */}
              {feedbackView === 'admin' && isUserAdmin && (
                <div>
                  {adminDataLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        border: '3px solid var(--border)',
                        borderTopColor: '#10B981',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 12px',
                      }} />
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Loading admin panel...</p>
                    </div>
                  ) : (
                    <>
                      {/* Admin Management Section */}
                      <div style={{
                        marginBottom: '24px',
                        padding: '16px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
                        border: '1px solid #86EFAC',
                      }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: '#047857', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                            <path d="M16 3.13a4 4 0 010 7.75"/>
                          </svg>
                          Admin Management
                        </h4>

                        {/* Seed Admin */}
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Seed Admin (permanent)
                          </span>
                          <div style={{
                            marginTop: '4px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: 'white',
                            border: '1px solid #86EFAC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#047857' }}>{seedAdmin}</span>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#D1FAE5',
                              color: '#047857',
                              fontSize: '10px',
                              fontWeight: 700,
                            }}>
                              PERMANENT
                            </span>
                          </div>
                        </div>

                        {/* Elevated Admins */}
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Elevated Admins
                          </span>
                          {elevatedAdmins.length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#059669', margin: '4px 0 0 0' }}>
                              No additional admins. Add one below.
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                              {elevatedAdmins.map((email) => (
                                <div
                                  key={email}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    background: 'white',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{email}</span>
                                  <button
                                    onClick={() => handleRemoveAdmin(email)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      border: '1px solid #FCA5A5',
                                      background: '#FEF2F2',
                                      color: '#DC2626',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Add Admin */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="email"
                            value={newAdminEmail}
                            onChange={(e) => setNewAdminEmail(e.target.value)}
                            placeholder="email@example.com"
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              background: 'white',
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddAdmin()
                            }}
                          />
                          <button
                            onClick={handleAddAdmin}
                            disabled={!newAdminEmail.trim() || !newAdminEmail.includes('@')}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '6px',
                              border: 'none',
                              background: newAdminEmail.trim() && newAdminEmail.includes('@') ? '#10B981' : 'var(--bg-gray)',
                              color: newAdminEmail.trim() && newAdminEmail.includes('@') ? 'white' : 'var(--text-muted)',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: newAdminEmail.trim() && newAdminEmail.includes('@') ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Add Admin
                          </button>
                        </div>
                      </div>

                      {/* Copy Approved Backlog Section */}
                      {(() => {
                        const approvedItems = allFeedback.filter(f => f.status === 'approved')
                        return (
                          <div style={{
                            marginBottom: '24px',
                            padding: '16px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)',
                            border: '1px solid #C4B5FD',
                          }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: '#6D28D9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                              </svg>
                              Approved Backlog
                            </h4>
                            <p style={{ fontSize: '12px', color: '#7C3AED', margin: '0 0 12px 0' }}>
                              {approvedItems.length === 0
                                ? 'No approved items yet. Approve feedback in the Browse tab to build a backlog.'
                                : `${approvedItems.length} approved item${approvedItems.length !== 1 ? 's' : ''} ready to copy for dev planning.`
                              }
                            </p>

                            {approvedItems.length > 0 && (
                              <>
                                <div style={{
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  marginBottom: '12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}>
                                  {approvedItems.map((item, idx) => (
                                    <div key={item.id} style={{
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      background: 'white',
                                      border: '1px solid #C4B5FD',
                                      fontSize: '12px',
                                      color: 'var(--text-primary)',
                                      lineHeight: 1.4,
                                    }}>
                                      <span style={{ fontWeight: 600, color: '#7C3AED', marginRight: '6px' }}>#{idx + 1}</span>
                                      {item.text}
                                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        <span>{item.user_email}</span>
                                        <span>·</span>
                                        <span>{item.upvotes.length} upvote{item.upvotes.length !== 1 ? 's' : ''}</span>
                                        <span>·</span>
                                        <span>{item.comment_count} comment{item.comment_count !== 1 ? 's' : ''}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <button
                                  onClick={() => {
                                    const lines = approvedItems.map((item, idx) => {
                                      const net = item.upvotes.length - item.downvotes.length
                                      const parts = [
                                        `${idx + 1}. ${item.text}`,
                                        `   By: ${item.user_email} | Votes: ${net >= 0 ? '+' : ''}${net} | Comments: ${item.comment_count}`,
                                        `   Submitted: ${new Date(item.created_at).toLocaleDateString()}`,
                                      ]
                                      if (item.admin_response) {
                                        parts.push(`   Admin note: ${item.admin_response}`)
                                      }
                                      return parts.join('\n')
                                    })
                                    const text = `=== Approved Feedback Backlog (${approvedItems.length} items) ===\nExported: ${new Date().toLocaleString()}\n\n${lines.join('\n\n')}`
                                    navigator.clipboard.writeText(text).then(() => {
                                      setBacklogCopied(true)
                                      setTimeout(() => setBacklogCopied(false), 2000)
                                    })
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: backlogCopied ? '#10B981' : '#7C3AED',
                                    color: 'white',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    transition: 'background 0.2s',
                                  }}
                                >
                                  {backlogCopied ? (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="20 6 9 17 4 12"/>
                                      </svg>
                                      Copied to Clipboard!
                                    </>
                                  ) : (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                      </svg>
                                      Copy Approved Backlog
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })()}

                      {/* System Prompts Section */}
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                          System Prompts
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                          Read-only overview of AI system prompts. Editing via Supabase coming soon.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {systemPrompts.map((prompt) => (
                            <div
                              key={prompt.id}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: 'var(--bg-white)',
                              }}
                            >
                              <button
                                onClick={() => setExpandedPrompt(expandedPrompt === prompt.id ? null : prompt.id)}
                                style={{
                                  width: '100%',
                                  padding: '12px 14px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                      {prompt.name}
                                    </span>
                                    <span style={{
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      background: prompt.model.includes('5') ? '#EDE9FE' : '#DBEAFE',
                                      color: prompt.model.includes('5') ? '#7C3AED' : '#1D4ED8',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                    }}>
                                      {prompt.model}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {prompt.file}
                                  </span>
                                </div>
                                <svg
                                  width="16" height="16" viewBox="0 0 24 24"
                                  fill="none" stroke="var(--text-muted)" strokeWidth="2"
                                  style={{
                                    transform: expandedPrompt === prompt.id ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                    flexShrink: 0,
                                  }}
                                >
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </button>
                              {expandedPrompt === prompt.id && (
                                <div style={{
                                  padding: '0 14px 12px',
                                  borderTop: '1px solid var(--border)',
                                  paddingTop: '10px',
                                }}>
                                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                    {prompt.description}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
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
