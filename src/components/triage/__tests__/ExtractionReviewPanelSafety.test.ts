import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import ExtractionReviewPanel from '@/components/triage/ExtractionReviewPanel'
import type { ClinicalExtraction } from '@/lib/triage/types'

const SYNTHETIC_ORIGINAL_TEXT =
  'Synthetic original referral text used only for this PHI-free test.'

function syntheticExtraction(): ClinicalExtraction {
  return {
    extraction_id: 'synthetic-extraction-1',
    note_type_detected: 'referral',
    extraction_confidence: 'high',
    extracted_summary:
      'Synthetic source-bound summary with stable symptoms for rendered review.',
    key_findings: {
      chief_complaint: 'Synthetic stable symptoms',
      neurological_symptoms: ['Synthetic tremor'],
      timeline: 'Stable for six months',
      relevant_history: '',
      medications_and_therapies: [],
      failed_therapies: [],
      imaging_results: [],
      red_flags_noted: [],
      functional_status: 'Independent',
    },
    original_text_length: SYNTHETIC_ORIGINAL_TEXT.length,
    source_filename: 'synthetic-referral.pdf',
    ingestion_mode: 'single_pass',
    coverage_status: 'complete',
  }
}

function renderPanel(
  approvalBlockedReason?: string,
  originalText = SYNTHETIC_ORIGINAL_TEXT,
): string {
  return renderToStaticMarkup(
    createElement(ExtractionReviewPanel, {
      extraction: syntheticExtraction(),
      originalText,
      onApprove: vi.fn(),
      onBack: vi.fn(),
      approvalBlockedReason,
    }),
  )
}

function openingTag(html: string, element: string, text?: string): string {
  if (!text) {
    return html.match(new RegExp(`<${element}[^>]*>`, 'i'))?.[0] ?? ''
  }
  const match = html.match(
    new RegExp(`<${element}([^>]*)>[^<]*${text}[^<]*</${element}>`, 'i'),
  )
  return match ? `<${element}${match[1]}>` : ''
}

describe('ExtractionReviewPanel source-bound safety contract', () => {
  it('renders the authoritative summary read-only and approves without free text', () => {
    const html = renderPanel()
    const textarea = openingTag(html, 'textarea')
    const summaryLabel = openingTag(html, 'label', 'Extracted Summary')

    expect(html).toContain('Extracted Summary')
    expect(html).toContain('Approve Source-Bound Extraction')
    expect(html).toContain('Do not approve')
    expect(html).toContain('Do Not Approve — Return to Intake')
    expect(html.toLowerCase()).not.toContain('editable')
    expect(summaryLabel).toContain('for="source-bound-extracted-summary"')
    expect(textarea).toContain('id="source-bound-extracted-summary"')
    expect(textarea).toMatch(/\sreadonly(?:=|\s|>)/i)
    expect(html).toContain(syntheticExtraction().extracted_summary)
  })

  it('renders a blocking alert and disables source-bound approval', () => {
    const html = renderPanel('Source coverage is incomplete.')
    const approveButton = openingTag(
      html,
      'button',
      'Approve Source-Bound Extraction',
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Source coverage is incomplete.')
    expect(approveButton).toMatch(/\sdisabled(?:=|\s|>)/i)
  })

  it('blocks approval when authoritative original text is unavailable', () => {
    const html = renderPanel(undefined, '')
    const approveButton = openingTag(
      html,
      'button',
      'Approve Source-Bound Extraction',
    )

    expect(html).toContain(
      'Authoritative original source text is unavailable or does not match the persisted source length.',
    )
    expect(approveButton).toMatch(/\sdisabled(?:=|\s|>)/i)
  })
})
