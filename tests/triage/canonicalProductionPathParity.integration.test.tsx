import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  StatefulTriageProductionHarness,
  type ProductionPathHarnessTrace,
} from './support/statefulTriageProductionHarness'

const harnessRef = vi.hoisted(() => ({
  current: null as StatefulTriageProductionHarness | null,
}))

function harness(): StatefulTriageProductionHarness {
  if (!harnessRef.current) throw new Error('Parity harness was not initialized.')
  return harnessRef.current
}

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: () => harness().authorizeClinicalAccess(),
  clinicalAccessDeniedMessage: () => 'Access denied',
}))

vi.mock('@/lib/db-query', () => ({
  from: (table: string) => harness().from(table),
}))

vi.mock('@/lib/db', () => ({
  getPool: () => harness().getPool(),
}))

vi.mock('@/lib/triage/asyncRunner', () => ({
  runInBackground: (work: () => Promise<void>) =>
    harness().enqueueBackground(work),
}))

vi.mock('@/lib/triage/ingressSafetyWorkflow', () => ({
  createIngressSafetyWorkflow: (input: unknown) =>
    harness().createIngressSafetyWorkflow(input),
}))

vi.mock('@/lib/notifications', () => ({
  notifyTriageUrgent: (...args: unknown[]) =>
    harness().recordNotification(args),
}))

vi.mock('@/lib/bedrock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bedrock')>()
  return {
    ...actual,
    invokeBedrockClinicalJSON: (input: unknown) =>
      harness().invokeClinicalModel(input),
    // The outpatient scorer now uses the strict tool path; route it to the same
    // harness clinical-model stub (the harness returns the same {parsed} shape).
    invokeBedrockClinicalTool: (input: unknown) =>
      harness().invokeClinicalModel(input),
  }
})

vi.mock('@/lib/triage/modelSafetyExtractor', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/modelSafetyExtractor')
  >()
  const validation = await import('@/lib/triage/modelSafetyExtraction')
  return {
    ...actual,
    runModelSafetyExtractor: (sourceText: string) =>
      harness().runSafetyModel(
        sourceText,
        validation.validateModelSafetyExtraction,
      ),
  }
})

vi.mock('@/lib/triage/gatewayPersistence', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/gatewayPersistence')
  >()
  return {
    ...actual,
    persistEmergencyGatewayResult: (...args: unknown[]) =>
      harness().persistEmergencyGatewayResult(args),
  }
})

vi.mock('@/lib/triage/modelSafetyPersistence', () => ({
  persistModelSafetyFusion: (input: unknown) =>
    harness().persistModelSafetyFusion(input),
}))

vi.mock('@/lib/triage/triageCompletionPersistence', () => ({
  finalizeTriageAttempt: (input: unknown) =>
    harness().finalizeTriageAttempt(input),
}))

vi.mock('@/lib/triage/autoSchedule', () => ({
  autoScheduleFromTriage: () => Promise.resolve(null),
}))

vi.mock('@/lib/triage/modelAdjudicator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/modelAdjudicator')
  >()
  return {
    ...actual,
    runTriageAdjudicator: (sourceText: string) =>
      harness().runAdjudicator(
        sourceText,
        actual.validateTriageAdjudicatorDecision,
      ),
  }
})

import { GET as getExtraction } from '@/app/api/triage/extract/[id]/route'
import { POST as postExtraction } from '@/app/api/triage/extract/route'
import { GET as getTriage } from '@/app/api/triage/[id]/route'
import { POST as postTriage } from '@/app/api/triage/route'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import {
  coordinateCompletedExtraction,
  triageBoundExtraction,
} from '@/lib/triage/canonicalReferralCoordinator'
import { parseUploadedFile } from '@/lib/triage/fileParser'
import {
  postExtractFormData,
  postExtractJSON,
  postTriage as pollTriage,
} from '@/lib/triage/pollClient'
import { triageOutputPolicy } from '@/lib/triage/triageOutputPolicy'
import type { ClinicalExtraction, TriageResult } from '@/lib/triage/types'

const FIXTURE_PATH = resolve(
  process.cwd(),
  'public/samples/triage/outpatient/09_Washington_Eugene.pdf',
)
const LATE_PAGE_MARKER =
  'acute-onset right facial droop, right hand numbness, and expressive language difficulty'

function normalizedMarkup(markup: string): string {
  return markup
    .replace(/triage-ingress-\d+/g, 'triage-session')
    .replace(/ · Page \d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clinicalProjection(result: TriageResult) {
  const policy = triageOutputPolicy(result)
  return {
    tier: result.triage_tier,
    pathway: result.care_pathway,
    timeframe: policy.timeframe,
    reviewRequirement: result.review_requirement,
    workflowStatus: result.workflow_status,
    schedulingLocked: policy.schedulingLocked,
    humanReviewHold: policy.requiresHumanReviewHold,
    service: result.subspecialty_recommendation,
    serviceRationale: result.subspecialty_rationale,
    advice: result.suggested_workup,
    missingInformation: result.missing_information,
    clinicalReasons: result.clinical_reasons,
    redFlags: result.red_flags,
    showPreVisitWorkup: policy.showPreVisitWorkup,
    showOutpatientRouting: policy.showOutpatientRouting,
  }
}

async function fetchThroughProductionRoutes(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const requestUrl =
    typeof input === 'string'
      ? new URL(input, 'http://triage.test')
      : input instanceof URL
        ? input
        : new URL(input.url)
  const request = new Request(requestUrl, init)
  const pathname = requestUrl.pathname

  if (pathname === '/api/triage/extract' && request.method === 'POST') {
    return postExtraction(request)
  }
  const extractionMatch = pathname.match(/^\/api\/triage\/extract\/([^/]+)$/)
  if (extractionMatch && request.method === 'GET') {
    const response = await getExtraction(request, {
      params: Promise.resolve({ id: decodeURIComponent(extractionMatch[1]) }),
    })
    const payload = await response.clone().json()
    harness().recordExtractionPoll(payload)
    if (payload.status === 'pending') await harness().flushNextBackground()
    return response
  }
  if (pathname === '/api/triage' && request.method === 'POST') {
    return postTriage(request)
  }
  const triageMatch = pathname.match(/^\/api\/triage\/([^/]+)$/)
  if (triageMatch && request.method === 'GET') {
    const response = await getTriage(request, {
      params: Promise.resolve({ id: decodeURIComponent(triageMatch[1]) }),
    })
    const payload = await response.clone().json()
    harness().recordTriagePoll(payload)
    if (payload.status === 'pending') await harness().flushNextBackground()
    return response
  }
  throw new Error(`Unexpected parity-harness request: ${request.method} ${pathname}`)
}

async function triageCompletedExtraction(
  extraction: ClinicalExtraction,
): Promise<TriageResult> {
  return triageBoundExtraction(extraction, (request) =>
    pollTriage<TriageResult>(request, undefined, {
      intervalMs: 0,
      maxAttempts: 4,
    }),
  )
}

describe('canonical no-cloud production-path PDF/paste parity', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    harnessRef.current = new StatefulTriageProductionHarness()
    vi.stubGlobal('fetch', vi.fn(fetchThroughProductionRoutes))
  })

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch)
    harnessRef.current = null
  })

  it('carries an actual two-page PDF and its exact pasted text through persistence, poll, bound scoring, and final rendering', async () => {
    const fixtureBytes = await readFile(FIXTURE_PATH)
    const file = new File([fixtureBytes], '09_Washington_Eugene.pdf', {
      type: 'application/pdf',
    })
    const independentlyParsed = await parseUploadedFile(file)
    expect(independentlyParsed.pages).toHaveLength(2)
    expect(independentlyParsed.pages[1]?.text).toContain(LATE_PAGE_MARKER)

    const pdfFormData = new FormData()
    pdfFormData.append('file', file)
    const pdfExtraction = await postExtractFormData<ClinicalExtraction>(
      pdfFormData,
      undefined,
      { intervalMs: 0, maxAttempts: 4 },
    )
    const pasteExtraction = await postExtractJSON<ClinicalExtraction>(
      { text: independentlyParsed.text },
      undefined,
      { intervalMs: 0, maxAttempts: 4 },
    )

    expect(pdfExtraction.extraction_id).not.toBe(
      pasteExtraction.extraction_id,
    )
    expect(pdfExtraction.original_text).toBe(independentlyParsed.text)
    expect(pasteExtraction.original_text).toBe(independentlyParsed.text)
    expect(pdfExtraction.source_filename).toBe('09_Washington_Eugene.pdf')
    expect(pasteExtraction.source_filename).toBeUndefined()
    expect(coordinateCompletedExtraction(pdfExtraction).triageRequest).toEqual({
      source_extraction_id: pdfExtraction.extraction_id,
      source_type: 'pdf',
    })
    expect(coordinateCompletedExtraction(pasteExtraction).triageRequest).toEqual({
      source_extraction_id: pasteExtraction.extraction_id,
      source_type: 'paste',
    })

    harness().seedDecoyExtraction(
      'Synthetic unrelated referral that must never reach either production processing path.',
    )

    const pdfResult = await triageCompletedExtraction(pdfExtraction)
    const pasteResult = await triageCompletedExtraction(pasteExtraction)

    expect(clinicalProjection(pdfResult)).toStrictEqual(
      clinicalProjection(pasteResult),
    )
    expect(pdfResult.emergent_override).toBe(false)
    expect(pasteResult.emergent_override).toBe(false)
    expect(pdfResult.red_flag_override).toBe(false)
    expect(pasteResult.red_flag_override).toBe(false)
    expect(clinicalProjection(pdfResult)).toMatchObject({
      tier: 'emergent',
      pathway: 'emergency_now',
      timeframe: 'Emergency evaluation now',
      reviewRequirement: 'emergency_action',
      workflowStatus: 'emergency_hold',
      schedulingLocked: true,
      humanReviewHold: true,
      service: 'Stroke',
      advice: [
        'MRI brain without contrast — synthetic outpatient scorer suggestion.',
        'CTA head and neck — synthetic outpatient scorer suggestion.',
      ],
      missingInformation: [
        'SAFETY: exact last-known-well and symptom-onset time requires confirmation.',
      ],
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
    })

    const pdfMarkup = renderToStaticMarkup(
      <TriageOutputPanel result={pdfResult} onTryAnother={() => undefined} />,
    )
    const pasteMarkup = renderToStaticMarkup(
      <TriageOutputPanel result={pasteResult} onTryAnother={() => undefined} />,
    )
    expect(normalizedMarkup(pdfMarkup)).toBe(normalizedMarkup(pasteMarkup))
    for (const markup of [pdfMarkup, pasteMarkup]) {
      expect(markup).toContain('Triage Recommendation')
      expect(markup).toContain('Emergency evaluation now')
      expect(markup).toContain('Closed-loop emergency action')
      expect(markup).toContain('Missing information — active action remains')
      expect(markup).toContain('Scheduling remains locked.')
      expect(markup).not.toContain('Batch Triage Results')
      expect(markup).not.toContain('New Batch')
      expect(markup).not.toContain('Suggested Pre-Visit Workup')
      expect(markup).not.toContain('Subspecialty Routing')
    }

    const trace: ProductionPathHarnessTrace = harness().trace()
    expect(trace.extractionPolls).toStrictEqual([
      { id: pdfExtraction.extraction_id, status: 'pending' },
      { id: pdfExtraction.extraction_id, status: 'complete' },
      { id: pasteExtraction.extraction_id, status: 'pending' },
      { id: pasteExtraction.extraction_id, status: 'complete' },
    ])
    expect(trace.extractionModelSources).toStrictEqual([
      independentlyParsed.text,
      independentlyParsed.text,
    ])
    expect(trace.safetyModelSources).toStrictEqual([
      independentlyParsed.text,
      independentlyParsed.text,
    ])
    expect(
      trace.safetyModelSources.every((text) =>
        text.includes(LATE_PAGE_MARKER),
      ),
    ).toBe(true)
    expect(trace.scoringModelPrompts).toHaveLength(2)
    expect(trace.scoringModelPrompts[0]).toBe(trace.scoringModelPrompts[1])
    expect(trace.scoringModelPrompts[0]).toContain(
      'resolved acute focal neurologic episode',
    )
    expect(trace.adjudicatorSources).toStrictEqual([
      independentlyParsed.text,
      independentlyParsed.text,
    ])
    expect(trace.sourceBoundStarts).toStrictEqual([
      expect.objectContaining({
        sourceExtractionId: pdfExtraction.extraction_id,
        sourceType: 'pdf',
        rawText: independentlyParsed.text,
      }),
      expect.objectContaining({
        sourceExtractionId: pasteExtraction.extraction_id,
        sourceType: 'paste',
        rawText: independentlyParsed.text,
      }),
    ])
    expect(trace.triagePolls).toStrictEqual([
      {
        id: trace.sourceBoundStarts[0].triageSessionId,
        status: 'pending',
      },
      {
        id: trace.sourceBoundStarts[0].triageSessionId,
        status: 'complete',
      },
      {
        id: trace.sourceBoundStarts[1].triageSessionId,
        status: 'pending',
      },
      {
        id: trace.sourceBoundStarts[1].triageSessionId,
        status: 'complete',
      },
    ])
    expect(
      trace.sourceBoundStarts.some((item) =>
        item.rawText.includes('unrelated referral'),
      ),
    ).toBe(false)

    const pdfRow = harness().extractionRow(pdfExtraction.extraction_id)
    const pasteRow = harness().extractionRow(pasteExtraction.extraction_id)
    expect(JSON.parse(String(pdfRow.source_pages))).toHaveLength(2)
    expect(JSON.parse(String(pasteRow.source_pages))).toHaveLength(1)
    expect(pdfRow.source_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(pasteRow.source_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(pdfRow.packet_plan).toMatchObject({
      coverage: { status: 'complete', pageCount: 2 },
    })
    expect(pasteRow.packet_plan).toMatchObject({
      coverage: { status: 'complete', pageCount: 1 },
    })
    expect(pdfRow.packet_emergency_result).toMatchObject({
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
    })
    expect(pasteRow.packet_emergency_result).toMatchObject({
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
    })
    expect(String(pdfRow.text_input)).toContain(LATE_PAGE_MARKER)
    expect(String(pasteRow.text_input)).toContain(LATE_PAGE_MARKER)
  })

  it('fails source-bound triage closed when persisted late-page authority is truncated', async () => {
    const fixtureBytes = await readFile(FIXTURE_PATH)
    const file = new File([fixtureBytes], '09_Washington_Eugene.pdf', {
      type: 'application/pdf',
    })
    const formData = new FormData()
    formData.append('file', file)
    const extraction = await postExtractFormData<ClinicalExtraction>(
      formData,
      undefined,
      { intervalMs: 0, maxAttempts: 4 },
    )

    harness().truncatePersistedSourceAfterMarker(
      extraction.extraction_id,
      LATE_PAGE_MARKER,
    )
    const processingCountBefore = harness().trace().sourceBoundStarts.length

    const response = await postTriage(
      new Request('http://triage.test/api/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source_extraction_id: extraction.extraction_id,
          source_type: 'pdf',
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'source_extraction_manifest_invalid',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_pathway: 'emergency_now',
    })
    expect(harness().trace().sourceBoundStarts).toHaveLength(
      processingCountBefore,
    )
    expect(harness().pendingBackgroundCount()).toBe(0)
  })
})
