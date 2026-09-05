import { describe, expect, it } from 'vitest'
import { TRIAGE_SYSTEM_PROMPT } from '@/lib/triage/systemPrompt'
import { runEmergencyGateway } from '@/lib/triage/emergencyGateway'
import { fuseTriageBranches } from '@/lib/triage/ensemblePolicy'

describe('cauda equina emergency policy', () => {
  it('does not offer an outpatient exemption for being ambulatory', () => {
    expect(TRIAGE_SYSTEM_PROMPT).not.toContain('Cauda equina symptoms (if ambulatory and stable)')
    expect(TRIAGE_SYSTEM_PROMPT).toContain('Walking ability or apparent stability does not clear them for an outpatient wait')
  })
  it('retains emergency authority for new symptoms even if the scorer fails', () => {
    const gateway = runEmergencyGateway('SYNTHETIC ONLY. Severe low back pain radiating down both legs. New urinary retention and saddle numbness now. Patient remains ambulatory.')
    expect(gateway.carePathway).toBe('emergency_now')
    const fused = fuseTriageBranches({ gateway, safetyBranch: {status:'timeout',reason:'synthetic'}, scoringBranch:{status:'failed',reason:'synthetic'} })
    expect(fused.carePathway).toBe('emergency_now')
    expect(fused.schedulingLocked).toBe(true)
  })
})

describe('guideline-supported clearance boundaries',()=>{
 it('does not use prior ED attendance or walking ability as emergency clearance',()=>{
  expect(TRIAGE_SYSTEM_PROMPT).not.toContain('already ED-evaluated, workup incomplete')
  expect(TRIAGE_SYSTEM_PROMPT).not.toContain('Rapidly progressive weakness (days), patient still ambulatory')
  expect(TRIAGE_SYSTEM_PROMPT).toContain('an incomplete emergency workup is not outpatient clearance')
 })
})
