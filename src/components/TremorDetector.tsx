'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { TremorResult, HandSide } from '@/lib/consult/patient-tools'

interface TremorDetectorProps {
  onComplete: (result: TremorResult) => void
}

type TestState = 'idle' | 'countdown' | 'active' | 'processing' | 'complete' | 'unsupported'

const TEST_DURATION_MS = 10_000
const COUNTDOWN_SECONDS = 3
const SAMPLE_RATE_HZ = 60 // DeviceMotionEvent typically fires at ~60Hz

/** Classify RMS acceleration into clinical buckets. */
function classifyTremor(rms: number): TremorResult['classification'] {
  if (rms < 0.15) return 'none'
  if (rms < 0.4) return 'minimal'
  if (rms < 0.8) return 'mild'
  if (rms < 1.5) return 'moderate'
  return 'severe'
}

const CLASSIFICATION_META: Record<string, { label: string; color: string }> = {
  none: { label: 'No Tremor Detected', color: '#22C55E' },
  minimal: { label: 'Minimal', color: '#84CC16' },
  mild: { label: 'Mild', color: '#F59E0B' },
  moderate: { label: 'Moderate', color: '#F97316' },
  severe: { label: 'Severe', color: '#EF4444' },
}

/**
 * Simple dominant frequency detection via zero-crossing rate.
 * Full FFT is overkill for a phone-based screening tool.
 */
function estimateDominantFrequency(samples: number[], sampleRateHz: number): number | null {
  if (samples.length < 20) return null

  // Remove DC offset (mean)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const centered = samples.map((s) => s - mean)

  // Count zero crossings
  let crossings = 0
  for (let i = 1; i < centered.length; i++) {
    if ((centered[i] >= 0 && centered[i - 1] < 0) || (centered[i] < 0 && centered[i - 1] >= 0)) {
      crossings++
    }
  }

  // Frequency = crossings / (2 * duration in seconds)
  const durationS = centered.length / sampleRateHz
  const freq = crossings / (2 * durationS)

  return freq > 1 ? Math.round(freq * 10) / 10 : null
}

export default function TremorDetector({ onComplete }: TremorDetectorProps) {
  const [state, setState] = useState<TestState>('idle')
  const [hand, setHand] = useState<HandSide>('right')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [timeRemaining, setTimeRemaining] = useState(TEST_DURATION_MS / 1000)
  const [lastResult, setLastResult] = useState<TremorResult | null>(null)
  const [currentRms, setCurrentRms] = useState(0)

  const samplesRef = useRef<{ x: number; y: number; z: number }[]>([])
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check accelerometer support
  useEffect(() => {
    if (typeof window !== 'undefined' && !('DeviceMotionEvent' in window)) {
      setState('unsupported')
    }
  }, [])

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

  const processResults = useCallback(() => {
    const samples = samplesRef.current
    if (samples.length < 10) {
      setState('idle')
      return
    }

    setState('processing')

    // Calculate acceleration magnitudes (gravity-subtracted)
    const magnitudes = samples.map((s) => Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2))

    // RMS
    const sumSq = magnitudes.reduce((sum, m) => sum + m * m, 0)
    const rms = Math.sqrt(sumSq / magnitudes.length)

    // Peak
    const peak = Math.max(...magnitudes)

    // Dominant frequency (using x-axis as proxy — most sensitive for resting hand tremor)
    const xSamples = samples.map((s) => s.x)
    const dominantFreq = estimateDominantFrequency(xSamples, SAMPLE_RATE_HZ)

    const result: TremorResult = {
      type: 'tremor_detection',
      hand,
      rms_acceleration: Math.round(rms * 1000) / 1000,
      dominant_frequency_hz: dominantFreq,
      peak_acceleration: Math.round(peak * 1000) / 1000,
      classification: classifyTremor(rms),
      duration_ms: TEST_DURATION_MS,
    }

    setLastResult(result)
    setState('complete')
    onComplete(result)
  }, [hand, onComplete])

  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return

    // Subtract approximate gravity (9.81 m/s² on the dominant axis)
    // For a phone held still, gravity is mostly on one axis
    const sample = {
      x: acc.x ?? 0,
      y: acc.y ?? 0,
      z: (acc.z ?? 0) - 9.81, // approximate gravity subtraction
    }

    samplesRef.current.push(sample)

    // Live RMS preview (last 30 samples ≈ 0.5s)
    const recent = samplesRef.current.slice(-30)
    const liveMags = recent.map((s) => Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2))
    const liveSumSq = liveMags.reduce((sum, m) => sum + m * m, 0)
    setCurrentRms(Math.sqrt(liveSumSq / liveMags.length))
  }, [])

  const startTest = useCallback(() => {
    samplesRef.current = []
    setCountdown(COUNTDOWN_SECONDS)
    setCurrentRms(0)
    setState('countdown')

    let count = COUNTDOWN_SECONDS
    countdownRef.current = setInterval(() => {
      count -= 1
      setCountdown(count)
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current)

        setState('active')
        startTimeRef.current = Date.now()
        setTimeRemaining(TEST_DURATION_MS / 1000)

        // Request permission on iOS 13+
        const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
        const startListening = () => {
          window.addEventListener('devicemotion', handleMotion)

          timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current
            const remaining = Math.max(0, (TEST_DURATION_MS - elapsed) / 1000)
            setTimeRemaining(Math.ceil(remaining))

            if (elapsed >= TEST_DURATION_MS) {
              window.removeEventListener('devicemotion', handleMotion)
              cleanup()
              processResults()
            }
          }, 100)
        }

        if (DME.requestPermission) {
          DME.requestPermission().then((perm) => {
            if (perm === 'granted') {
              startListening()
            } else {
              setState('unsupported')
            }
          }).catch(() => setState('unsupported'))
        } else {
          startListening()
        }
      }
    }, 1000)
  }, [handleMotion, cleanup, processResults])

  const resetTest = useCallback(() => {
    window.removeEventListener('devicemotion', handleMotion)
    cleanup()
    samplesRef.current = []
    setCurrentRms(0)
    setLastResult(null)
    setState('idle')
  }, [handleMotion, cleanup])

  if (state === 'unsupported') {
    return (
      <div
        style={{
          padding: '20px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid #F59E0B',
          borderRadius: '10px',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#F59E0B', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 8px' }}>
          Accelerometer Not Available
        </p>
        <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: 0 }}>
          This test requires a device with a motion sensor (smartphone or tablet).
          Open this page on your phone to use the tremor detector.
        </p>
      </div>
    )
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
            Start Tremor Test
          </button>

          <p style={{ color: '#64748B', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
            Hold your phone flat in your {hand} hand, arm extended forward, for 10 seconds.
            Try to hold as still as possible.
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
              background: 'rgba(13, 148, 136, 0.15)',
              border: '3px solid #0D9488',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span style={{ color: '#14B8A6', fontSize: '2.5rem', fontWeight: 700 }}>
              {countdown}
            </span>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 4px' }}>
            Extend your {hand} arm forward
          </p>
          <p style={{ color: '#64748B', fontSize: '0.75rem', margin: 0 }}>
            Hold phone flat in your palm
          </p>
        </div>
      )}

      {/* Active recording */}
      {state === 'active' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
              Samples: <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{samplesRef.current.length}</span>
            </span>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
              Time: <span style={{ color: '#F59E0B', fontWeight: 700 }}>{timeRemaining}s</span>
            </span>
          </div>

          {/* Live tremor level indicator */}
          <div
            style={{
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              border: `4px solid ${currentRms < 0.4 ? '#22C55E' : currentRms < 0.8 ? '#F59E0B' : '#EF4444'}`,
              background: `${currentRms < 0.4 ? '#22C55E' : currentRms < 0.8 ? '#F59E0B' : '#EF4444'}15`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '16px auto',
              transition: 'border-color 0.3s, background 0.3s',
            }}
          >
            <span style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
              {currentRms.toFixed(2)}
            </span>
            <span style={{ color: '#94A3B8', fontSize: '0.65rem' }}>m/s²</span>
          </div>

          <p style={{ color: '#64748B', fontSize: '0.75rem', margin: 0 }}>
            Hold still — recording motion data
          </p>
        </div>
      )}

      {/* Processing */}
      {state === 'processing' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Analyzing motion data...</div>
        </div>
      )}

      {/* Results */}
      {state === 'complete' && lastResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              {lastResult.hand} hand — Tremor Results
            </span>
          </div>

          {/* Classification badge */}
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                background: `${CLASSIFICATION_META[lastResult.classification].color}20`,
                color: CLASSIFICATION_META[lastResult.classification].color,
                fontSize: '0.9rem',
                fontWeight: 600,
                border: `1px solid ${CLASSIFICATION_META[lastResult.classification].color}40`,
              }}
            >
              {CLASSIFICATION_META[lastResult.classification].label}
            </span>
          </div>

          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
                {lastResult.rms_acceleration.toFixed(3)}
              </div>
              <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>RMS (m/s²)</div>
            </div>

            <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
                {lastResult.peak_acceleration.toFixed(3)}
              </div>
              <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>Peak (m/s²)</div>
            </div>

            {lastResult.dominant_frequency_hz && (
              <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', padding: '12px', textAlign: 'center', gridColumn: 'span 2' }}>
                <div style={{ color: '#E2E8F0', fontSize: '1.4rem', fontWeight: 700 }}>
                  {lastResult.dominant_frequency_hz} Hz
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>
                  Dominant Frequency {lastResult.dominant_frequency_hz >= 4 && lastResult.dominant_frequency_hz <= 6 ? '(PD range: 4-6 Hz)' : ''}
                </div>
              </div>
            )}
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
