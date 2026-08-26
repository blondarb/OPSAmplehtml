import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(
  resolve(process.cwd(), 'infrastructure/historian-qa/foundation.yaml'),
  'utf8',
)

const computeRole = template.slice(
  template.indexOf('  HistorianQaAmplifyComputeRole:'),
  template.indexOf('\nOutputs:'),
)

describe('Historian QA Amplify compute role', () => {
  it('invokes only the pinned Sonnet 4.6 inference profile used by the conductor and reviewer', () => {
    expect(computeRole).toContain('PolicyName: InvokeHistorianQaLiveReviewModelOnly')
    expect(computeRole.match(/Action: bedrock:InvokeModel/g)).toHaveLength(1)
    expect(computeRole).toContain(
      'bedrock:${AWS::Region}:${AWS::AccountId}:inference-profile/us.anthropic.claude-sonnet-4-6',
    )
    expect(computeRole).toContain(
      'bedrock:*::foundation-model/anthropic.claude-sonnet-4-6',
    )
    expect(computeRole).not.toContain('Action: bedrock:*')
    expect(computeRole).not.toContain('deepseek')
    expect(computeRole).not.toContain('haiku')
    expect(computeRole).not.toContain('claude-sonnet-5')
  })
})
