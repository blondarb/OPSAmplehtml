'use client'

import { useState } from 'react'
import { buildTriageReport } from '@/lib/triage/triageReport'
import type { TriageResult } from '@/lib/triage/types'

interface Props {
  result: TriageResult
}

export default function CopyReportButton({ result }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const report = buildTriageReport(result)
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = report
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
