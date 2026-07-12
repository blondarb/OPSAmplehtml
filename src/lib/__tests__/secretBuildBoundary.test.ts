import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Next build secret boundary', () => {
  it('does not embed server credentials in next.config.ts', () => {
    const source = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')
    const forbiddenAssignments = [
      'OPENAI_API_KEY',
      'DEEPGRAM_API_KEY',
      'RDS_HOST',
      'RDS_PORT',
      'RDS_USER',
      'RDS_PASSWORD',
      'BEDROCK_ACCESS_KEY_ID',
      'BEDROCK_SECRET_ACCESS_KEY',
      'COGNITO_CLIENT_SECRET',
      'NOVA_RELAY_SHARED_SECRET',
    ]

    for (const name of forbiddenAssignments) {
      expect(source).not.toMatch(new RegExp(`^\\s*${name}\\s*:`, 'm'))
    }
  })

  it('exposes only the non-secret Nova cache TTL setting to the SSR runtime', () => {
    const source = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')

    expect(source).toMatch(
      /^\s*NOVA_RELAY_SECRET_CACHE_TTL_MS:\s*process\.env\.NOVA_RELAY_SECRET_CACHE_TTL_MS,/m,
    )
  })
})
