import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackCategory, FeedbackWidgetConfig, WidgetState } from './types';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useEventTracker } from './useEventTracker';
import { useFeedbackApi } from './useFeedbackApi';

const CATEGORIES: { value: FeedbackCategory; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug', icon: '🐛' },
  { value: 'suggestion', label: 'Suggestion', icon: '💡' },
  { value: 'confusion', label: 'Confused', icon: '❓' },
  { value: 'praise', label: 'Praise', icon: '👍' },
];

const POSITION_CLASSES: Record<string, React.CSSProperties> = {
  'bottom-right': { bottom: 24, right: 24 },
  'bottom-left': { bottom: 24, left: 24 },
  'top-right': { top: 24, right: 24 },
  'top-left': { top: 24, left: 24 },
};

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function formatTime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

export function FeedbackWidget({ appId, apiUrl, user, position = 'bottom-right', apiKey }: FeedbackWidgetConfig) {
  const [widgetState, setWidgetState] = useState<WidgetState>('idle');
  const [isExpanded, setIsExpanded] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('suggestion');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionStartRef = useRef<number>(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recorder = useVoiceRecorder();
  const tracker = useEventTracker();
  const api = useFeedbackApi(apiUrl, apiKey);

  // Inactivity auto-stop: reset timer on any user interaction
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      // Auto-stop if still recording
      if (widgetState === 'recording') {
        handleStopRef.current();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [widgetState]);

  // Keep a ref to handleStop so the timer callback always has the latest
  const handleStopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (widgetState !== 'recording') return;

    const onActivity = () => resetInactivityTimer();
    window.addEventListener('click', onActivity, true);
    window.addEventListener('scroll', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    window.addEventListener('mousemove', onActivity, true);

    // Start the timer
    resetInactivityTimer();

    return () => {
      window.removeEventListener('click', onActivity, true);
      window.removeEventListener('scroll', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('mousemove', onActivity, true);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [widgetState, resetInactivityTimer]);

  const handleStart = useCallback(async () => {
    try {
      setErrorMessage(null);

      await api.createSession(appId, user);
      await recorder.startRecording();
      tracker.startTracking();

      sessionStartRef.current = Date.now();
      setWidgetState('recording');
      // Auto-minimize so the widget stays out of the way
      setIsExpanded(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start recording');
      setWidgetState('error');
    }
  }, [api, appId, user, recorder, tracker]);

  const handleStop = useCallback(async () => {
    try {
      setWidgetState('submitting');
      setIsExpanded(true); // Show the submitting state

      const audioBlob = await recorder.stopRecording();
      tracker.stopTracking();

      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);

      if (audioBlob && audioBlob.size > 0) {
        await api.uploadAudio(audioBlob);
      }

      await api.submitSession({
        category,
        events: tracker.getEvents(),
        duration,
      });

      setWidgetState('submitted');

      setTimeout(() => {
        setWidgetState('idle');
        setIsExpanded(false);
      }, 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit feedback');
      setWidgetState('error');
    }
  }, [recorder, tracker, api, category]);

  // Keep the ref updated
  handleStopRef.current = handleStop;

  const handleReset = useCallback(() => {
    setWidgetState('idle');
    setErrorMessage(null);
    setIsExpanded(false);
  }, []);

  const positionStyle = POSITION_CLASSES[position] || POSITION_CLASSES['bottom-right'];

  // --- Render ---

  // Minimized recording indicator — small pill that stays out of the way
  if (widgetState === 'recording' && !isExpanded) {
    return (
      <div data-feedback-widget style={{ ...positionStyle, position: 'fixed', zIndex: 99999 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 20,
            backgroundColor: 'rgba(239, 68, 68, 0.95)',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
            cursor: 'pointer',
            animation: 'feedback-pulse 2s ease-in-out infinite',
          }}
          onClick={() => setIsExpanded(true)}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
          {formatTime(recorder.elapsedMs)}
          <button
            onClick={(e) => { e.stopPropagation(); handleStop(); }}
            style={{
              marginLeft: 4,
              padding: '2px 8px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.5)',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        </div>
        <style>{`
          @keyframes feedback-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.85; }
          }
        `}</style>
      </div>
    );
  }

  // Idle state — floating button
  if (widgetState === 'idle' && !isExpanded) {
    return (
      <div data-feedback-widget style={{ ...positionStyle, position: 'fixed', zIndex: 99999 }}>
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 24,
            border: 'none',
            backgroundColor: '#0D9488',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'system-ui, sans-serif',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(13, 148, 136, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 148, 136, 0.3)';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
          Give Feedback
        </button>
      </div>
    );
  }

  // Expanded panel
  return (
    <div
      data-feedback-widget
      style={{
        ...positionStyle,
        position: 'fixed',
        zIndex: 99999,
        width: 320,
        borderRadius: 16,
        backgroundColor: '#fff',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          backgroundColor: widgetState === 'recording' ? '#EF4444' : widgetState === 'submitted' ? '#10B981' : '#0D9488',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {widgetState === 'recording' && (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: '#fff',
                display: 'inline-block',
                animation: 'feedback-pulse 1.5s ease-in-out infinite',
              }}
            />
          )}
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {widgetState === 'recording'
              ? `Recording ${formatTime(recorder.elapsedMs)}`
              : widgetState === 'submitting'
                ? 'Submitting...'
                : widgetState === 'submitted'
                  ? 'Thank you!'
                  : 'Voice Feedback'}
          </span>
        </div>
        {widgetState !== 'submitting' && widgetState !== 'submitted' && (
          <button
            onClick={() => {
              if (widgetState === 'recording') {
                setIsExpanded(false);
              } else {
                setIsExpanded(false);
                handleReset();
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            {widgetState === 'recording' ? '−' : '×'}
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>
        {/* Error state */}
        {(widgetState === 'error' || recorder.error) && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: '#FEF2F2',
                color: '#991B1B',
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {errorMessage || recorder.error}
            </div>
            <button
              onClick={handleReset}
              style={{
                marginTop: 8,
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid #D1D5DB',
                backgroundColor: '#fff',
                color: '#374151',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Submitted state */}
        {widgetState === 'submitted' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
              Your feedback has been recorded and will be reviewed.
            </p>
          </div>
        )}

        {/* Submitting state */}
        {widgetState === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>Uploading your feedback...</p>
          </div>
        )}

        {/* Pre-recording: category selection + start */}
        {widgetState === 'idle' && !recorder.error && !errorMessage && (
          <>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              Start recording to narrate your feedback while you use the app. The widget will minimize
              so you can navigate freely. Stops automatically after 5 min of inactivity.
            </p>

            {/* Category pills */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Category
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 16,
                      border: `2px solid ${category === cat.value ? '#0D9488' : '#E5E7EB'}`,
                      backgroundColor: category === cat.value ? '#F0FDFA' : '#fff',
                      color: category === cat.value ? '#0D9488' : '#6B7280',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={handleStart}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#EF4444',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#EF4444')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
              Start Recording
            </button>
          </>
        )}

        {/* Recording: context display + stop */}
        {widgetState === 'recording' && (
          <>
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                backgroundColor: '#F9FAFB',
                marginBottom: 12,
                fontSize: 12,
                color: '#6B7280',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Page:</span>
                <span style={{ fontFamily: 'monospace' }}>{tracker.getCurrentContext().route}</span>
              </div>
              {tracker.getCurrentContext().viewportSection && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>Section:</span>
                  <span>{tracker.getCurrentContext().viewportSection}</span>
                </div>
              )}
            </div>

            {/* Category (can change during recording) */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    border: `1.5px solid ${category === cat.value ? '#0D9488' : '#E5E7EB'}`,
                    backgroundColor: category === cat.value ? '#F0FDFA' : '#fff',
                    color: category === cat.value ? '#0D9488' : '#9CA3AF',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Stop button */}
            <button
              onClick={handleStop}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#374151',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop &amp; Submit
            </button>
          </>
        )}
      </div>

      {/* Keyframe animation for pulse */}
      <style>{`
        @keyframes feedback-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
