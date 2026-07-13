import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import TriageHelpGuide, {
  readStoredChecklist,
} from '@/components/triage/TriageHelpGuide'

describe('TriageHelpGuide', () => {
  it('renders the "?" affordance button with the expected aria-label', () => {
    const markup = renderToStaticMarkup(<TriageHelpGuide />)

    expect(markup).toContain(`aria-label="Testing guide &amp; what&#x27;s next"`)
    expect(markup).toContain('>?<')
  })

  it('renders closed by default (panel hidden until toggled)', () => {
    const markup = renderToStaticMarkup(<TriageHelpGuide />)

    // The panel is kept mounted (not conditionally rendered) so its content is
    // always inspectable in static markup, but must default to hidden.
    expect(markup).toContain('display:none')
  })

  it('renders the full smoke-test checklist copy', () => {
    const markup = renderToStaticMarkup(<TriageHelpGuide />)

    expect(markup).toContain(
      'Paste a routine referral → tier renders with 0–3 workup items; copied report matches the screen',
    )
    expect(markup).toContain(
      'Paste an emergent-language referral (e.g. thunderclap headache) → emergency screen, NO outpatient workup anywhere, emergency action workflow created',
    )
    expect(markup).toContain(
      'Upload the same note as a PDF → identical result to pasted text',
    )
    expect(markup).toContain(
      'Upload a mostly-blank scanned PDF → OCR/manual-review hold (fail-closed), not a routine score',
    )
    expect(markup).toContain(
      'Demo cards: Patterson scores as TIA/urgent+, Washington as RBD/routine-band',
    )
    expect(markup).toContain(
      'Historian voice flow unchanged (no over-acknowledging regression)',
    )
  })

  it('renders the "what\'s next" copy', () => {
    const markup = renderToStaticMarkup(<TriageHelpGuide />)

    expect(markup).toContain(
      'Clinical sign-off (Steve + Prachi): 14 fresh notes + label flags on Jennings',
    )
    expect(markup).toContain(
      'Calibration pass on the routine_priority→urgent over-triage band (13/26 cases)',
    )
    expect(markup).toContain(
      'Model verdict: staying on Sonnet 4.6 (Sonnet 5 under-triaged Williams + Barnes',
    )
    expect(markup).toContain(
      'Scanned-PDF OCR + emergency alert delivery: infra deployed, app-side wiring still to come',
    )
    expect(markup).toContain(
      'Security-hardening PR from the Sol snapshot branch (auth on all routes, secrets out of build)',
    )
  })

  it('renders both reference links with correct hrefs and safe target/rel attributes', () => {
    const markup = renderToStaticMarkup(<TriageHelpGuide />)

    expect(markup).toContain(
      'href="https://github.com/blondarb/OPSAmplehtml/blob/main/qa/triage-validation/BAKEOFF_2026-07-12.md"',
    )
    expect(markup).toContain(
      'href="https://github.com/blondarb/OPSAmplehtml/pull/158"',
    )
    // Both links must open in a new tab without leaking window.opener.
    const linkMatches = markup.match(/<a\b[^>]*>/g) ?? []
    expect(linkMatches.length).toBeGreaterThanOrEqual(2)
    for (const anchor of linkMatches) {
      expect(anchor).toContain('target="_blank"')
      expect(anchor).toContain('rel="noreferrer"')
    }
  })

  it('has a labeled close control inside the panel', () => {
    const markup = renderToStaticMarkup(<TriageHelpGuide />)

    expect(markup).toContain('aria-label="Close"')
  })
})

describe('readStoredChecklist', () => {
  it('returns an empty object for null/undefined/empty input', () => {
    expect(readStoredChecklist(null)).toStrictEqual({})
    expect(readStoredChecklist(undefined)).toStrictEqual({})
    expect(readStoredChecklist('')).toStrictEqual({})
  })

  it('parses a previously-persisted checklist state', () => {
    const stored = JSON.stringify({
      'routine-referral': true,
      'pdf-parity': false,
    })

    expect(readStoredChecklist(stored)).toStrictEqual({
      'routine-referral': true,
      'pdf-parity': false,
    })
  })

  it('fails closed (returns an empty object) on malformed JSON rather than throwing', () => {
    expect(() => readStoredChecklist('{not valid json')).not.toThrow()
    expect(readStoredChecklist('{not valid json')).toStrictEqual({})
  })

  it('ignores non-object JSON values (arrays, primitives)', () => {
    expect(readStoredChecklist('42')).toStrictEqual({})
    expect(readStoredChecklist('"a string"')).toStrictEqual({})
    expect(readStoredChecklist('null')).toStrictEqual({})
  })
})
