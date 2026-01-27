'use client'

import { useState, useEffect, useCallback } from 'react'

interface TourStep {
  id: string
  title: string
  description: string
  target: string // CSS selector for the element to highlight
  position: 'top' | 'bottom' | 'left' | 'right'
  spotlightPadding?: number
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Sevaro Clinical!',
    description: 'Let\'s take a quick tour to help you get started with AI-powered clinical documentation. This will only take a minute.',
    target: 'body',
    position: 'bottom',
  },
  {
    id: 'appointments-list',
    title: 'Today\'s Appointments',
    description: 'Your daily schedule starts here. Click any patient row to open their chart and begin documenting. Appointments show patient info, visit type, status, and prior visit details.',
    target: '[data-tour="appointments-list"]',
    position: 'top',
    spotlightPadding: 8,
  },
  {
    id: 'schedule-button',
    title: 'Schedule Appointments',
    description: 'Use this button to schedule new patient appointments. After completing a visit, you\'ll also be prompted to schedule a follow-up directly from the chart.',
    target: '[data-tour="schedule-button"]',
    position: 'bottom',
    spotlightPadding: 8,
  },
  {
    id: 'ideas-button',
    title: 'Getting Started & Help',
    description: 'Click the Sevaro logo anytime to access the Getting Started drawer. Here you\'ll find workflow guides, feature explanations, and you can replay this tour whenever you need a refresher.',
    target: '[data-tour="ideas-button"]',
    position: 'bottom',
    spotlightPadding: 8,
  },
  {
    id: 'patient-info',
    title: 'Patient Information',
    description: 'View and manage patient details here. You\'ll see demographics, visit type, and quick action buttons for video calls and external systems.',
    target: '[data-tour="patient-info"]',
    position: 'right',
    spotlightPadding: 8,
  },
  {
    id: 'prior-visits',
    title: 'Prior Visits & History',
    description: 'Access previous visit summaries with AI-generated insights. Expand any visit to see detailed notes and track treatment progression over time.',
    target: '[data-tour="prior-visits"]',
    position: 'right',
    spotlightPadding: 8,
  },
  {
    id: 'clinical-tabs',
    title: 'Clinical Documentation Tabs',
    description: 'Navigate between History, Imaging/Results, Physical Exams, and Recommendations. Each tab is designed for efficient documentation.',
    target: '[data-tour="clinical-tabs"]',
    position: 'bottom',
    spotlightPadding: 4,
  },
  {
    id: 'voice-button',
    title: 'Voice & Dictation',
    description: 'Click the microphone to open Voice & Dictation. Use "Chart Prep" to dictate while reviewing charts, or "Document" to record entire patient visits.',
    target: '[data-tour="voice-button"]',
    position: 'bottom',
    spotlightPadding: 8,
  },
  {
    id: 'ai-button',
    title: 'AI Assistant',
    description: 'Access AI features here: Ask clinical questions, generate patient summaries, or create educational handouts. The AI uses your note context for personalized responses.',
    target: '[data-tour="ai-button"]',
    position: 'bottom',
    spotlightPadding: 8,
  },
  {
    id: 'generate-note',
    title: 'Generate Note',
    description: 'When you\'re ready, click here to generate your clinical note. AI will synthesize all your inputs—dictation, chart prep, and manual entries—into a cohesive document.',
    target: '[data-tour="generate-note"]',
    position: 'bottom',
    spotlightPadding: 8,
  },
  {
    id: 'settings',
    title: 'Settings & Reset',
    description: 'Click your profile icon to access Settings and the Reset Demo button. Use Reset Demo to restore the original demo state so the next viewer gets a fresh experience.',
    target: '[data-tour="settings"]',
    position: 'left',
    spotlightPadding: 12,
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Start by clicking a patient from the schedule to open their chart. Document with dictation, AI assistance, and dot phrases, then Sign & Complete. Use Reset Demo from your profile menu when you\'re done. Happy documenting!',
    target: 'body',
    position: 'bottom',
  },
]

const TOUR_STORAGE_KEY = 'sevaro-onboarding-complete'

interface OnboardingTourProps {
  forceShow?: boolean // For testing/demo purposes
  onComplete?: () => void
}

export default function OnboardingTour({ forceShow = false, onComplete }: OnboardingTourProps) {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Check if user needs the tour
  useEffect(() => {
    if (forceShow) {
      // Reset to first step when manually triggered
      setCurrentStep(0)
      setIsActive(true)
      setIsReady(true)
      return
    }

    // Check localStorage for tour completion
    try {
      const tourComplete = localStorage.getItem(TOUR_STORAGE_KEY)
      if (!tourComplete) {
        // Small delay to let the page render first
        const timer = setTimeout(() => {
          setCurrentStep(0)
          setIsActive(true)
          setIsReady(true)
        }, 1000)
        return () => clearTimeout(timer)
      }
    } catch {
      // localStorage not available
    }
  }, [forceShow])

  // Update spotlight position when step changes
  const updateSpotlight = useCallback(() => {
    if (!isActive || !isReady) return

    const step = TOUR_STEPS[currentStep]
    if (!step) return

    // Special case for welcome/complete screens
    if (step.target === 'body') {
      setSpotlightRect(null)
      return
    }

    const element = document.querySelector(step.target)
    if (element) {
      const rect = element.getBoundingClientRect()
      setSpotlightRect(rect)

      // Scroll element into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      setSpotlightRect(null)
    }
  }, [currentStep, isActive, isReady])

  useEffect(() => {
    updateSpotlight()

    // Update on resize
    window.addEventListener('resize', updateSpotlight)
    return () => window.removeEventListener('resize', updateSpotlight)
  }, [updateSpotlight])

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      completeTour()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSkip = () => {
    completeTour()
  }

  const completeTour = () => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    } catch {
      // localStorage not available
    }
    setIsActive(false)
    onComplete?.()
  }

  if (!isActive || !isReady) return null

  const step = TOUR_STEPS[currentStep]
  const isWelcome = step.id === 'welcome'
  const isComplete = step.id === 'complete'
  const padding = step.spotlightPadding || 0

  // Calculate tooltip position
  const getTooltipPosition = () => {
    if (!spotlightRect) {
      // Center on screen for welcome/complete
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const tooltipWidth = 360
    const tooltipHeight = 200 // Approximate
    const margin = 16

    switch (step.position) {
      case 'top':
        return {
          bottom: `${window.innerHeight - spotlightRect.top + margin + padding}px`,
          left: `${Math.max(margin, Math.min(spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - margin))}px`,
        }
      case 'bottom':
        return {
          top: `${spotlightRect.bottom + margin + padding}px`,
          left: `${Math.max(margin, Math.min(spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - margin))}px`,
        }
      case 'left':
        return {
          top: `${Math.max(margin, spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2)}px`,
          right: `${window.innerWidth - spotlightRect.left + margin + padding}px`,
        }
      case 'right':
        return {
          top: `${Math.max(margin, spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2)}px`,
          left: `${spotlightRect.right + margin + padding}px`,
        }
      default:
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
      >
        {/* Dark overlay with spotlight cutout */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto',
          }}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlightRect && (
                <rect
                  x={spotlightRect.left - padding}
                  y={spotlightRect.top - padding}
                  width={spotlightRect.width + padding * 2}
                  height={spotlightRect.height + padding * 2}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Spotlight border glow */}
        {spotlightRect && (
          <div
            style={{
              position: 'absolute',
              left: spotlightRect.left - padding - 2,
              top: spotlightRect.top - padding - 2,
              width: spotlightRect.width + padding * 2 + 4,
              height: spotlightRect.height + padding * 2 + 4,
              borderRadius: '10px',
              border: '2px solid #0D9488',
              boxShadow: '0 0 20px rgba(13, 148, 136, 0.5)',
              pointerEvents: 'none',
              animation: 'pulse-border 2s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <div
        style={{
          position: 'fixed',
          ...getTooltipPosition(),
          width: '360px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {/* Header with gradient */}
        <div
          style={{
            background: isComplete
              ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
            padding: '20px 24px',
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            {isWelcome && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            )}
            {isComplete && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            )}
            {!isWelcome && !isComplete && (
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {currentStep}
              </div>
            )}
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{step.title}</h3>
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
            {TOUR_STEPS.map((_, index) => (
              <div
                key={index}
                style={{
                  width: index === currentStep ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: index <= currentStep ? 'white' : 'rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          <p style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: 1.6,
            color: '#4B5563',
          }}>
            {step.description}
          </p>
        </div>

        {/* Footer with buttons */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F9FAFB',
          }}
        >
          <button
            onClick={handleSkip}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              color: '#6B7280',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {isComplete ? 'Close' : 'Skip Tour'}
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && !isComplete && (
              <button
                onClick={handlePrev}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB',
                  background: 'white',
                  color: '#374151',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                background: isComplete
                  ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isWelcome ? 'Start Tour' : isComplete ? 'Get Started' : 'Next'}
              {!isComplete && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% {
            box-shadow: 0 0 20px rgba(13, 148, 136, 0.5);
          }
          50% {
            box-shadow: 0 0 30px rgba(13, 148, 136, 0.8);
          }
        }
      `}</style>
    </>
  )
}

// Helper function to reset the tour (for testing)
export function resetOnboardingTour() {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY)
  } catch {
    // localStorage not available
  }
}
