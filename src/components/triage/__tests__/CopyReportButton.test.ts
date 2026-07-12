import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/triage/CopyReportButton.tsx'),
  'utf8',
)
const outputPanelSource = readFileSync(
  resolve(process.cwd(), 'src/components/triage/TriageOutputPanel.tsx'),
  'utf8',
)

describe('CopyReportButton report authority', () => {
  it('delegates report construction only to the shared safety-aware builder', () => {
    expect(source).toContain("import { buildTriageReport } from '@/lib/triage/triageReport'")
    expect(source).toContain('const report = buildTriageReport(result)')
    expect(source).not.toContain('function formatReport')
    expect(source).not.toContain("lines.push('Suggested Pre-Visit Workup:')")
    expect(source).not.toContain("lines.push('Subspecialty Routing:")
  })

  it('copies the exact safety-normalized presentation result shown on screen', () => {
    expect(outputPanelSource).toContain(
      '<CopyReportButton result={presentationResult} />',
    )
    expect(outputPanelSource).not.toContain('<CopyReportButton result={result} />')
  })
})
