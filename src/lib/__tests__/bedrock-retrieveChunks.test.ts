import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AWS SDK before importing the module under test
vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => {
  const mockSend = vi.fn(async (_cmd: any) => ({
    retrievalResults: [
      {
        content: { text: 'Migraine red flags include thunderclap onset.' },
        location: { s3Location: { uri: 's3://kb/migraine-redflags.md' } },
        score: 0.92,
      },
      {
        content: { text: 'Aura without headache is rare but reported.' },
        location: { s3Location: { uri: 's3://kb/aura-variants.md' } },
        score: 0.81,
      },
    ],
  }))
  function BedrockAgentRuntimeClient(_config: any) {
    return { send: mockSend }
  }
  function RetrieveCommand(input: any) {
    return { input }
  }
  return { BedrockAgentRuntimeClient, RetrieveCommand }
})

import { retrieveChunksFromKB } from '@/lib/bedrock'

describe('retrieveChunksFromKB', () => {
  beforeEach(() => {
    process.env.BEDROCK_REGION = 'us-east-2'
  })

  it('returns chunk objects shaped {content, source, score}', async () => {
    const result = await retrieveChunksFromKB({
      knowledgeBaseId: 'T4W8S8RNMN',
      query: 'migraine red flags',
      maxResults: 5,
    })
    expect(result.chunks).toHaveLength(2)
    expect(result.chunks[0]).toMatchObject({
      content: expect.stringContaining('thunderclap'),
      source: expect.stringContaining('migraine-redflags'),
      score: 0.92,
    })
  })

  it('defaults maxResults to 5', async () => {
    const result = await retrieveChunksFromKB({
      knowledgeBaseId: 'T4W8S8RNMN',
      query: 'migraine red flags',
    })
    expect(result.chunks.length).toBeLessThanOrEqual(5)
  })
})
