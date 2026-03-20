'use client'

import { useState, useRef, useCallback } from 'react'
import type { FingerTappingResult, HandSide } from '@/lib/consult/patient-tools'

interface FingerTappingTestProps {
  onComplete: (result: FingerTappingResult) => void
}

type TestState = 'idle' | 'countdown' | 'active' | 'complete'

const TEST_DURATION_MS = 10_000
const COUNTDOWN_SECONDS = 3

export default function FingerTappingTest({ onComplete }: FingerTappingTestProps) {
  const [state, setState] = useState<TestState>('idle')
  const [hand, setHand] = useState<HandSide>('right')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [tapCount, setTapCount] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(TEST_DURATION_MS / 1000)
  const [lastResult, setLastResult] = useState<FingerTappingResult | null>(null)

  const tapsRef = useRef<number[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const finishTest = useCallback(() => {
    cleanup()
    const timestamps = tapsRef.current
    const totalTaps = timestamps.length
    const durationMs = TEST_DURATION_MS

    // Calculate inter-tap intervals
    const intervals: number[] = []
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1])
    }

    // Calculate regularity (coefficient of variation)
    let regularityCv = 0
    if (intervals.length > 1) {
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length
      const sd = Math.sqrt(variance)
      regularityCv = mean > 0 ? sd / mean : 0
    }

    const result: FingerTappingResult = {
      type: 'finger_tapping',
      hand,
      total_taps: totalTaps,
      tapping_rate: totalTaps / (durationMs / 1000),
      regularity_cv: Math.round(regularityCv * 1000) / 1000,
      intervals_ms: intervals,
      duration_ms: durationMs,
    }

    setLastResult(result)
    setState('complete')
    onComplete(result)
  }, [hand, cleanup, onComplete])

  const startTest = useCallback(() => {
    tapsRef.current = []
    setTapCount(0)
    setCountdown(COUNTDOWN_SECONDS)
    setState('countdown')

    let count = COUNTDOWN_SECONDS
    countdownRef.current = setInterval(() => {
      count -= 1
      setCountdown(count)
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current)

        // Start the actual test
        setState('active')
        startTimeRef.current = Date.now()
        setTimeRemaining(TEST_DURATION_MS / 1000)

        timerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current
          const remaining = Math.max(0, (TEST_DURATION_MS - elapsed) / 1000)
          setTimeRemaining(Math.ceil(remaining))

          if (elapsed >= TEST_DURATION_MS) {
            finishTest()
          }
        }, 100)
      }
    }, 1000)
  }, [finishTest])

  const handleTap = useCallback(() => {
    if (state !== 'active') return
    const now = Date.now()
    tapsRef.current.push(now)
    setTapCount((c) => c + 1)
  }, [state])

  const resetTest = useCallback(() => {
    cleanup()
    tapsRef.current = []
    setTapCount(0)
    setLastResult(null)
    setState('idle')
  }, [cleanup])

  // Classify tapping rate
  const classifyRate = (rate: number): { label: string; color: string } => {
    if (rate >= 5.5) return { label: 'Normal', color: '#22C55E' }
    if (rate >= 4.0) return { label: 'Mildly Reduced', color: '#F59E0B' }
    if (rate >= 2.5) return { label: 'Moderately Reduced', color: '#F97316' }
    return { label: 'Significantly Reduced', color: '#EF4444' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hand selector */}
      {state === 'idle' && (
        <>
          <label style={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            Select hand
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['right', 'left'] as HandSide[]).map((h) => (
              <button
                key={h}
                onClick={() => setHand(h)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: `1px solid ${hand === h ? '#0D9488' : '#334155'}`,
                  background: hand === h ? 'rgba(13, 148, 136, 0.15)' : 'transparent',
                  color: hand === h ? '#14B8A6' : '#94A3B8',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize' as const,
                }}
              >
                {h} Hand
              </button>
            ))}
          </div>

          <button
            onClick={startTest}
            style={{
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: '#0D9488',
              color: '#FFFFFF',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Start Tapping Test
          </button>

          <p style={{ color: '#64748B', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
            Tap the target as fast and regularly as you can for 10 seconds using your {hand} index finger.
          </p>
        </>
      )}

      {/* Countdown */}
      {state === 'countdown' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.15)',
              border: '3px solid #8B5CF6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span style={{ color: '#A78BFA', fontSize: '2.5rem', fontWeight: 700 }}>
              {countdown}
            </span>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>Get ready...</p>
        </div>
      )}

      {/* Active test — big tap target */}
      {state === 'active' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
              Taps: <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{tapCount}</span>
            </span>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
              Time: <span style={{ color: '#F59E0B', fontWeight: 700 }}>{timeRemaining}s</span>
            </span>
          </div>

          <button
            onPointerDown={handleTap}
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              border: '4px solid #0D9488',
              background: 'rgba(13, 148, 136, 0.2)',
              color: '#14B8A6',
              fontSize: '1.2rem',
              fontWeight: 700,
              cursor: 'pointer',
              margin: '12px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
            }}
          >
            TAP
          </button>

          <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '8px 0 0' }}>
            Tap as fast and steadily as possible
          </p>
        </div>
      )}

      {/* Results */}
      {state === 'complete' && lastResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              {lastResult.hand} hand — Results
            </span>
          </div>

          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Tapping Rate */}
            <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
                {lastResult.tapping_rate.toFixed(1)}
              </div>
              <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>taps/sec</div>
              <div
                style={{
                  marginTop: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: `${classifyRate(lastResult.tapping_rate).color}20`,
                  color: classifyRate(lastResult.tapping_rate).color,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  display: 'inline-block',
                }}
              >
                {classifyRate(lastResult.tapping_rate).label}
              </div>
            </div>

            {/* Total Taps */}
            <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
                {lastResult.total_taps}
              </div>
              <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>total taps</div>
            </div>

            {/* Regularity */}
            <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', padding: '12px', textAlign: 'center', gridColumn: 'span 2' }}>
              <div style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
                {(lastResult.regularity_cv * 100).toFixed(1)}%
              </div>
              <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>
                Variability (CV) — {lastResult.regularity_cv < 0.15 ? 'Very Regular' : lastResult.regularity_cv < 0.25 ? 'Regular' : 'Irregular'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={resetTest}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: 'transparent',
                color: '#94A3B8',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Test Again
            </button>
            <button
              onClick={() => {
                setHand(hand === 'right' ? 'left' : 'right')
                resetTest()
              }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #0D9488',
                background: 'rgba(13, 148, 136, 0.1)',
                color: '#14B8A6',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Test {hand === 'right' ? 'Left' : 'Right'} Hand
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
