import { describe, expect, it, vi } from 'vitest'
import {
  assertHistorianQaTempLinkConfig,
  HistorianQaTempLinkError,
  runHistorianQaTempLink,
  type HistorianQaTempLinkConfig,
} from '../../scripts/historian-qa-issue-temp-link'

const config: HistorianQaTempLinkConfig = {
  enabled: true,
  dataClass: 'synthetic-only',
  appOrigin: 'https://historian-mvp-qa.d3ietjwgco4g2t.amplifyapp.com',
  cognitoClientId: 'ecjsa2ifjoj85konf3ts42gf5',
  cognitoRegion: 'us-east-2',
  username: 'historian-qa-clinician',
  password: 'fake-machine-password',
  databaseHost: 'historian-mvp-qa.cxe2y0soqa7a.us-east-2.rds.amazonaws.com',
  databasePort: 5432,
  databaseUser: 'fake-database-user',
  databasePassword: 'fake-database-password',
  databaseName: 'ops_amplehtml_historian_qa',
  outputSecretArn: 'arn:aws:secretsmanager:us-east-2:873370528823:secret:historian-mvp-qa-temp-link-output-Ab12xY',
  linkHours: 82,
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Historian QA temporary-link issuer', () => {
  it('stores one exact 82-hour synthetic invitation without logging any bearer or credential', async () => {
    const invitationUrl = `${config.appOrigin}/patient/historian/invite#token=fake-one-time-bearer`
    const expiresAt = '2026-08-26T03:00:00.000Z'
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : null
      if (url.startsWith('https://cognito-idp.')) {
        expect(body.AuthParameters.PASSWORD).toBe(config.password)
        return response(200, { AuthenticationResult: { IdToken: 'fake-id-token' } })
      }
      expect(url).toBe(`${config.appOrigin}/api/ai/historian/invites`)
      expect(new Headers(init?.headers).get('cookie')).toBe('id_token=fake-id-token')
      expect(body).toEqual({
        consultId: '20000000-0000-4000-8000-000000000001',
        replaceActive: true,
      })
      return response(200, {
        invitation: {
          id: 'invite-1',
          sessionId: 'session-1',
          url: invitationUrl,
        },
      })
    }) as unknown as typeof fetch

    const extendInviteExpiry = vi.fn(async () => expiresAt)
    const stored: Array<{ name: string; payload: string }> = []
    const emitted: string[] = []
    const result = await runHistorianQaTempLink(config, {
      fetchImpl: fetchMock,
      extendInviteExpiry,
      storeSecurePayload: async (runtimeConfig, payload) => {
        stored.push({ name: runtimeConfig.outputSecretArn, payload })
      },
      emit: (line) => emitted.push(line),
    })

    expect(result).toEqual({ expiresAt, linkHours: 82 })
    expect(extendInviteExpiry).toHaveBeenCalledWith(config, {
      inviteId: 'invite-1',
      sessionId: 'session-1',
      url: invitationUrl,
    })
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe(config.outputSecretArn)
    expect(JSON.parse(stored[0].payload)).toEqual({
      url: invitationUrl,
      expiresAt,
      dateOfBirth: '1985-01-15',
      dataClass: 'synthetic-only',
      oneTime: true,
      grantAfterRedemptionHours: 4,
    })
    expect(emitted).toEqual([
      'HISTORIAN_QA_TEMP_LINK_PASS expires_in_hours=82 output=encrypted_stack_secret',
    ])
    const safeOutput = emitted.join('\n')
    for (const forbidden of [
      config.password,
      config.databasePassword,
      'fake-id-token',
      'fake-one-time-bearer',
      invitationUrl,
    ]) {
      expect(safeOutput).not.toContain(forbidden)
    }
  })

  it('fails closed outside the exact QA target, duration, and encrypted output path', () => {
    for (const invalid of [
      { ...config, appOrigin: 'https://app.neuroplans.app' },
      { ...config, databaseName: 'ops_amplehtml' },
      { ...config, linkHours: 83 },
      { ...config, outputSecretArn: 'arn:aws:secretsmanager:us-east-2:873370528823:secret:another-secret-Ab12xY' },
      { ...config, dataClass: 'clinical' },
    ]) {
      expect(() => assertHistorianQaTempLinkConfig(invalid)).toThrow(
        HistorianQaTempLinkError,
      )
    }
  })

  it('never incorporates a rejected response body into the surfaced failure', async () => {
    const fetchMock = vi.fn(async () => response(401, {
      error: 'fake-machine-password fake-database-password fake-token',
    })) as unknown as typeof fetch

    await expect(runHistorianQaTempLink(config, {
      fetchImpl: fetchMock,
      emit: () => {},
    })).rejects.toMatchObject({
      code: 'COGNITO_AUTH_REJECTED',
      status: 401,
    })
  })
})
