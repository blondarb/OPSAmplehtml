import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Next build-time runtime-secret boundary', () => {
  it('does not inline Historian database, Cognito, or relay secret values', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')

    expect(source).not.toMatch(/^\s*RDS_PASSWORD:\s*process\.env\.RDS_PASSWORD/m)
    expect(source).not.toMatch(/^\s*COGNITO_CLIENT_SECRET:\s*process\.env\.COGNITO_CLIENT_SECRET/m)
    expect(source).not.toMatch(/^\s*NOVA_RELAY_SHARED_SECRET:\s*process\.env\.NOVA_RELAY_SHARED_SECRET/m)
    expect(source).toMatch(/^\s*RDS_SECRET_ID:\s*process\.env\.RDS_SECRET_ID/m)
    expect(source).toMatch(/^\s*COGNITO_CLIENT_SECRET_ID:\s*process\.env\.COGNITO_CLIENT_SECRET_ID/m)
    expect(source).toMatch(/^\s*NOVA_RELAY_SECRET_ID:\s*process\.env\.NOVA_RELAY_SECRET_ID/m)
  })
})
