'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'triage-smoke-checklist-2026-07-12'

interface SmokeTestItem {
  id: string
  label: string
}

const SMOKE_TEST_ITEMS: readonly SmokeTestItem[] = [
  {
    id: 'routine-referral',
    label:
      'Paste a routine referral → tier renders with 0–3 workup items; copied report matches the screen',
  },
  {
    id: 'emergent-referral',
    label:
      'Paste an emergent-language referral (e.g. thunderclap headache) → emergency screen, NO outpatient workup anywhere, emergency action workflow created',
  },
  {
    id: 'pdf-parity',
    label: 'Upload the same note as a PDF → identical result to pasted text',
  },
  {
    id: 'blank-scanned-pdf',
    label:
      'Upload a mostly-blank scanned PDF → OCR/manual-review hold (fail-closed), not a routine score',
  },
  {
    id: 'demo-cards',
    label:
      'Demo cards: Patterson scores as TIA/urgent+, Washington as RBD/routine-band',
  },
  {
    id: 'historian-voice',
    label: 'Historian voice flow unchanged (no over-acknowledging regression)',
  },
]

const WHATS_NEXT_ITEMS: readonly string[] = [
  'Clinical sign-off (Steve + Prachi): 14 fresh notes + label flags on Jennings (doc reads crescendo-TIA vs routine_priority label) and Kim (doc=resolved BPPV vs ototoxicity card)',
  'Calibration pass on the routine_priority→urgent over-triage band (13/26 cases)',
  'Model verdict: staying on Sonnet 4.6 (Sonnet 5 under-triaged Williams + Barnes — confirmed by independent grader)',
  'Scanned-PDF OCR + emergency alert delivery: infra deployed, app-side wiring still to come',
  'Security-hardening PR from the Sol snapshot branch (auth on all routes, secrets out of build)',
]

interface HelpLink {
  label: string
  href: string
}

const HELP_LINKS: readonly HelpLink[] = [
  {
    label: 'Full bake-off report',
    href: 'https://github.com/blondarb/OPSAmplehtml/blob/main/qa/triage-validation/BAKEOFF_2026-07-12.md',
  },
  {
    label: 'PR #158 (architecture + full checklist)',
    href: 'https://github.com/blondarb/OPSAmplehtml/pull/158',
  },
]

/** Parses the raw localStorage value into a checklist state map, defensively. Exported for testing. */
export function readStoredChecklist(
  raw: string | null | undefined,
): Record<string, boolean> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, boolean>
    }
  } catch {
    // Malformed storage value — treat as empty.
  }
  return {}
}

export default function TriageHelpGuide() {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      setChecked(readStoredChecklist(localStorage.getItem(STORAGE_KEY)))
    } catch {
      // localStorage not available
    }
  }, [])

  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  function toggleItem(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage not available
      }
      return next
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Testing guide & what's next"
        style={{
          position: 'fixed',
          // Stacked above the @sevaro/feedback "Give Feedback" widget, which
          // docks at bottom:24/right:24 (zIndex 99999) — this avoids overlapping it.
          bottom: '80px',
          right: '24px',
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: '#EA580C',
          color: '#fff',
          border: 'none',
          fontSize: '0.9rem',
          fontWeight: 700,
          cursor: 'pointer',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ?
      </button>

      {/* Kept mounted (hidden via display) rather than conditionally rendered, matching the
          existing pattern in src/app/triage/page.tsx for state-driven visibility. */}
      <div
        style={{
          display: open ? 'block' : 'none',
          position: 'fixed',
          bottom: '124px',
          right: '24px',
          width: '100%',
          maxWidth: '420px',
          maxHeight: '70vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '20px',
          zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2
            style={{
              color: '#e2e8f0',
              fontSize: '1rem',
              fontWeight: 700,
              margin: 0,
            }}
          >
            Testing Guide &amp; What&rsquo;s Next
          </h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '1.2rem',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Smoke-test checklist */}
        <h3
          style={{
            color: '#e2e8f0',
            fontSize: '0.85rem',
            fontWeight: 600,
            margin: '0 0 10px',
          }}
        >
          Smoke-test checklist
        </h3>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          {SMOKE_TEST_ITEMS.map((item) => (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '0.78rem',
                color: '#cbd5e1',
                lineHeight: 1.5,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(checked[item.id])}
                onChange={() => toggleItem(item.id)}
                style={{ marginTop: '2px', accentColor: '#EA580C' }}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        {/* What's next */}
        <h3
          style={{
            color: '#e2e8f0',
            fontSize: '0.85rem',
            fontWeight: 600,
            margin: '0 0 10px',
          }}
        >
          What&rsquo;s next
        </h3>
        <ul
          style={{
            margin: '0 0 20px',
            paddingLeft: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {WHATS_NEXT_ITEMS.map((text) => (
            <li
              key={text}
              style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}
            >
              {text}
            </li>
          ))}
        </ul>

        {/* Links */}
        <h3
          style={{
            color: '#e2e8f0',
            fontSize: '0.85rem',
            fontWeight: 600,
            margin: '0 0 10px',
          }}
        >
          Links
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {HELP_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              style={{
                color: '#8B5CF6',
                fontSize: '0.78rem',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </>
  )
}
