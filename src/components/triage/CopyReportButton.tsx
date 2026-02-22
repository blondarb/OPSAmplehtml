'use client'

import { useState } from 'react'
import { TriageResult } from '@/lib/triage/types'

interface Props {
  result: TriageResult
}

export default function CopyReportButton({ result }: Props) {
  const [copied, setCopied] = useState(false)

  function formatReport(): string {
    const lines: string[] = []
    lines.push('=== NEUROLOGY TRIAGE RECOMMENDATION ===')
    lines.push('')
    lines.push(`Triage Tier: ${result.triage_tier_display}`)
    lines.push(`Confidence: ${result.confidence}`)
    if (result.weighted_score !== null) {
      lines.push(`Weighted Score: ${result.weighted_score.toFixed(2)}`)
    }
    lines.push('')

    if (result.clinical_reasons.length) {
      lines.push('Clinical Reasons:')
      result.clinical_reasons.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`))
      lines.push('')
    }

    if (result.red_flags.length) {
      lines.push('Red Flags:')
      result.red_flags.forEach(f => lines.push(`  - ${f}`))
      lines.push('')
    } else {
      lines.push('Red Flags: None identified')
      lines.push('')
    }

    if (result.failed_therapies.length) {
      lines.push('Failed/Previously Tried Therapies:')
      result.failed_therapies.forEach(t => {
        lines.push(`  - ${t.therapy}${t.reason_stopped ? ` (${t.reason_stopped})` : ''}`)
      })
      lines.push('')
    }

    if (result.suggested_workup.length) {
      lines.push('Suggested Pre-Visit Workup:')
      result.suggested_workup.forEach(w => lines.push(`  - ${w}`))
      lines.push('')
    }

    if (result.subspecialty_recommendation) {
      lines.push(`Subspecialty Routing: ${result.subspecialty_recommendation}`)
      if (result.subspecialty_rationale) {
        lines.push(`  Rationale: ${result.subspecialty_rationale}`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push(result.disclaimer)

    return lines.join('\n')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatReport())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = formatReport()
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '8px 16px',
        borderRadius: '8px',
        background: copied ? '#16A34A' : '#334155',
        color: '#e2e8f0',
        border: '1px solid',
        borderColor: copied ? '#16A34A' : '#475569',
        fontSize: '0.8rem',
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.2s',
      }}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy Report
        </>
      )}
    </button>
  )
}
