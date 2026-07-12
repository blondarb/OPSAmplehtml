import { describe, expect, it } from 'vitest'

import {
  EXTRACTION_SYSTEM_PROMPT,
  FUSION_SYSTEM_PROMPT,
} from '@/lib/triage/extractionPrompt'
import { MODEL_SAFETY_EXTRACTION_SYSTEM_PROMPT } from '@/lib/triage/modelSafetyExtractor'
import { TRIAGE_ADJUDICATOR_SYSTEM_PROMPT } from '@/lib/triage/modelAdjudicator'
import { TRIAGE_SYSTEM_PROMPT } from '@/lib/triage/systemPrompt'
import { LONG_PACKET_CLINICAL_MAPPER_SYSTEM_PROMPT } from '@/lib/triage/longPacketClinicalMapper'
import { LONG_PACKET_NARRATIVE_REDUCER_SYSTEM_PROMPT } from '@/lib/triage/longPacketModelPipeline'

const CLINICAL_PROMPTS = [
  ['outpatient scorer', TRIAGE_SYSTEM_PROMPT],
  ['single-document extraction', EXTRACTION_SYSTEM_PROMPT],
  ['multi-document fusion', FUSION_SYSTEM_PROMPT],
  ['independent safety extraction', MODEL_SAFETY_EXTRACTION_SYSTEM_PROMPT],
  ['disagreement adjudication', TRIAGE_ADJUDICATOR_SYSTEM_PROMPT],
  ['long-packet clinical mapper', LONG_PACKET_CLINICAL_MAPPER_SYSTEM_PROMPT],
  ['long-packet narrative reducer', LONG_PACKET_NARRATIVE_REDUCER_SYSTEM_PROMPT],
] as const

describe('clinical prompt injection boundaries', () => {
  it.each(CLINICAL_PROMPTS)(
    '%s treats source-embedded directives as untrusted data',
    (_name, prompt) => {
      expect(prompt.toLowerCase()).toContain('untrusted clinical data')
      expect(prompt.toLowerCase()).toContain('never follow')
      expect(prompt.toLowerCase()).toContain('embedded')
      expect(prompt.toLowerCase()).toContain('cannot override')
    },
  )
})

describe('outpatient scorer action suppression', () => {
  it('requires empty outpatient actions when emergency or insufficient-data markers are present', () => {
    expect(TRIAGE_SYSTEM_PROMPT).toContain(
      'If "emergent_override" is true OR "insufficient_data" is true, "suggested_workup" MUST be []',
    )
    expect(TRIAGE_SYSTEM_PROMPT).toContain(
      'Do not propose outpatient workup or ED workup',
    )
    expect(TRIAGE_SYSTEM_PROMPT).toContain(
      'Only when both safety markers are false',
    )
    expect(TRIAGE_SYSTEM_PROMPT).not.toContain(
      'You MUST always provide at least 2-3 suggested workup items',
    )
    expect(TRIAGE_SYSTEM_PROMPT).not.toContain(
      'If the case is emergent (ED redirect), still suggest workup the ED should obtain',
    )
    expect(TRIAGE_SYSTEM_PROMPT).not.toContain(
      'An empty suggested_workup array is NOT acceptable',
    )
  })
})
